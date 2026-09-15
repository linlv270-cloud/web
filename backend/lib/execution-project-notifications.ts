import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { getDb } from "./database";
import { getAccessibleExecutionProject } from "./execution-projects";
import type { AdminPrincipal } from "./types";

type Db = Pick<DatabaseSync, "prepare" | "exec">;

export type ProjectNotificationEvent =
  | "TASK_ASSIGNED"
  | "TASK_PUBLISHED"
  | "TASK_DATE_CHANGED"
  | "TASK_CANCELLED"
  | "TASK_BLOCKED"
  | "TASK_SUBMITTED"
  | "TASK_APPROVED"
  | "TASK_REJECTED"
  | "TASK_DUE_SOON"
  | "TASK_OVERDUE";

const schemaChecked = new WeakSet<object>();

export function ensureExecutionProjectNotificationSchema(db: Db = getDb()) {
  if (schemaChecked.has(db)) return;
  db.exec(`
    CREATE TABLE IF NOT EXISTS execution_admin_notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      recipient_admin_id INTEGER NOT NULL REFERENCES admin_accounts(id) ON DELETE CASCADE,
      project_id INTEGER NOT NULL REFERENCES execution_projects(id) ON DELETE CASCADE,
      task_id INTEGER REFERENCES execution_project_tasks(id) ON DELETE CASCADE,
      event_type TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT NOT NULL DEFAULT '',
      actor_admin_id INTEGER REFERENCES admin_accounts(id) ON DELETE SET NULL,
      dedupe_key TEXT NOT NULL UNIQUE,
      read_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS execution_admin_notifications_recipient_idx
      ON execution_admin_notifications(recipient_admin_id, read_at, created_at DESC);
    CREATE INDEX IF NOT EXISTS execution_admin_notifications_task_idx
      ON execution_admin_notifications(task_id, created_at DESC);
  `);
  schemaChecked.add(db);
}

function text(value: unknown, max = 2000) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function uniqueIds(values: unknown[]) {
  return [...new Set(values.map(Number).filter((value) => Number.isInteger(value) && value > 0))];
}

function notificationRow(row: Record<string, unknown>) {
  return {
    id: Number(row.id),
    projectId: Number(row.project_id),
    taskId: row.task_id === null ? null : Number(row.task_id),
    eventType: String(row.event_type),
    title: String(row.title),
    body: String(row.body || ""),
    actorAdminId: row.actor_admin_id === null ? null : Number(row.actor_admin_id),
    readAt: row.read_at ? String(row.read_at) : null,
    createdAt: String(row.created_at),
  };
}

export function createProjectNotifications(input: {
  projectId: number;
  taskId: number;
  eventType: ProjectNotificationEvent;
  title: string;
  body: string;
  recipientIds: number[];
  actorAdminId: number | null;
  dedupeSuffix?: string;
}, db: Db = getDb()) {
  ensureExecutionProjectNotificationSchema(db);
  const recipients = uniqueIds(input.recipientIds);
  const insert = db.prepare(
    `INSERT OR IGNORE INTO execution_admin_notifications(
      recipient_admin_id, project_id, task_id, event_type, title, body, actor_admin_id, dedupe_key
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  let created = 0;
  for (const recipientId of recipients) {
    const result = insert.run(
      recipientId,
      input.projectId,
      input.taskId,
      input.eventType,
      text(input.title, 200),
      text(input.body),
      input.actorAdminId,
      `${input.eventType}:${input.taskId}:${recipientId}:${text(input.dedupeSuffix, 120)}`,
    );
    created += Number(result.changes || 0);
  }
  return created;
}

export function listProjectNotifications(
  principal: AdminPrincipal,
  input: { unreadOnly?: boolean; limit?: number } = {},
  db: Db = getDb(),
) {
  ensureExecutionProjectNotificationSchema(db);
  if (!principal.id || principal.role === "super") return { items: [], unreadCount: 0 };
  const limit = Math.min(Math.max(Number(input.limit || 30), 1), 100);
  const unread = input.unreadOnly ? " AND n.read_at IS NULL" : "";
  const rows = db.prepare(
    `SELECT n.*, p.name AS project_name, p.code AS project_code, t.title AS task_title
     FROM execution_admin_notifications n
     JOIN execution_projects p ON p.id = n.project_id
     LEFT JOIN execution_project_tasks t ON t.id = n.task_id
     WHERE n.recipient_admin_id = ?${unread}
     ORDER BY n.created_at DESC, n.id DESC LIMIT ?`,
  ).all(principal.id, limit) as Array<Record<string, unknown>>;
  const unreadCount = Number((db.prepare(
    "SELECT COUNT(*) AS count FROM execution_admin_notifications WHERE recipient_admin_id = ? AND read_at IS NULL",
  ).get(principal.id) as { count: number }).count);
  return {
    items: rows.map((row) => ({ ...notificationRow(row), projectName: String(row.project_name), projectCode: String(row.project_code), taskTitle: row.task_title ? String(row.task_title) : "" })),
    unreadCount,
  };
}

export function markProjectNotificationRead(notificationId: number, principal: AdminPrincipal, db: Db = getDb()) {
  ensureExecutionProjectNotificationSchema(db);
  if (!principal.id || principal.role === "super") return false;
  const result = db.prepare(
    "UPDATE execution_admin_notifications SET read_at = COALESCE(read_at, CURRENT_TIMESTAMP) WHERE id = ? AND recipient_admin_id = ?",
  ).run(notificationId, principal.id);
  return Number(result.changes) > 0;
}

export function markAllProjectNotificationsRead(principal: AdminPrincipal, db: Db = getDb()) {
  ensureExecutionProjectNotificationSchema(db);
  if (!principal.id || principal.role === "super") return 0;
  const result = db.prepare(
    "UPDATE execution_admin_notifications SET read_at = CURRENT_TIMESTAMP WHERE recipient_admin_id = ? AND read_at IS NULL",
  ).run(principal.id);
  return Number(result.changes || 0);
}

export function canViewNotificationTask(projectId: number, principal: AdminPrincipal, db: Db = getDb()) {
  return Boolean(getAccessibleExecutionProject(projectId, principal, db));
}

export function notificationValues(row: Record<string, unknown>): SQLInputValue[] {
  return [Number(row.project_id), Number(row.task_id), String(row.event_type)];
}
