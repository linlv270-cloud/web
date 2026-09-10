import { all, newReference, one, run } from "./database";
import { cleanText, contentSafety } from "./security";
import type { AdminPrincipal } from "./types";
import type { ReviewEntityType, ReviewMessage, ReviewThread } from "./mini-program-types";

type ReviewThreadRow = {
  id: number;
  reference: string;
  entity_type: ReviewEntityType;
  entity_id: number;
  creator_id: number;
  creator_name: string;
  subject: string;
  status: "open" | "resolved";
  creator_unread_count: number;
  admin_unread_count: number;
  last_message_at: string;
  created_at: string;
  updated_at: string;
};

type ReviewMessageRow = {
  id: number;
  thread_id: number;
  sender_type: ReviewMessage["senderType"];
  sender_id: number | null;
  sender_label: string;
  body: string;
  created_at: string;
};

function threadQuery(where = "") {
  return `SELECT t.*, COALESCE(NULLIF(c.brand_name, ''), NULLIF(c.user_name, ''), 'TDE新遇官') AS creator_name
    FROM review_threads t JOIN creators c ON c.id = t.creator_id ${where}`;
}

function messagesForThread(threadId: number) {
  return all<ReviewMessageRow>(
    "SELECT * FROM review_messages WHERE thread_id = ? ORDER BY created_at, id",
    threadId,
  ).map((row): ReviewMessage => ({
    id: row.id,
    threadId: row.thread_id,
    senderType: row.sender_type,
    senderId: row.sender_id,
    senderLabel: row.sender_label,
    body: row.body,
    createdAt: row.created_at,
  }));
}

function mapThread(row: ReviewThreadRow, withMessages = false): ReviewThread {
  return {
    id: row.id,
    reference: row.reference,
    entityType: row.entity_type,
    entityId: row.entity_id,
    creatorId: row.creator_id,
    creatorName: row.creator_name,
    subject: row.subject,
    status: row.status,
    creatorUnreadCount: row.creator_unread_count,
    adminUnreadCount: row.admin_unread_count,
    lastMessageAt: row.last_message_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    messages: withMessages ? messagesForThread(row.id) : undefined,
  };
}

function threadById(threadId: number, withMessages = true) {
  const row = one<ReviewThreadRow>(threadQuery("WHERE t.id = ?"), threadId);
  return row ? mapThread(row, withMessages) : null;
}

export function ensureReviewThread(input: {
  entityType: ReviewEntityType;
  entityId: number;
  creatorId: number;
  subject: string;
}) {
  const subject = cleanText(input.subject, 100);
  if (!subject) throw new Error("审核沟通主题不能为空");
  run(
    `INSERT OR IGNORE INTO review_threads(reference, entity_type, entity_id, creator_id, subject)
     VALUES (?, ?, ?, ?, ?)`,
    newReference("SH"),
    input.entityType,
    input.entityId,
    input.creatorId,
    subject,
  );
  run(
    `UPDATE review_threads SET creator_id = ?, subject = ?, updated_at = CURRENT_TIMESTAMP
     WHERE entity_type = ? AND entity_id = ?`,
    input.creatorId,
    subject,
    input.entityType,
    input.entityId,
  );
  const row = one<ReviewThreadRow>(
    threadQuery("WHERE t.entity_type = ? AND t.entity_id = ?"),
    input.entityType,
    input.entityId,
  );
  if (!row) throw new Error("审核沟通记录创建失败");
  return mapThread(row, true);
}

function appendMessage(
  threadId: number,
  senderType: ReviewMessage["senderType"],
  senderId: number | null,
  senderLabel: string,
  bodyInput: unknown,
  notifyCreator: boolean,
) {
  const thread = threadById(threadId, false);
  if (!thread) throw new Error("审核沟通不存在");
  const body = cleanText(bodyInput, 1000);
  if (!body) throw new Error("请输入沟通内容");
  const safety = contentSafety(body);
  if (safety) throw new Error(safety);
  run(
    `INSERT INTO review_messages(thread_id, sender_type, sender_id, sender_label, body)
     VALUES (?, ?, ?, ?, ?)`,
    threadId,
    senderType,
    senderId,
    cleanText(senderLabel, 40),
    body,
  );
  if (senderType === "creator") {
    run(
      `UPDATE review_threads SET status = 'open', admin_unread_count = admin_unread_count + 1,
       last_message_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      threadId,
    );
  } else {
    run(
      `UPDATE review_threads SET creator_unread_count = creator_unread_count + 1,
       last_message_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      threadId,
    );
    if (notifyCreator) {
      run(
        `INSERT INTO inbox_messages(recipient_id, kind, subject, body, href)
         VALUES (?, 'review', ?, ?, ?)`,
        thread.creatorId,
        thread.subject,
        body,
        `/pages/review-thread/review-thread?id=${threadId}`,
      );
    }
  }
  return threadById(threadId, true)!;
}

export function addCreatorReviewSubmission(threadId: number, creatorId: number, body: unknown) {
  const thread = threadById(threadId, false);
  if (!thread || thread.creatorId !== creatorId) throw new Error("审核沟通不存在或不能回复");
  return appendMessage(threadId, "creator", creatorId, "TDE新遇官", body, false);
}

export function addAdminReviewReply(threadId: number, principal: AdminPrincipal, body: unknown) {
  const thread = threadById(threadId, false);
  if (!thread) throw new Error("审核沟通不存在");
  if (principal.role === "subadmin") {
    const inScope = one("SELECT id FROM creators WHERE id = ? AND manager_admin_id = ?", thread.creatorId, principal.id || 0);
    if (!inScope) throw new Error("该账号不能回复此审核沟通");
  }
  return appendMessage(threadId, "admin", principal.id, principal.label, body, true);
}

export function addReviewStatusMessage(
  threadId: number,
  principal: AdminPrincipal,
  body: unknown,
  resolved = false,
) {
  const updated = addAdminReviewReply(threadId, principal, body);
  if (resolved) run("UPDATE review_threads SET status = 'resolved', updated_at = CURRENT_TIMESTAMP WHERE id = ?", threadId);
  return threadById(updated.id, true)!;
}

export function listCreatorReviewThreads(creatorId: number) {
  return all<ReviewThreadRow>(
    `${threadQuery("WHERE t.creator_id = ?")} ORDER BY t.last_message_at DESC, t.id DESC`,
    creatorId,
  ).map((row) => mapThread(row, false));
}

export function getCreatorReviewThread(creatorId: number, threadId: number) {
  const row = one<ReviewThreadRow>(threadQuery("WHERE t.id = ? AND t.creator_id = ?"), threadId, creatorId);
  if (!row) throw new Error("审核沟通不存在");
  run("UPDATE review_threads SET creator_unread_count = 0 WHERE id = ?", threadId);
  return threadById(threadId, true)!;
}

export function listAdminReviewThreads(principal: AdminPrincipal) {
  const where = principal.role === "subadmin" ? "WHERE c.manager_admin_id = ?" : "";
  const values = principal.role === "subadmin" ? [principal.id || 0] : [];
  return all<ReviewThreadRow>(
    `${threadQuery(where)} ORDER BY t.last_message_at DESC, t.id DESC`,
    ...values,
  ).map((row) => mapThread(row, true));
}

export function markAdminReviewThreadRead(threadId: number, principal: AdminPrincipal) {
  const threads = listAdminReviewThreads(principal);
  if (!threads.some((thread) => thread.id === threadId)) throw new Error("审核沟通不存在或不能查看");
  run("UPDATE review_threads SET admin_unread_count = 0 WHERE id = ?", threadId);
  return threadById(threadId, true)!;
}
