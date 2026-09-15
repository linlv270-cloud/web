import { DatabaseSync } from "node:sqlite";
import { getDb } from "./database";
import { getAccessibleExecutionProject } from "./execution-projects";
import { ensureExecutionProjectNotificationSchema } from "./execution-project-notifications";
import type { AdminPrincipal } from "./types";

type Db = Pick<DatabaseSync, "prepare" | "exec">;

export function listMyProjectWork(
  principal: AdminPrincipal,
  input: { scope?: string; status?: string; projectId?: number; limit?: number } = {},
  db: Db = getDb(),
) {
  ensureExecutionProjectNotificationSchema(db);
  const limit = Math.min(Math.max(Number(input.limit || 100), 1), 200);
  const predicates = ["t.deleted_at IS NULL", "t.status != 'DRAFT'"];
  const values: Array<number | string> = [];
  if (principal.role !== "super") {
    if (!principal.id) return { items: [] };
    predicates.push("(t.owner_id = ? OR t.approver_id = ? OR EXISTS (SELECT 1 FROM execution_task_collaborators c WHERE c.task_id = t.id AND c.user_id = ?))");
    values.push(principal.id, principal.id, principal.id);
  }
  if (input.scope === "review") predicates.push("t.approver_id = ? AND t.status = 'REVIEW'");
  else if (input.scope === "owner") predicates.push("t.owner_id = ?");
  else if (input.scope === "collaborator") predicates.push("EXISTS (SELECT 1 FROM execution_task_collaborators c2 WHERE c2.task_id = t.id AND c2.user_id = ?)");
  if (input.scope === "review" || input.scope === "owner" || input.scope === "collaborator") values.push(principal.id || -1);
  if (input.status) {
    predicates.push("t.status = ?");
    values.push(input.status);
  }
  if (input.projectId) {
    predicates.push("t.project_id = ?");
    values.push(input.projectId);
  }
  const rows = db.prepare(
    `SELECT t.*, p.name AS project_name, p.code AS project_code, ph.name AS phase_name,
      a.name AS owner_name, a.phone AS owner_phone,
      CASE WHEN t.due_at IS NOT NULL AND datetime(t.due_at) < datetime('now') AND t.status NOT IN ('DONE','CANCELLED') THEN 1 ELSE 0 END AS overdue,
      CASE WHEN t.approver_id = ? AND t.status = 'REVIEW' THEN 1 ELSE 0 END AS needs_review
     FROM execution_project_tasks t
     JOIN execution_projects p ON p.id = t.project_id
     LEFT JOIN execution_project_phases ph ON ph.id = t.phase_id
     LEFT JOIN admin_accounts a ON a.id = t.owner_id
     WHERE ${predicates.join(" AND ")}
     ORDER BY overdue DESC, CASE WHEN t.due_at IS NULL THEN 1 ELSE 0 END, t.due_at ASC, t.id DESC
     LIMIT ?`,
  ).all(principal.id || -1, ...values, limit) as Array<Record<string, unknown>>;
  const items = rows.filter((row) => principal.role === "super" || getAccessibleExecutionProject(Number(row.project_id), principal, db)).map((row) => ({
    id: Number(row.id),
    projectId: Number(row.project_id),
    projectName: String(row.project_name),
    projectCode: String(row.project_code),
    phaseName: row.phase_name ? String(row.phase_name) : "",
    title: String(row.title),
    status: String(row.status),
    ownerId: row.owner_id === null ? null : Number(row.owner_id),
    ownerName: row.owner_name ? String(row.owner_name) : "未指定",
    dueAt: row.due_at ? String(row.due_at) : null,
    startAt: row.start_at ? String(row.start_at) : null,
    overdue: Number(row.overdue) === 1,
    needsReview: Number(row.needs_review) === 1,
    isKey: Number(row.is_key) === 1,
    updatedAt: String(row.updated_at),
  }));
  return { items };
}
