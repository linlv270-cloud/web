import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { getDb } from "./database";
import { getExecutionProject, getProjectMember, insertProjectActivityLog } from "./execution-projects";
import { canProjectAction } from "./project-permissions";
import { ensureExecutionProjectFileSchema } from "./execution-project-files";
import type { AdminPrincipal } from "./types";

export const RECORD_TYPES = ["COMMUNICATION", "DECISION", "RISK", "ISSUE", "CHANGE"] as const;
export type ProjectRecordType = (typeof RECORD_TYPES)[number];
export const RECORD_STATUSES = ["OPEN", "MONITORING", "IN_PROGRESS", "RESOLVED", "CLOSED", "CONFIRMED", "PROPOSED", "APPROVED", "REJECTED", "IMPLEMENTED"] as const;

type Db = Pick<DatabaseSync, "prepare" | "exec">;

export class RecordCenterError extends Error {
  status: number;
  fieldErrors?: Record<string, string>;

  constructor(message: string, status = 400, fieldErrors?: Record<string, string>) {
    super(message);
    this.status = status;
    this.fieldErrors = fieldErrors;
  }
}

export function recordErrorResponse(error: unknown) {
  if (error instanceof RecordCenterError) {
    return Response.json({
      error: error.message,
      ...(error.fieldErrors ? { fieldErrors: error.fieldErrors } : {}),
    }, { status: error.status, headers: { "cache-control": "no-store" } });
  }
  return Response.json({ error: error instanceof Error ? error.message : "项目记录操作失败" }, { status: 400 });
}

function rows<T>(statement: { all: (...values: SQLInputValue[]) => unknown[] }, ...values: SQLInputValue[]) {
  return statement.all(...values) as T[];
}

function text(value: unknown, max = 5000) {
  return typeof value === "string" || typeof value === "number" ? String(value).trim().slice(0, max) : "";
}

function dateBoundary(value: string | undefined, end = false): string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return value || "";
  if (!end) return `${value} 00:00:00`;
  const next = new Date(`${value}T00:00:00.000Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return `${next.toISOString().slice(0, 10)} 00:00:00`;
}

function id(value: unknown) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function ids(value: unknown) {
  return [...new Set((Array.isArray(value) ? value : []).map(id).filter((item): item is number => item !== null))];
}

function savepoint<T>(db: Db, operation: () => T) {
  const name = `project_records_${Date.now()}_${Math.random().toString(16).slice(2)}`.replaceAll(".", "");
  db.exec(`SAVEPOINT ${name}`);
  try {
    const result = operation();
    db.exec(`RELEASE SAVEPOINT ${name}`);
    return result;
  } catch (error) {
    db.exec(`ROLLBACK TO SAVEPOINT ${name}`);
    db.exec(`RELEASE SAVEPOINT ${name}`);
    throw error;
  }
}

function access(projectId: number, principal: AdminPrincipal, action: "VIEW_RECORDS" | "CREATE_RECORD" | "EDIT_RECORD", db: Db) {
  const project = getExecutionProject(projectId, db);
  if (!project) throw new RecordCenterError("项目不存在", 404);
  if (project.status === "ARCHIVED" && action !== "VIEW_RECORDS") throw new RecordCenterError("归档项目为只读，不能修改项目记录", 409);
  const membership = principal.role === "super" || principal.id === null
    ? null
    : getProjectMember(projectId, principal.id, db);
  const permission = canProjectAction(
    principal,
    membership ? { userId: membership.user_id, role: membership.role, active: !membership.removed_at } : null,
    action,
  );
  if (!permission.allowed) throw new RecordCenterError(permission.reason || "无权操作项目记录", 403);
  return { project, membership };
}

function recordRow(projectId: number, recordId: number, db: Db) {
  return db.prepare(
    `SELECT r.*, a.name AS creator_name, a.phone AS creator_phone, o.name AS owner_name, o.phone AS owner_phone,
      t.code AS task_code, t.title AS task_title, m.code AS milestone_code, m.name AS milestone_name
     FROM execution_project_records r
     LEFT JOIN admin_accounts a ON a.id = r.created_by_admin_id
     LEFT JOIN admin_accounts o ON o.id = r.owner_admin_id
     LEFT JOIN execution_project_tasks t ON t.id = r.task_id
     LEFT JOIN execution_project_milestones m ON m.id = r.milestone_id
     WHERE r.id = ? AND r.project_id = ? AND r.deleted_at IS NULL`,
  ).get(recordId, projectId) as Record<string, unknown> | undefined;
}

function view(row: Record<string, unknown>, activity = false) {
  let payload: Record<string, unknown> = {};
  try { payload = JSON.parse(String(row.payload_json || "{}")) as Record<string, unknown>; } catch { payload = {}; }
  let attachmentVersionIds: number[] = [];
  try { attachmentVersionIds = JSON.parse(String(row.attachment_version_ids || "[]")) as number[]; } catch { attachmentVersionIds = []; }
  return {
    ...row,
    id: Number(row.id),
    record_type: activity ? "ACTIVITY" : row.record_type,
    title: activity ? String(payload.title || row.action || "") : String(row.title || ""),
    content: activity ? String(payload.summary || payload.reason || "") : String(row.content || ""),
    attachment_version_ids: attachmentVersionIds,
    payload,
    readOnly: activity,
  };
}

function validateReferences(projectId: number, input: { taskId?: number | null; milestoneId?: number | null; attachmentVersionIds?: number[] }, db: Db) {
  const taskId = id(input.taskId);
  const milestoneId = id(input.milestoneId);
  const attachmentVersionIds = [...new Set(input.attachmentVersionIds || [])];
  if (taskId && !db.prepare("SELECT id FROM execution_project_tasks WHERE id = ? AND project_id = ? AND deleted_at IS NULL").get(taskId, projectId))
    throw new RecordCenterError("关联任务不属于当前项目", 400);
  if (milestoneId && !db.prepare("SELECT id FROM execution_project_milestones WHERE id = ? AND project_id = ?").get(milestoneId, projectId))
    throw new RecordCenterError("关联里程碑不属于当前项目", 400);
  if (attachmentVersionIds.length) {
    const placeholders = attachmentVersionIds.map(() => "?").join(",");
    const found = Number((db.prepare(
      `SELECT COUNT(*) AS count FROM execution_file_versions v
       JOIN execution_file_assets a ON a.id = v.asset_id
       WHERE a.project_id = ? AND v.id IN (${placeholders})`,
    ).get(projectId, ...attachmentVersionIds) as { count: number }).count);
    if (found !== attachmentVersionIds.length) throw new RecordCenterError("附件版本必须属于当前项目", 400);
  }
  return { taskId, milestoneId, attachmentVersionIds };
}

function statusAllowed(type: ProjectRecordType, status: string) {
  const statuses: Record<ProjectRecordType, string[]> = {
    COMMUNICATION: ["OPEN", "CLOSED"],
    DECISION: ["OPEN", "CONFIRMED", "CLOSED"],
    RISK: ["OPEN", "MONITORING", "CLOSED"],
    ISSUE: ["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"],
    CHANGE: ["PROPOSED", "APPROVED", "REJECTED", "IMPLEMENTED"],
  };
  return statuses[type].includes(status);
}

function ensureEditableType(type: string): asserts type is ProjectRecordType {
  if (!RECORD_TYPES.includes(type as ProjectRecordType)) throw new RecordCenterError("ACTIVITY 为系统只读记录，不能由前端创建或修改", 400);
}

export function listProjectRecords(projectId: number, principal: AdminPrincipal, filters: {
  page: number;
  pageSize: number;
  type?: string;
  status?: string;
  ownerId?: number;
  from?: string;
  to?: string;
  keyword?: string;
}, db: Db = getDb()) {
  ensureExecutionProjectFileSchema(db);
  access(projectId, principal, "VIEW_RECORDS", db);
  const where = ["r.project_id = ?", "r.deleted_at IS NULL"];
  const values: SQLInputValue[] = [projectId];
  if (filters.type && filters.type !== "ACTIVITY") { where.push("r.record_type = ?"); values.push(filters.type); }
  if (filters.status) { where.push("r.status = ?"); values.push(filters.status); }
  if (filters.ownerId) { where.push("r.owner_admin_id = ?"); values.push(filters.ownerId); }
  if (filters.from) { where.push("r.occurred_at >= ?"); values.push(dateBoundary(filters.from)); }
  if (filters.to) { where.push("r.occurred_at < ?"); values.push(dateBoundary(filters.to, true)); }
  if (filters.keyword) { where.push("(r.title LIKE ? OR r.content LIKE ?)"); values.push(`%${filters.keyword}%`, `%${filters.keyword}%`); }
  const recordRows = filters.type === "ACTIVITY" ? [] : rows<Record<string, unknown>>(
    db.prepare(`SELECT r.*, a.name AS creator_name, a.phone AS creator_phone, o.name AS owner_name, o.phone AS owner_phone,
      t.code AS task_code, t.title AS task_title, m.code AS milestone_code, m.name AS milestone_name
      FROM execution_project_records r
      LEFT JOIN admin_accounts a ON a.id = r.created_by_admin_id
      LEFT JOIN admin_accounts o ON o.id = r.owner_admin_id
      LEFT JOIN execution_project_tasks t ON t.id = r.task_id
      LEFT JOIN execution_project_milestones m ON m.id = r.milestone_id
      WHERE ${where.join(" AND ")} ORDER BY r.occurred_at DESC, r.id DESC`),
    ...values,
  );
  const activityRows = filters.type && filters.type !== "ACTIVITY"
    ? []
    : rows<Record<string, unknown>>(
      db.prepare("SELECT l.*, l.action, l.entity_type, l.entity_id FROM execution_project_activity_logs l WHERE l.project_id = ? ORDER BY l.created_at DESC, l.id DESC"),
      projectId,
    );
  const combined = [
    ...recordRows.map((row) => ({ ...view(row), sortAt: String(row.occurred_at || row.created_at || "") })),
    ...activityRows.map((row) => ({ ...view({ ...row, payload_json: row.payload_json, created_at: row.created_at }, true), sortAt: String(row.created_at || "") })),
  ].sort((a, b) => b.sortAt.localeCompare(a.sortAt));
  const total = combined.length;
  const offset = (filters.page - 1) * filters.pageSize;
  return { items: combined.slice(offset, offset + filters.pageSize), page: filters.page, pageSize: filters.pageSize, total, totalPages: Math.ceil(total / filters.pageSize) };
}

export function getProjectRecord(projectId: number, recordId: number, principal: AdminPrincipal, db: Db = getDb()) {
  ensureExecutionProjectFileSchema(db);
  access(projectId, principal, "VIEW_RECORDS", db);
  const row = recordRow(projectId, recordId, db);
  if (!row) throw new RecordCenterError("项目记录不存在", 404);
  return view(row);
}

export function createProjectRecord(projectId: number, principal: AdminPrincipal, input: Record<string, unknown>, db: Db = getDb()) {
  ensureExecutionProjectFileSchema(db);
  const { membership } = access(projectId, principal, "CREATE_RECORD", db);
  const type = text(input.type || input.recordType, 40).toUpperCase();
  ensureEditableType(type);
  if (principal.role !== "super" && membership?.role === "MEMBER" && !["COMMUNICATION", "RISK", "ISSUE"].includes(type))
    throw new RecordCenterError("成员只能创建沟通、风险或问题记录", 403);
  const title = text(input.title, 240);
  const content = text(input.content, 10000);
  if (!title) throw new RecordCenterError("记录标题不能为空", 400, { title: "请填写记录标题" });
  if (!content) throw new RecordCenterError("记录内容不能为空", 400, { content: "请填写记录内容" });
  const status = text(input.status, 40).toUpperCase() || (type === "CHANGE" ? "PROPOSED" : "OPEN");
  if (!statusAllowed(type, status)) throw new RecordCenterError("记录状态无效", 400, { status: "请选择该类型允许的状态" });
  const refs = validateReferences(projectId, {
    taskId: id(input.taskId),
    milestoneId: id(input.milestoneId),
    attachmentVersionIds: ids(input.attachmentVersionIds),
  }, db);
  const occurredAt = text(input.occurredAt, 80) || new Date().toISOString();
  const payload = { ...input, type, recordType: type, title, content, status, ...refs };
  const created = savepoint(db, () => {
    const result = db.prepare(
      `INSERT INTO execution_project_records(
        project_id, record_type, title, content, status, owner_admin_id, occurred_at, task_id, milestone_id,
        attachment_version_ids, payload_json, created_by_admin_id, updated_by_admin_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(projectId, type, title, content, status, id(input.ownerAdminId), occurredAt, refs.taskId, refs.milestoneId, JSON.stringify(refs.attachmentVersionIds), JSON.stringify(payload), principal.id, principal.id);
    const recordId = Number(result.lastInsertRowid);
    insertProjectActivityLog(db, {
      projectId, actorAdminId: principal.id, action: "RECORD_CREATED", entityType: "PROJECT_RECORD", entityId: recordId,
      payload: { after: payload },
    });
    return recordId;
  });
  return getProjectRecord(projectId, created, principal, db);
}

export function updateProjectRecord(projectId: number, recordId: number, principal: AdminPrincipal, input: Record<string, unknown>, db: Db = getDb()) {
  ensureExecutionProjectFileSchema(db);
  const current = recordRow(projectId, recordId, db);
  if (!current) throw new RecordCenterError("项目记录不存在", 404);
  const { membership } = access(projectId, principal, "EDIT_RECORD", db);
  const type = String(current.record_type);
  if (type === "ACTIVITY") throw new RecordCenterError("Activity 为系统只读记录，不能修改", 400);
  const manager = principal.role === "super" || membership?.role === "PROJECT_MANAGER";
  const closed = ["CLOSED", "RESOLVED", "CONFIRMED", "APPROVED", "REJECTED", "IMPLEMENTED"].includes(String(current.status));
  if (!manager && (Number(current.created_by_admin_id) !== principal.id || closed)) throw new RecordCenterError("成员只能修改自己创建且未关闭的记录", 403);
  if (!manager && !["COMMUNICATION", "RISK", "ISSUE"].includes(type)) throw new RecordCenterError("成员不能修改该类型记录", 403);
  const nextTitle = input.title === undefined ? String(current.title || "") : text(input.title, 240);
  const nextContent = input.content === undefined ? String(current.content || "") : text(input.content, 10000);
  const nextStatus = input.status === undefined ? String(current.status || "OPEN") : text(input.status, 40).toUpperCase();
  if (!nextTitle || !nextContent) throw new RecordCenterError("记录标题和内容不能为空", 400);
  if (!statusAllowed(type as ProjectRecordType, nextStatus)) throw new RecordCenterError("记录状态无效", 400);
  const refs = validateReferences(projectId, {
    taskId: input.taskId === undefined ? Number(current.task_id) || null : id(input.taskId),
    milestoneId: input.milestoneId === undefined ? Number(current.milestone_id) || null : id(input.milestoneId),
    attachmentVersionIds: input.attachmentVersionIds === undefined ? JSON.parse(String(current.attachment_version_ids || "[]")) as number[] : ids(input.attachmentVersionIds),
  }, db);
  const before = view(current);
  const payload = { ...input, type, recordType: type, title: nextTitle, content: nextContent, status: nextStatus, ...refs };
  db.prepare(
    `UPDATE execution_project_records SET title = ?, content = ?, status = ?, owner_admin_id = ?, occurred_at = ?,
      task_id = ?, milestone_id = ?, attachment_version_ids = ?, payload_json = ?, updated_at = CURRENT_TIMESTAMP,
      updated_by_admin_id = ? WHERE id = ? AND project_id = ?`,
  ).run(
    nextTitle,
    nextContent,
    nextStatus,
    (input.ownerAdminId === undefined ? current.owner_admin_id : id(input.ownerAdminId)) as SQLInputValue,
    text(input.occurredAt, 80) || String(current.occurred_at || ""),
    refs.taskId,
    refs.milestoneId,
    JSON.stringify(refs.attachmentVersionIds),
    JSON.stringify(payload),
    principal.id,
    recordId,
    projectId,
  );
  insertProjectActivityLog(db, {
    projectId, actorAdminId: principal.id, action: "RECORD_UPDATED", entityType: "PROJECT_RECORD", entityId: recordId,
    payload: { before, after: payload },
  });
  return getProjectRecord(projectId, recordId, principal, db);
}
