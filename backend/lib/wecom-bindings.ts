import { all, one, run } from "./database";
import { cleanText } from "./security";
import type { AdminPrincipal, CreatorWecomBinding, WecomBindingStatus } from "./types";
import { resolveWecomUserId } from "./wecom";

type BindingRow = {
  id: number;
  creator_id: number;
  wecom_user_id: string;
  open_kfid: string;
  contact_url: string;
  status: Exclude<WecomBindingStatus, "unbound">;
  review_reason: string;
  reviewed_by: string;
  reviewed_at: string | null;
  verified_at: string | null;
  last_error: string;
  created_at: string;
  updated_at: string;
};

function mapBinding(row: BindingRow): CreatorWecomBinding {
  return {
    id: row.id,
    creatorId: row.creator_id,
    wecomUserId: row.wecom_user_id,
    openKfid: row.open_kfid,
    contactUrl: row.contact_url,
    status: row.status,
    reviewReason: row.review_reason,
    reviewedBy: row.reviewed_by,
    reviewedAt: row.reviewed_at,
    verifiedAt: row.verified_at,
    lastError: row.last_error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function emptyBinding(creatorId: number): CreatorWecomBinding {
  return {
    id: null,
    creatorId,
    wecomUserId: "",
    openKfid: "",
    contactUrl: "",
    status: "unbound",
    reviewReason: "",
    reviewedBy: "",
    reviewedAt: null,
    verifiedAt: null,
    lastError: "",
    createdAt: null,
    updatedAt: null,
  };
}

export function getCreatorWecomBinding(creatorId: number) {
  const row = one<BindingRow>("SELECT * FROM creator_wecom_bindings WHERE creator_id = ?", creatorId);
  return row ? mapBinding(row) : emptyBinding(creatorId);
}

export function listCreatorWecomBindings(creatorIds?: number[]) {
  if (creatorIds && !creatorIds.length) return [];
  const rows = creatorIds
    ? all<BindingRow>(`SELECT * FROM creator_wecom_bindings WHERE creator_id IN (${creatorIds.map(() => "?").join(",")}) ORDER BY updated_at DESC`, ...creatorIds)
    : all<BindingRow>("SELECT * FROM creator_wecom_bindings ORDER BY updated_at DESC");
  return rows.map(mapBinding);
}

function bindingSnapshot(binding: CreatorWecomBinding | null) {
  if (!binding) return {};
  return {
    id: binding.id,
    creatorId: binding.creatorId,
    wecomUserId: binding.wecomUserId,
    openKfid: binding.openKfid,
    contactUrl: binding.contactUrl,
    status: binding.status,
    reviewReason: binding.reviewReason,
    reviewedBy: binding.reviewedBy,
    reviewedAt: binding.reviewedAt,
    verifiedAt: binding.verifiedAt,
    lastError: binding.lastError,
  };
}

function audit(creatorId: number, principal: AdminPrincipal, action: string, before: CreatorWecomBinding | null, after: CreatorWecomBinding | null) {
  run(
    `INSERT INTO creator_wecom_binding_audit(creator_id, actor, action, before_snapshot, after_snapshot)
     VALUES (?, ?, ?, ?, ?)`,
    creatorId,
    cleanText(principal.label, 40),
    action,
    JSON.stringify(bindingSnapshot(before)),
    JSON.stringify(bindingSnapshot(after)),
  );
}

function saveBindingFailure(creatorId: number, principal: AdminPrincipal, before: CreatorWecomBinding, error: unknown) {
  const message = cleanText(error instanceof Error ? error.message : "企业微信通知绑定失败", 300);
  if (before.status === "approved" && before.wecomUserId) {
    run(
      `UPDATE creator_wecom_bindings SET reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP,
       last_error = ?, updated_at = CURRENT_TIMESTAMP WHERE creator_id = ?`,
      cleanText(principal.label, 40),
      message,
      creatorId,
    );
    const after = getCreatorWecomBinding(creatorId);
    audit(creatorId, principal, "rebind_failed", before, after);
    return message;
  }
  run(
    `INSERT INTO creator_wecom_bindings(creator_id, status, reviewed_by, reviewed_at, last_error)
     VALUES (?, 'error', ?, CURRENT_TIMESTAMP, ?)
     ON CONFLICT(creator_id) DO UPDATE SET status = 'error', reviewed_by = excluded.reviewed_by,
       reviewed_at = CURRENT_TIMESTAMP, last_error = excluded.last_error, updated_at = CURRENT_TIMESTAMP`,
    creatorId,
    cleanText(principal.label, 40),
    message,
  );
  const after = getCreatorWecomBinding(creatorId);
  audit(creatorId, principal, "bind_failed", before, after);
  return message;
}

export async function approveCreatorWecomBinding(creatorId: number, principal: AdminPrincipal, userIdInput?: unknown) {
  const creator = one<{ id: number; phone: string }>(
    "SELECT id, phone FROM creators WHERE id = ?",
    creatorId,
  );
  if (!creator) throw new Error("新遇官不存在");
  const before = getCreatorWecomBinding(creatorId);
  try {
    const requestedUserId = cleanText(userIdInput, 64);
    if (requestedUserId && !/^[A-Za-z0-9_.@-]{1,64}$/.test(requestedUserId))
      throw new Error("企业微信成员标识不正确");
    const userId = requestedUserId || await resolveWecomUserId(creator.phone);
    run(
      `INSERT INTO creator_wecom_bindings(
        creator_id, wecom_user_id, status, review_reason, reviewed_by,
        reviewed_at, verified_at, last_error
       ) VALUES (?, ?, 'approved', '', ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, '')
       ON CONFLICT(creator_id) DO UPDATE SET wecom_user_id = excluded.wecom_user_id,
         status = 'approved', review_reason = '', reviewed_by = excluded.reviewed_by, reviewed_at = CURRENT_TIMESTAMP,
         verified_at = CURRENT_TIMESTAMP, last_error = '', updated_at = CURRENT_TIMESTAMP`,
      creatorId,
      userId,
      cleanText(principal.label, 40),
    );
    const after = getCreatorWecomBinding(creatorId);
    audit(creatorId, principal, before.status === "approved" ? "rebind" : "approve", before, after);
    return after;
  } catch (error) {
    const message = saveBindingFailure(creatorId, principal, before, error);
    throw new Error(message);
  }
}

export function rejectCreatorWecomBinding(creatorId: number, principal: AdminPrincipal, reasonInput: unknown) {
  const before = getCreatorWecomBinding(creatorId);
  const reason = cleanText(reasonInput, 300);
  if (!reason) throw new Error("请填写否决原因");
  run(
    `INSERT INTO creator_wecom_bindings(creator_id, status, review_reason, reviewed_by, reviewed_at)
     VALUES (?, 'rejected', ?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(creator_id) DO UPDATE SET status = 'rejected', review_reason = excluded.review_reason,
       reviewed_by = excluded.reviewed_by, reviewed_at = CURRENT_TIMESTAMP, last_error = '', updated_at = CURRENT_TIMESTAMP`,
    creatorId,
    reason,
    cleanText(principal.label, 40),
  );
  const after = getCreatorWecomBinding(creatorId);
  audit(creatorId, principal, "reject", before, after);
  return after;
}

export async function disableCreatorWecomBinding(creatorId: number, principal: AdminPrincipal) {
  const before = getCreatorWecomBinding(creatorId);
  if (!before.id) throw new Error("该新遇官尚未绑定企业微信通知成员");
  run(
    `UPDATE creator_wecom_bindings SET status = 'disabled', review_reason = '', reviewed_by = ?,
     reviewed_at = CURRENT_TIMESTAMP, last_error = '', updated_at = CURRENT_TIMESTAMP WHERE creator_id = ?`,
    cleanText(principal.label, 40),
    creatorId,
  );
  const after = getCreatorWecomBinding(creatorId);
  audit(creatorId, principal, "disable", before, after);
  return after;
}

export async function deleteCreatorWecomBinding(creatorId: number, principal: AdminPrincipal) {
  if (principal.role !== "super") throw new Error("只有超级管理员可以删除企业微信通知绑定");
  const before = getCreatorWecomBinding(creatorId);
  if (!before.id) throw new Error("该新遇官尚未绑定企业微信通知成员");
  run("DELETE FROM creator_wecom_bindings WHERE creator_id = ?", creatorId);
  audit(creatorId, principal, "delete", before, null);
  return emptyBinding(creatorId);
}
