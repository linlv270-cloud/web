import { createHash, randomUUID } from "node:crypto";
import path from "node:path";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { deleteObject, getObject, putObject } from "./storage";
import { getDb } from "./database";
import { getExecutionProject, getProjectMember, insertProjectActivityLog } from "./execution-projects";
import { canProjectAction } from "./project-permissions";
import type { AdminPrincipal } from "./types";

export const FILE_STATUSES = [
  "DRAFT",
  "IN_REVIEW",
  "REVISION_REQUIRED",
  "APPROVED",
  "SUPERSEDED",
  "FINAL",
  "ARCHIVED",
] as const;
export type FileStatus = (typeof FILE_STATUSES)[number];

export const MAX_PROJECT_FILE_BYTES = 50 * 1024 * 1024;

const MIME_BY_EXTENSION: Record<string, string[]> = {
  ".pdf": ["application/pdf"],
  ".png": ["image/png"],
  ".jpg": ["image/jpeg"],
  ".jpeg": ["image/jpeg"],
  ".webp": ["image/webp"],
  ".svg": ["image/svg+xml", "text/xml", "application/xml"],
  ".docx": ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
  ".xlsx": ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
  ".pptx": ["application/vnd.openxmlformats-officedocument.presentationml.presentation"],
  ".zip": ["application/zip", "application/x-zip-compressed"],
};

type Db = Pick<DatabaseSync, "prepare" | "exec">;

export class FileCenterError extends Error {
  status: number;
  fieldErrors?: Record<string, string>;

  constructor(message: string, status = 400, fieldErrors?: Record<string, string>) {
    super(message);
    this.status = status;
    this.fieldErrors = fieldErrors;
  }
}

export function fileErrorResponse(error: unknown) {
  if (error instanceof FileCenterError) {
    return Response.json({
      error: error.message,
      ...(error.fieldErrors ? { fieldErrors: error.fieldErrors } : {}),
    }, { status: error.status, headers: { "cache-control": "no-store" } });
  }
  return Response.json({ error: error instanceof Error ? error.message : "文件操作失败" }, { status: 400 });
}

function rows<T>(statement: { all: (...values: SQLInputValue[]) => unknown[] }, ...values: SQLInputValue[]) {
  return statement.all(...values) as T[];
}

function text(value: unknown, max = 1000) {
  return typeof value === "string" || typeof value === "number" ? String(value).trim().slice(0, max) : "";
}

function positiveId(value: unknown) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function savepoint<T>(db: Db, operation: () => T) {
  const name = `project_files_${Date.now()}_${Math.random().toString(16).slice(2)}`.replaceAll(".", "");
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

function ensureColumn(db: Db, table: string, name: string, definition: string) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  if (!columns.some((column) => column.name === name)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${definition}`);
}

export function ensureExecutionProjectFileSchema(db: Db = getDb()) {
  ensureColumn(db, "execution_file_assets", "phase_id", "INTEGER REFERENCES execution_project_phases(id) ON DELETE SET NULL");
  ensureColumn(db, "execution_file_assets", "archived_at", "TEXT");
  ensureColumn(db, "execution_file_versions", "version_note", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "execution_file_versions", "status", "TEXT NOT NULL DEFAULT 'DRAFT'");
  ensureColumn(db, "execution_task_approvals", "file_version_ids", "TEXT NOT NULL DEFAULT '[]'");
  ensureColumn(db, "execution_task_evidence", "submission_number", "INTEGER NOT NULL DEFAULT 1");
  ensureColumn(db, "execution_project_records", "title", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "execution_project_records", "content", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "execution_project_records", "status", "TEXT NOT NULL DEFAULT 'OPEN'");
  ensureColumn(db, "execution_project_records", "owner_admin_id", "INTEGER");
  ensureColumn(db, "execution_project_records", "occurred_at", "TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP");
  ensureColumn(db, "execution_project_records", "task_id", "INTEGER");
  ensureColumn(db, "execution_project_records", "milestone_id", "INTEGER");
  ensureColumn(db, "execution_project_records", "attachment_version_ids", "TEXT NOT NULL DEFAULT '[]'");
  ensureColumn(db, "execution_project_records", "updated_at", "TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP");
  ensureColumn(db, "execution_project_records", "updated_by_admin_id", "INTEGER");
  ensureColumn(db, "execution_project_records", "deleted_at", "TEXT");
}

function access(projectId: number, principal: AdminPrincipal, action: "VIEW_FILES" | "UPLOAD_FILES" | "MANAGE_FILE_STATUS" | "ARCHIVE_FILES", db: Db) {
  const project = getExecutionProject(projectId, db);
  if (!project) throw new FileCenterError("项目不存在", 404);
  if (project.status === "ARCHIVED" && action !== "VIEW_FILES") throw new FileCenterError("归档项目为只读，不能修改项目文件", 409);
  const membership = principal.role === "super" || principal.id === null
    ? null
    : getProjectMember(projectId, principal.id, db);
  const permission = canProjectAction(
    principal,
    membership ? { userId: membership.user_id, role: membership.role, active: !membership.removed_at } : null,
    action,
  );
  if (!permission.allowed) throw new FileCenterError(permission.reason || "无权操作项目文件", 403);
  return { project, membership };
}

function extension(name: string) {
  return path.extname(name).toLowerCase();
}

function safeOriginalName(name: string) {
  const base = path.basename(name || "attachment");
  if (!base || base === "." || base === ".." || /[\u0000-\u001f\u007f]/.test(base) || /[\\/]/.test(name)) {
    throw new FileCenterError("文件名不安全", 400, { file: "文件名不能包含路径或控制字符" });
  }
  return base.slice(0, 240);
}

function contentKind(body: Buffer) {
  if (body.subarray(0, 5).toString("ascii") === "%PDF-") return "pdf";
  if (body.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "png";
  if (body.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) return "jpeg";
  if (body.subarray(0, 12).subarray(0, 4).toString("ascii") === "RIFF" &&
      body.subarray(8, 12).toString("ascii") === "WEBP") return "webp";
  if (body.subarray(0, 4).toString("ascii") === "PK\u0003\u0004") return "zip";
  const prefix = body.subarray(0, 512).toString("utf8").replace(/^\uFEFF/, "").trimStart().toLowerCase();
  if (prefix.startsWith("<svg") || prefix.startsWith("<?xml") && prefix.includes("<svg")) return "svg";
  return "unknown";
}

function validateUpload(name: string, mimeType: string, body: Buffer) {
  const safeName = safeOriginalName(name);
  const ext = extension(safeName);
  const allowedMimes = MIME_BY_EXTENSION[ext];
  if (!allowedMimes) throw new FileCenterError("不支持的文件类型", 400, { file: "仅支持 PDF、图片、SVG、Office 文档和 ZIP" });
  if (body.length > MAX_PROJECT_FILE_BYTES) throw new FileCenterError("文件超过 50 MiB 上限", 413, { file: "文件大小不能超过 50 MiB" });
  const declared = (mimeType || "application/octet-stream").split(";")[0].trim().toLowerCase();
  if (!allowedMimes.includes(declared)) throw new FileCenterError("声明的文件类型与扩展名不匹配", 400, { file: "请检查文件类型" });
  const kind = contentKind(body);
  const expected = ext === ".pdf" ? "pdf"
    : ext === ".png" ? "png"
      : [".jpg", ".jpeg"].includes(ext) ? "jpeg"
        : ext === ".webp" ? "webp"
          : ext === ".svg" ? "svg"
            : "zip";
  if (kind !== expected) throw new FileCenterError("文件内容与声明类型不匹配", 400, { file: "无法识别该文件的实际类型" });
  return { safeName, ext, declared };
}

function projectReference(projectId: number, taskId: number | null, phaseId: number | null, db: Db) {
  if (phaseId && !db.prepare("SELECT id FROM execution_project_phases WHERE id = ? AND project_id = ?").get(phaseId, projectId))
    throw new FileCenterError("阶段不属于当前项目", 400);
  if (taskId && !db.prepare("SELECT id FROM execution_project_tasks WHERE id = ? AND project_id = ? AND deleted_at IS NULL").get(taskId, projectId))
    throw new FileCenterError("任务不属于当前项目", 400);
}

function assetRow(projectId: number, assetId: number, db: Db) {
  return db.prepare(
    `SELECT fa.*, p.name AS project_name, ph.code AS phase_code, ph.name AS phase_name,
      t.code AS task_code, t.title AS task_title
     FROM execution_file_assets fa
     JOIN execution_projects p ON p.id = fa.project_id
     LEFT JOIN execution_project_phases ph ON ph.id = fa.phase_id
     LEFT JOIN execution_project_tasks t ON t.id = fa.task_id
     WHERE fa.id = ? AND fa.project_id = ? AND fa.deleted_at IS NULL`,
  ).get(assetId, projectId) as Record<string, unknown> | undefined;
}

function versionRows(assetId: number, db: Db) {
  return rows<Record<string, unknown>>(
    db.prepare(
      `SELECT fv.*, a.name AS asset_name, a.project_id, a.task_id
       FROM execution_file_versions fv JOIN execution_file_assets a ON a.id = fv.asset_id
       WHERE fv.asset_id = ? ORDER BY fv.version_number DESC, fv.id DESC`,
    ),
    assetId,
  );
}

function versionView(row: Record<string, unknown>) {
  return {
    ...row,
    id: Number(row.id),
    asset_id: Number(row.asset_id),
    version_number: Number(row.version_number),
    size_bytes: Number(row.size_bytes || 0),
    is_current: Number(row.version_number) === Number(row.current_version_number || 0),
  };
}

export function listProjectFiles(projectId: number, principal: AdminPrincipal, filters: {
  page: number;
  pageSize: number;
  phaseId?: number;
  taskId?: number;
  assetType?: string;
  status?: string;
  keyword?: string;
}, db: Db = getDb()) {
  ensureExecutionProjectFileSchema(db);
  access(projectId, principal, "VIEW_FILES", db);
  const where = ["fa.project_id = ?", "fa.deleted_at IS NULL"];
  const values: SQLInputValue[] = [projectId];
  if (filters.phaseId) { where.push("fa.phase_id = ?"); values.push(filters.phaseId); }
  if (filters.taskId) { where.push("fa.task_id = ?"); values.push(filters.taskId); }
  if (filters.assetType) { where.push("fa.asset_type = ?"); values.push(filters.assetType); }
  if (filters.keyword) { where.push("fa.name LIKE ?"); values.push(`%${filters.keyword}%`); }
  if (filters.status) { where.push("COALESCE(fv.status, 'DRAFT') = ?"); values.push(filters.status); }
  const whereSql = where.join(" AND ");
  const total = Number((db.prepare(
    `SELECT COUNT(*) AS count FROM execution_file_assets fa
     LEFT JOIN execution_file_versions fv ON fv.asset_id = fa.id AND fv.version_number = fa.current_version_number
     WHERE ${whereSql}`,
  ).get(...values) as { count: number }).count);
  const offset = (filters.page - 1) * filters.pageSize;
  const items = rows<Record<string, unknown>>(
    db.prepare(
      `SELECT fa.*, ph.code AS phase_code, ph.name AS phase_name, t.code AS task_code, t.title AS task_title,
        fv.id AS current_version_id, fv.version_number, fv.status, fv.original_name, fv.mime_type,
        fv.size_bytes, fv.version_note, fv.uploaded_by_admin_id, fv.created_at AS version_created_at,
        COALESCE(a.name, a.phone, '') AS uploader_name
       FROM execution_file_assets fa
       LEFT JOIN execution_project_phases ph ON ph.id = fa.phase_id
       LEFT JOIN execution_project_tasks t ON t.id = fa.task_id
       LEFT JOIN execution_file_versions fv ON fv.asset_id = fa.id AND fv.version_number = fa.current_version_number
       LEFT JOIN admin_accounts a ON a.id = fv.uploaded_by_admin_id
       WHERE ${whereSql}
       ORDER BY fa.updated_at DESC, fa.id DESC LIMIT ? OFFSET ?`,
    ),
    ...values,
    filters.pageSize,
    offset,
  );
  return {
    items,
    page: filters.page,
    pageSize: filters.pageSize,
    total,
    totalPages: Math.ceil(total / filters.pageSize),
  };
}

export function getProjectFile(projectId: number, assetId: number, principal: AdminPrincipal, db: Db = getDb()) {
  ensureExecutionProjectFileSchema(db);
  access(projectId, principal, "VIEW_FILES", db);
  const asset = assetRow(projectId, assetId, db);
  if (!asset) throw new FileCenterError("文件不存在", 404);
  return { asset, versions: versionRows(assetId, db).map(versionView) };
}

export async function createProjectFile(projectId: number, principal: AdminPrincipal, input: {
  name: string;
  assetType?: string;
  phaseId?: number | null;
  taskId?: number | null;
  versionNote?: string;
  originalName: string;
  mimeType: string;
  body: Buffer;
}, db: Db = getDb()) {
  ensureExecutionProjectFileSchema(db);
  const { membership } = access(projectId, principal, "UPLOAD_FILES", db);
  const project = getExecutionProject(projectId, db);
  if (!project) throw new FileCenterError("项目不存在", 404);
  const taskId = positiveId(input.taskId);
  const phaseId = positiveId(input.phaseId);
  projectReference(projectId, taskId, phaseId, db);
  const checked = validateUpload(input.originalName, input.mimeType, input.body);
  const assetName = text(input.name, 240) || checked.safeName;
  const assetType = text(input.assetType, 50).toUpperCase() || checked.ext.slice(1).toUpperCase();
  if (principal.role !== "super" && membership?.role === "OBSERVER") throw new FileCenterError("观察员不能上传文件", 403);
  let storageKey = "";
  let assetId = 0;
  try {
    storageKey = `projects/${projectId}/files/${randomUUID()}${checked.ext}`;
    await putObject(storageKey, input.body);
    return savepoint(db, () => {
      assetId = Number((db.prepare(
        `INSERT INTO execution_file_assets(project_id, phase_id, task_id, name, asset_type, current_version_number, created_by_admin_id)
         VALUES (?, ?, ?, ?, ?, 1, ?)`,
      ).run(projectId, phaseId, taskId, assetName, assetType, principal.id)).lastInsertRowid);
      const checksum = createHash("sha256").update(input.body).digest("hex");
      const version = db.prepare(
        `INSERT INTO execution_file_versions(
          asset_id, version_number, storage_key, original_name, mime_type, size_bytes, checksum, version_note,
          status, uploaded_by_admin_id
        ) VALUES (?, 1, ?, ?, ?, ?, ?, ?, 'DRAFT', ?)`,
      ).run(assetId, storageKey, checked.safeName, checked.declared, input.body.length, checksum, text(input.versionNote, 1000), principal.id);
      insertProjectActivityLog(db, {
        projectId, actorAdminId: principal.id, action: "FILE_CREATED", entityType: "FILE_ASSET", entityId: assetId,
        payload: { assetId, versionId: Number(version.lastInsertRowid), originalName: checked.safeName, status: "DRAFT" },
      });
      return getProjectFile(projectId, assetId, principal, db);
    });
  } catch (error) {
    if (storageKey) await deleteObject(storageKey).catch(() => undefined);
    if (assetId) db.prepare("DELETE FROM execution_file_assets WHERE id = ?").run(assetId);
    throw error;
  }
}

export async function addProjectFileVersion(projectId: number, assetId: number, principal: AdminPrincipal, input: {
  versionNote?: string;
  originalName: string;
  mimeType: string;
  body: Buffer;
  replacementReason?: string;
}, db: Db = getDb()) {
  ensureExecutionProjectFileSchema(db);
  const { membership } = access(projectId, principal, "UPLOAD_FILES", db);
  const asset = assetRow(projectId, assetId, db);
  if (!asset) throw new FileCenterError("文件不存在", 404);
  if (asset.archived_at) throw new FileCenterError("文件已归档，不能继续上传版本", 409);
  const current = db.prepare(
    "SELECT * FROM execution_file_versions WHERE asset_id = ? AND version_number = ?",
  ).get(assetId, asset.current_version_number as SQLInputValue) as Record<string, unknown> | undefined;
  const isManager = principal.role === "super" || membership?.role === "PROJECT_MANAGER";
  if (current?.status === "FINAL" && !isManager) throw new FileCenterError("替代 FINAL 文件需要项目经理或超级管理员权限", 403);
  if (current?.status === "FINAL" && !text(input.replacementReason, 2000))
    throw new FileCenterError("替代 FINAL 文件必须填写原因", 400, { replacementReason: "请填写替代原因" });
  if (principal.role !== "super" && membership?.role === "OBSERVER") throw new FileCenterError("观察员不能上传文件", 403);
  const checked = validateUpload(input.originalName, input.mimeType, input.body);
  let storageKey = "";
  try {
    const latest = db.prepare(
      "SELECT COALESCE(MAX(version_number), 0) AS version FROM execution_file_versions WHERE asset_id = ?",
    ).get(assetId) as { version: number };
    const versionNumber = Number(latest.version) + 1;
    storageKey = `projects/${projectId}/files/${assetId}/${randomUUID()}${checked.ext}`;
    await putObject(storageKey, input.body);
    return savepoint(db, () => {
      const checksum = createHash("sha256").update(input.body).digest("hex");
      const inserted = db.prepare(
        `INSERT INTO execution_file_versions(
          asset_id, version_number, storage_key, original_name, mime_type, size_bytes, checksum, version_note,
          status, uploaded_by_admin_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'DRAFT', ?)`,
      ).run(assetId, versionNumber, storageKey, checked.safeName, checked.declared, input.body.length, text(input.versionNote, 1000), principal.id);
      db.prepare(
        "UPDATE execution_file_versions SET status = 'SUPERSEDED' WHERE asset_id = ? AND version_number = ? AND status != 'ARCHIVED'",
      ).run(assetId, asset.current_version_number as SQLInputValue);
      db.prepare(
        "UPDATE execution_file_assets SET current_version_number = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
      ).run(versionNumber, assetId);
      const action = current?.status === "FINAL" ? "FINAL_FILE_SUPERSEDED" : "FILE_VERSION_ADDED";
      insertProjectActivityLog(db, {
        projectId, actorAdminId: principal.id, action, entityType: "FILE_ASSET", entityId: assetId,
        payload: {
          assetId, versionId: Number(inserted.lastInsertRowid), versionNumber,
          previousVersionNumber: asset.current_version_number,
          replacementReason: text(input.replacementReason, 2000),
        },
      });
      return getProjectFile(projectId, assetId, principal, db);
    });
  } catch (error) {
    if (storageKey) await deleteObject(storageKey).catch(() => undefined);
    throw error;
  }
}

function canMemberChangeVersion(version: Record<string, unknown>, asset: Record<string, unknown>, principal: AdminPrincipal, membership: { role: string } | null, db: Db) {
  if (principal.role === "super" || membership?.role === "PROJECT_MANAGER") return true;
  return membership?.role === "MEMBER" &&
    (Number(version.uploaded_by_admin_id) === principal.id ||
      (asset.task_id && Number((db.prepare("SELECT owner_id FROM execution_project_tasks WHERE id = ?").get(String(asset.task_id)) as { owner_id?: number } | undefined)?.owner_id) === principal.id));
}

export function changeProjectFileVersionStatus(projectId: number, assetId: number, versionId: number, principal: AdminPrincipal, input: {
  status: FileStatus;
  comment?: string;
}, db: Db = getDb()) {
  ensureExecutionProjectFileSchema(db);
  const { membership } = access(projectId, principal, "VIEW_FILES", db);
  const asset = assetRow(projectId, assetId, db);
  if (!asset) throw new FileCenterError("文件不存在", 404);
  const version = db.prepare(
    "SELECT * FROM execution_file_versions WHERE id = ? AND asset_id = ?",
  ).get(versionId, assetId) as Record<string, unknown> | undefined;
  if (!version) throw new FileCenterError("文件版本不存在", 404);
  if (!FILE_STATUSES.includes(input.status)) throw new FileCenterError("文件状态无效", 400);
  const manager = principal.role === "super" || membership?.role === "PROJECT_MANAGER";
  if (["FINAL", "ARCHIVED"].includes(input.status) && !manager) throw new FileCenterError("最终版和归档状态只能由项目经理或超级管理员设置", 403);
  if (!manager && !canMemberChangeVersion(version, asset, principal, membership || null, db)) throw new FileCenterError("只能操作自己上传或本人任务相关文件", 403);
  const allowed: Record<FileStatus, FileStatus[]> = {
    DRAFT: ["IN_REVIEW", "ARCHIVED"],
    IN_REVIEW: ["APPROVED", "REVISION_REQUIRED", "ARCHIVED"],
    REVISION_REQUIRED: ["IN_REVIEW", "ARCHIVED"],
    APPROVED: ["FINAL", "ARCHIVED"],
    SUPERSEDED: [],
    FINAL: ["ARCHIVED"],
    ARCHIVED: [],
  };
  if (String(version.status) !== input.status && !allowed[String(version.status) as FileStatus]?.includes(input.status))
    throw new FileCenterError(`文件状态不能从 ${version.status} 变更为 ${input.status}`, 409);
  db.prepare("UPDATE execution_file_versions SET status = ? WHERE id = ?").run(input.status, versionId);
  insertProjectActivityLog(db, {
    projectId, actorAdminId: principal.id, action: "FILE_STATUS_CHANGED", entityType: "FILE_VERSION", entityId: versionId,
    payload: { assetId, versionId, before: version.status, after: input.status, comment: text(input.comment, 2000) },
  });
  return getProjectFile(projectId, assetId, principal, db);
}

export function archiveProjectFile(projectId: number, assetId: number, principal: AdminPrincipal, input: { reason?: string }, db: Db = getDb()) {
  ensureExecutionProjectFileSchema(db);
  access(projectId, principal, "ARCHIVE_FILES", db);
  const asset = assetRow(projectId, assetId, db);
  if (!asset) throw new FileCenterError("文件不存在", 404);
  if (!text(input.reason, 2000)) throw new FileCenterError("归档必须填写原因", 400);
  db.prepare("UPDATE execution_file_assets SET archived_at = CURRENT_TIMESTAMP, deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(assetId);
  db.prepare("UPDATE execution_file_versions SET status = 'ARCHIVED' WHERE asset_id = ? AND status != 'SUPERSEDED'").run(assetId);
  insertProjectActivityLog(db, {
    projectId, actorAdminId: principal.id, action: "FILE_ARCHIVED", entityType: "FILE_ASSET", entityId: assetId,
    payload: { reason: text(input.reason, 2000) },
  });
  return { archived: true };
}

export function getProjectFileDownload(projectId: number, assetId: number, versionId: number, principal: AdminPrincipal, db: Db = getDb()) {
  ensureExecutionProjectFileSchema(db);
  access(projectId, principal, "VIEW_FILES", db);
  const asset = assetRow(projectId, assetId, db);
  const version = db.prepare(
    `SELECT fv.* FROM execution_file_versions fv
     JOIN execution_file_assets fa ON fa.id = fv.asset_id
     WHERE fa.project_id = ? AND fa.id = ? AND fv.id = ?`,
  ).get(projectId, assetId, versionId) as Record<string, unknown> | undefined;
  if (!asset || !version) throw new FileCenterError("文件版本不存在", 404);
  return { asset, version, objectPromise: getObject(String(version.storage_key)) };
}
