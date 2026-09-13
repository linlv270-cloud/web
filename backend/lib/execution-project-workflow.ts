import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { getDb } from "./database";
import {
  findDependencyCycle,
  validateTaskTransition,
  type StateTransitionActor,
} from "./execution-project-state";
import { canApproveTask, canProjectAction, type ProjectAction } from "./project-permissions";
import {
  getAccessibleExecutionProject,
  getExecutionProject,
  getProjectMember,
  insertProjectActivityLog,
  listProjectMembers,
  type ProjectMemberRow,
} from "./execution-projects";
import { ensureExecutionProjectFileSchema } from "./execution-project-files";
import type { AdminPrincipal, AdminAccount } from "./types";
import type { ProjectRole, TaskStatus } from "./execution-project-types";

type Db = Pick<DatabaseSync, "prepare" | "exec">;

const WORKFLOW_COLUMNS: Array<[string, string]> = [
  ["functional_label", "TEXT NOT NULL DEFAULT ''"],
  ["objective", "TEXT NOT NULL DEFAULT ''"],
  ["start_at", "TEXT"],
  ["estimated_hours", "REAL"],
  ["priority", "TEXT NOT NULL DEFAULT 'NORMAL'"],
  ["trigger_text", "TEXT NOT NULL DEFAULT ''"],
  ["preconditions", "TEXT NOT NULL DEFAULT ''"],
  ["inputs", "TEXT NOT NULL DEFAULT ''"],
  ["steps", "TEXT NOT NULL DEFAULT '[]'"],
  ["submission_number", "INTEGER NOT NULL DEFAULT 1"],
  ["result_summary", "TEXT NOT NULL DEFAULT ''"],
  ["evidence_links", "TEXT NOT NULL DEFAULT '[]'"],
  ["file_version_ids", "TEXT NOT NULL DEFAULT '[]'"],
  ["no_file_evidence_reason", "TEXT NOT NULL DEFAULT ''"],
  ["submitted_by_admin_id", "INTEGER"],
  ["decided_by_admin_id", "INTEGER"],
  ["decided_at", "TEXT"],
];

const workflowSchemaChecked = new WeakSet<object>();

export function ensureExecutionProjectWorkflowSchema(db: Db = getDb()) {
  if (workflowSchemaChecked.has(db)) return;
  for (const [column, definition] of WORKFLOW_COLUMNS) {
    const table = column === "functional_label"
      ? "execution_project_members"
      : ["submission_number", "result_summary", "evidence_links", "file_version_ids", "no_file_evidence_reason", "submitted_by_admin_id", "decided_by_admin_id", "decided_at"].includes(column)
        ? "execution_task_approvals"
        : "execution_project_tasks";
    const columns = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
    if (!columns.some((item) => item.name === column)) {
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    }
  }
  workflowSchemaChecked.add(db);
}

function rows<T>(statement: { all: (...values: SQLInputValue[]) => unknown[] }, ...values: SQLInputValue[]) {
  return statement.all(...values) as T[];
}

function parseJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== "string" || !value.trim()) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function text(value: unknown, max = 10000) {
  return typeof value === "string" || typeof value === "number"
    ? String(value).trim().slice(0, max)
    : "";
}

function id(value: unknown) {
  const result = Number(value);
  return Number.isInteger(result) && result > 0 ? result : null;
}

function ids(value: unknown) {
  const values = Array.isArray(value) ? value : [];
  return [...new Set(values.map(id).filter((item): item is number => item !== null))];
}

function validUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function savepoint<T>(db: Db, operation: () => T) {
  const name = `project_workflow_${Date.now()}_${Math.random().toString(16).slice(2)}`.replaceAll(".", "");
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

function membership(projectId: number, principal: AdminPrincipal, db: Db) {
  if (principal.role === "super" || principal.id === null) return null;
  return getProjectMember(projectId, principal.id, db) || null;
}

function access(projectId: number, principal: AdminPrincipal, action: ProjectAction, db: Db, task?: { ownerId?: number | null; approverId?: number | null }) {
  const project = getExecutionProject(projectId, db);
  if (!project) return { project: null, member: null, permission: { allowed: false, reason: "项目不存在" } };
  if (project.status === "ARCHIVED" && action !== "VIEW_PROJECT") {
    return { project, member: membership(projectId, principal, db), permission: { allowed: false, reason: "归档项目为只读，不能修改项目数据" } };
  }
  const member = membership(projectId, principal, db);
  return {
    project,
    member,
    permission: canProjectAction(
      principal,
      member ? { userId: member.user_id, role: member.role, active: !member.removed_at } : null,
      action,
      task,
    ),
  };
}

function account(db: Db, accountId: number) {
  return db.prepare(
    "SELECT id, name, phone, status FROM admin_accounts WHERE id = ?",
  ).get(accountId) as (AdminAccount & { status: string }) | undefined;
}

function activeAccount(db: Db, accountId: number) {
  const result = account(db, accountId);
  return result && result.status === "active" ? result : null;
}

function activeMember(projectId: number, userId: number, db: Db) {
  return db.prepare(
    "SELECT * FROM execution_project_members WHERE project_id = ? AND user_id = ? AND removed_at IS NULL",
  ).get(projectId, userId) as ProjectMemberRow | undefined;
}

function assertProjectMember(projectId: number, userId: number, db: Db) {
  if (!activeMember(projectId, userId, db)) throw new WorkflowError("该账号不是项目成员", 400);
}

function taskRow(projectId: number, taskId: number, db: Db) {
  return db.prepare(
    "SELECT * FROM execution_project_tasks WHERE project_id = ? AND id = ? AND deleted_at IS NULL",
  ).get(projectId, taskId) as Record<string, unknown> | undefined;
}

function taskSnapshot(task: Record<string, unknown>) {
  return {
    id: task.id,
    code: task.code,
    title: task.title,
    status: task.status,
    ownerId: task.owner_id,
    approverId: task.approver_id,
    dueAt: task.due_at,
    priority: task.priority,
    deliverables: task.deliverables,
    acceptanceCriteria: task.acceptance_criteria,
    dependencyTaskIds: [],
  };
}

function taskView(projectId: number, task: Record<string, unknown>, db: Db) {
  ensureExecutionProjectFileSchema(db);
  const collaborators = rows<Record<string, unknown>>(
    db.prepare(
      `SELECT c.user_id, c.created_at, a.name, a.phone
       FROM execution_task_collaborators c JOIN admin_accounts a ON a.id = c.user_id
       WHERE c.task_id = ? ORDER BY c.user_id`,
    ),
    Number(task.id),
  );
  const dependencies = rows<Record<string, unknown>>(
    db.prepare(
      `SELECT d.depends_on_task_id, t.code, t.title, t.status
       FROM execution_task_dependencies d JOIN execution_project_tasks t ON t.id = d.depends_on_task_id
       WHERE d.task_id = ? ORDER BY d.depends_on_task_id`,
    ),
    Number(task.id),
  );
  const approvals = rows<Record<string, unknown>>(
    db.prepare(
      `SELECT aa.*, a.name AS approver_name, a.phone AS approver_phone
       FROM execution_task_approvals aa JOIN admin_accounts a ON a.id = aa.approver_id
       WHERE aa.task_id = ? ORDER BY aa.id DESC`,
    ),
    Number(task.id),
  );
  const logs = rows<Record<string, unknown>>(
    db.prepare(
      `SELECT l.*, a.name AS actor_name, a.phone AS actor_phone
       FROM execution_project_activity_logs l LEFT JOIN admin_accounts a ON a.id = l.actor_admin_id
       WHERE l.project_id = ? AND l.entity_type = 'TASK' AND l.entity_id = ?
       ORDER BY l.id DESC`,
    ),
    projectId,
    Number(task.id),
  );
  return {
    ...task,
    steps: parseJson(task.steps, []),
    collaborators,
    dependencies,
    dependencyTaskIds: dependencies.map((item) => Number(item.depends_on_task_id)),
    approvals: approvals.map((item) => ({
      ...item,
      payload: parseJson(item.payload_json, {}),
      fileVersionIds: parseJson(item.file_version_ids, []),
      evidence: rows<Record<string, unknown>>(
        db.prepare("SELECT * FROM execution_task_evidence WHERE task_id = ? AND submission_number = ? ORDER BY id"),
        Number(task.id),
        Number(item.submission_number || 1),
      ),
    })),
    history: logs.map((item) => ({ ...item, payload: parseJson(item.payload_json, {}) })),
  };
}

export class WorkflowError extends Error {
  status: number;
  fieldErrors?: Record<string, string>;
  taskErrors?: Array<{ taskId: number; code?: string; title?: string; error: string }>;

  constructor(message: string, status = 400, options: { fieldErrors?: Record<string, string>; taskErrors?: WorkflowError["taskErrors"] } = {}) {
    super(message);
    this.status = status;
    this.fieldErrors = options.fieldErrors;
    this.taskErrors = options.taskErrors;
  }
}

export function workflowErrorResponse(error: unknown) {
  if (error instanceof WorkflowError) {
    return Response.json({
      error: error.message,
      ...(error.fieldErrors ? { fieldErrors: error.fieldErrors } : {}),
      ...(error.taskErrors ? { taskErrors: error.taskErrors } : {}),
    }, { status: error.status, headers: { "cache-control": "no-store" } });
  }
  return Response.json({ error: error instanceof Error ? error.message : "请求失败" }, { status: 400 });
}

export function listMembers(projectId: number, principal: AdminPrincipal, db: Db = getDb()) {
  ensureExecutionProjectWorkflowSchema(db);
  const result = access(projectId, principal, "VIEW_PROJECT", db);
  if (!result.project) throw new WorkflowError("项目不存在", 404);
  if (!result.permission.allowed) throw new WorkflowError(result.permission.reason || "无权查看项目成员", 403);
  return rows<Record<string, unknown>>(
    db.prepare(
      `SELECT pm.*, a.name, a.phone, a.status,
        (SELECT COUNT(*) FROM execution_project_tasks t
          WHERE t.project_id = pm.project_id AND t.owner_id = pm.user_id AND t.deleted_at IS NULL
            AND t.status NOT IN ('DONE', 'CANCELLED')) AS active_task_count,
        (SELECT COUNT(*) FROM execution_project_tasks t
          WHERE t.project_id = pm.project_id AND t.approver_id = pm.user_id AND t.status = 'REVIEW' AND t.deleted_at IS NULL) AS pending_review_count
       FROM execution_project_members pm JOIN admin_accounts a ON a.id = pm.user_id
       WHERE pm.project_id = ? AND pm.removed_at IS NULL
       ORDER BY CASE pm.role WHEN 'PROJECT_MANAGER' THEN 0 WHEN 'MEMBER' THEN 1 ELSE 2 END, pm.id`,
    ),
    projectId,
  );
}

export function addMember(projectId: number, principal: AdminPrincipal, input: Record<string, unknown>, db: Db = getDb()) {
  ensureExecutionProjectWorkflowSchema(db);
  const result = access(projectId, principal, "MANAGE_MEMBERS", db);
  if (!result.project) throw new WorkflowError("项目不存在", 404);
  if (!result.permission.allowed) throw new WorkflowError(result.permission.reason || "无权管理成员", 403);
  const userId = id(input.userId);
  if (!userId || !activeAccount(db, userId)) throw new WorkflowError("只能添加启用中的管理员账号", 400);
  const role = text(input.role, 30) as ProjectRole;
  if (!["MEMBER", "OBSERVER", "PROJECT_MANAGER"].includes(role)) throw new WorkflowError("项目角色无效", 400);
  if (principal.role !== "super" && role === "PROJECT_MANAGER") throw new WorkflowError("项目经理不能授予项目经理角色", 403);
  const existing = db.prepare(
    "SELECT * FROM execution_project_members WHERE project_id = ? AND user_id = ?",
  ).get(projectId, userId) as ProjectMemberRow | undefined;
  if (existing && !existing.removed_at) throw new WorkflowError("该账号已经是项目成员", 409);
  return savepoint(db, () => {
    if (existing) {
      db.prepare(
        "UPDATE execution_project_members SET role = ?, functional_label = ?, removed_at = NULL, assigned_at = CURRENT_TIMESTAMP WHERE id = ?",
      ).run(role, text(input.functionalLabel, 120), existing.id);
    } else {
      db.prepare(
        "INSERT INTO execution_project_members(project_id, user_id, role, functional_label) VALUES (?, ?, ?, ?)",
      ).run(projectId, userId, role, text(input.functionalLabel, 120));
    }
    const memberId = existing?.id || Number((db.prepare("SELECT last_insert_rowid() AS id").get() as { id: number }).id);
    insertProjectActivityLog(db, {
      projectId,
      actorAdminId: principal.id,
      action: "MEMBER_ADDED",
      entityType: "MEMBER",
      entityId: memberId,
      payload: { userId, role, functionalLabel: text(input.functionalLabel, 120) },
    });
    return listMembers(projectId, principal, db);
  });
}

export function updateMember(projectId: number, memberId: number, principal: AdminPrincipal, input: Record<string, unknown>, db: Db = getDb()) {
  ensureExecutionProjectWorkflowSchema(db);
  const current = db.prepare(
    "SELECT * FROM execution_project_members WHERE id = ? AND project_id = ? AND removed_at IS NULL",
  ).get(memberId, projectId) as (ProjectMemberRow & { functional_label?: string }) | undefined;
  if (!current) throw new WorkflowError("项目成员不存在", 404);
  const result = access(projectId, principal, "MANAGE_MEMBERS", db);
  if (!result.permission.allowed) throw new WorkflowError(result.permission.reason || "无权管理成员", 403);
  const nextRole = text(input.role, 30) as ProjectRole || current.role;
  const nextLabel = input.functionalLabel === undefined ? current.functional_label || "" : text(input.functionalLabel, 120);
  if (!["MEMBER", "OBSERVER", "PROJECT_MANAGER"].includes(nextRole)) throw new WorkflowError("项目角色无效", 400);
  if (principal.role !== "super" && (current.role === "PROJECT_MANAGER" || nextRole === "PROJECT_MANAGER"))
    throw new WorkflowError("项目经理不能调整项目经理角色", 403);
  if (current.role === "PROJECT_MANAGER" && nextRole !== "PROJECT_MANAGER") {
    const count = Number((db.prepare(
      "SELECT COUNT(*) AS count FROM execution_project_members WHERE project_id = ? AND role = 'PROJECT_MANAGER' AND removed_at IS NULL",
    ).get(projectId) as { count: number }).count);
    if (count <= 1) throw new WorkflowError("项目至少保留一个项目经理", 400);
  }
  db.prepare("UPDATE execution_project_members SET role = ?, functional_label = ? WHERE id = ?").run(nextRole, nextLabel, memberId);
  insertProjectActivityLog(db, {
    projectId,
    actorAdminId: principal.id,
    action: "MEMBER_ROLE_CHANGED",
    entityType: "MEMBER",
    entityId: memberId,
    payload: { before: { role: current.role, functionalLabel: current.functional_label || "" }, after: { role: nextRole, functionalLabel: nextLabel } },
  });
  return listMembers(projectId, principal, db);
}

export function removeMember(projectId: number, memberId: number, principal: AdminPrincipal, db: Db = getDb()) {
  ensureExecutionProjectWorkflowSchema(db);
  const current = db.prepare(
    "SELECT * FROM execution_project_members WHERE id = ? AND project_id = ? AND removed_at IS NULL",
  ).get(memberId, projectId) as ProjectMemberRow | undefined;
  if (!current) throw new WorkflowError("项目成员不存在", 404);
  const result = access(projectId, principal, "MANAGE_MEMBERS", db);
  if (!result.permission.allowed) throw new WorkflowError(result.permission.reason || "无权管理成员", 403);
  if (principal.role !== "super" && current.role === "PROJECT_MANAGER") throw new WorkflowError("项目经理不能移除项目经理", 403);
  if (current.role === "PROJECT_MANAGER") {
    const count = Number((db.prepare(
      "SELECT COUNT(*) AS count FROM execution_project_members WHERE project_id = ? AND role = 'PROJECT_MANAGER' AND removed_at IS NULL",
    ).get(projectId) as { count: number }).count);
    if (count <= 1) throw new WorkflowError("项目至少保留一个项目经理", 400);
  }
  const taskCount = Number((db.prepare(
    `SELECT COUNT(*) AS count FROM execution_project_tasks
     WHERE project_id = ? AND deleted_at IS NULL AND (owner_id = ? OR approver_id = ?)
       AND status NOT IN ('DONE', 'CANCELLED')`,
  ).get(projectId, current.user_id, current.user_id) as { count: number }).count);
  if (taskCount) throw new WorkflowError("该成员仍负责或验收未完成任务，请先重新分配", 409);
  db.prepare("UPDATE execution_project_members SET removed_at = CURRENT_TIMESTAMP WHERE id = ?").run(memberId);
  insertProjectActivityLog(db, {
    projectId,
    actorAdminId: principal.id,
    action: "MEMBER_REMOVED",
    entityType: "MEMBER",
    entityId: memberId,
    payload: { userId: current.user_id, role: current.role },
  });
  return listMembers(projectId, principal, db);
}

function validateTaskPeople(projectId: number, input: Record<string, unknown>, db: Db) {
  const ownerId = id(input.ownerId);
  const approverId = id(input.approverId);
  if (ownerId) assertProjectMember(projectId, ownerId, db);
  if (approverId) assertProjectMember(projectId, approverId, db);
  const collaboratorIds = ids(input.collaboratorIds);
  for (const userId of collaboratorIds) assertProjectMember(projectId, userId, db);
  return { ownerId, approverId, collaboratorIds };
}

function cleanList(value: unknown) {
  return (Array.isArray(value) ? value : String(value || "").split(/\r?\n/))
    .map((item) => typeof item === "string" ? item.trim() : "")
    .filter(Boolean)
    .slice(0, 100);
}

function taskInput(projectId: number, input: Record<string, unknown>, db: Db, current?: Record<string, unknown>) {
  const people = validateTaskPeople(projectId, input, db);
  const dependencyTaskIds = ids(input.dependencyTaskIds);
  const taskId = current ? Number(current.id) : null;
  for (const dependencyId of dependencyTaskIds) {
    if (dependencyId === taskId) throw new WorkflowError("任务不能依赖自身", 400);
    const dependency = taskRow(projectId, dependencyId, db);
    if (!dependency) throw new WorkflowError("依赖任务不存在或不属于当前项目", 400);
  }
  const allEdges = rows<{ task_id: number; depends_on_task_id: number }>(
    db.prepare(
      `SELECT d.task_id, d.depends_on_task_id FROM execution_task_dependencies d
       JOIN execution_project_tasks t ON t.id = d.task_id
       WHERE t.project_id = ? AND d.task_id != ?`,
    ),
    projectId,
    taskId || -1,
  ).concat(dependencyTaskIds.map((dependsOnTaskId) => ({ task_id: taskId || -1, depends_on_task_id: dependsOnTaskId })));
  if (findDependencyCycle(allEdges.map((edge) => ({ taskId: edge.task_id, dependsOnTaskId: edge.depends_on_task_id }))))
    throw new WorkflowError("任务依赖不能形成循环", 400);
  const steps = cleanList(input.steps);
  return {
    ...people,
    phaseId: id(input.phaseId),
    milestoneId: id(input.milestoneId),
    title: text(input.title, 240),
    code: text(input.code, 100),
    description: text(input.description, 5000),
    objective: text(input.objective, 5000),
    sopVersionId: id(input.sopVersionId),
    startAt: text(input.startAt, 80) || null,
    dueAt: text(input.dueAt, 80) || null,
    estimatedHours: input.estimatedHours === "" || input.estimatedHours === undefined ? null : Number(input.estimatedHours),
    priority: ["LOW", "NORMAL", "HIGH", "URGENT"].includes(text(input.priority, 20)) ? text(input.priority, 20) : "NORMAL",
    triggerText: text(input.triggerText, 2000),
    preconditions: text(input.preconditions, 5000),
    inputs: text(input.inputs, 5000),
    steps,
    deliverables: cleanList(input.deliverables),
    acceptanceCriteria: cleanList(input.acceptanceCriteria),
    dependencyTaskIds,
    isCritical: Boolean(input.isCritical),
  };
}

function replaceTaskRelations(taskId: number, input: ReturnType<typeof taskInput>, db: Db) {
  db.prepare("DELETE FROM execution_task_collaborators WHERE task_id = ?").run(taskId);
  const collaboratorInsert = db.prepare("INSERT INTO execution_task_collaborators(task_id, user_id) VALUES (?, ?)");
  for (const userId of input.collaboratorIds) collaboratorInsert.run(taskId, userId);
  db.prepare("DELETE FROM execution_task_dependencies WHERE task_id = ?").run(taskId);
  const dependencyInsert = db.prepare("INSERT INTO execution_task_dependencies(task_id, depends_on_task_id) VALUES (?, ?)");
  for (const dependencyId of input.dependencyTaskIds) dependencyInsert.run(taskId, dependencyId);
}

export function createTask(projectId: number, principal: AdminPrincipal, input: Record<string, unknown>, db: Db = getDb()) {
  ensureExecutionProjectWorkflowSchema(db);
  const result = access(projectId, principal, "MANAGE_TASKS", db);
  if (!result.project) throw new WorkflowError("项目不存在", 404);
  if (!result.permission.allowed) throw new WorkflowError(result.permission.reason || "无权创建任务", 403);
  const parsed = taskInput(projectId, input, db);
  if (!parsed.title) throw new WorkflowError("任务标题不能为空", 400, { fieldErrors: { title: "任务标题不能为空" } });
  const code = parsed.code || `TASK-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
  return savepoint(db, () => {
    const created = db.prepare(
      `INSERT INTO execution_project_tasks(
        project_id, phase_id, milestone_id, code, title, description, objective, status, owner_id, approver_id,
        sop_version_id, start_at, due_at, estimated_hours, priority, trigger_text, preconditions, inputs, steps,
        deliverables, acceptance_criteria, is_key
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'DRAFT', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      projectId, parsed.phaseId, parsed.milestoneId, code, parsed.title, parsed.description, parsed.objective,
      parsed.ownerId, parsed.approverId, parsed.sopVersionId, parsed.startAt, parsed.dueAt, parsed.estimatedHours,
      parsed.priority, parsed.triggerText, parsed.preconditions, parsed.inputs, JSON.stringify(parsed.steps),
      JSON.stringify(parsed.deliverables), JSON.stringify(parsed.acceptanceCriteria), parsed.isCritical ? 1 : 0,
    );
    const taskId = Number(created.lastInsertRowid);
    replaceTaskRelations(taskId, parsed, db);
    insertProjectActivityLog(db, {
      projectId, actorAdminId: principal.id, action: "TASK_CREATED", entityType: "TASK", entityId: taskId,
      payload: { after: taskSnapshot({ ...parsed, id: taskId, status: "DRAFT" }) },
    });
    return taskView(projectId, taskRow(projectId, taskId, db)!, db);
  });
}

export function getTask(projectId: number, taskId: number, principal: AdminPrincipal, db: Db = getDb()) {
  ensureExecutionProjectWorkflowSchema(db);
  const result = access(projectId, principal, "VIEW_PROJECT", db);
  if (!result.project) throw new WorkflowError("项目不存在", 404);
  if (!result.permission.allowed) throw new WorkflowError(result.permission.reason || "无权查看任务", 403);
  const task = taskRow(projectId, taskId, db);
  if (!task) throw new WorkflowError("任务不存在", 404);
  if (task.status === "DRAFT" && principal.role !== "super" && result.member?.role !== "PROJECT_MANAGER")
    throw new WorkflowError("当前角色不能查看任务草稿", 403);
  return taskView(projectId, task, db);
}

export function updateTask(projectId: number, taskId: number, principal: AdminPrincipal, input: Record<string, unknown>, db: Db = getDb()) {
  ensureExecutionProjectWorkflowSchema(db);
  const current = taskRow(projectId, taskId, db);
  if (!current) throw new WorkflowError("任务不存在", 404);
  const result = access(projectId, principal, "MANAGE_TASKS", db, { ownerId: Number(current.owner_id) || null, approverId: Number(current.approver_id) || null });
  if (!result.permission.allowed) throw new WorkflowError(result.permission.reason || "无权编辑任务", 403);
  if (current.status === "DONE") throw new WorkflowError("已验收任务必须先重新打开后才能编辑", 409);
  const parsed = taskInput(projectId, input, db, current);
  if (!parsed.title) throw new WorkflowError("任务标题不能为空", 400, { fieldErrors: { title: "任务标题不能为空" } });
  const before = taskSnapshot(current);
  db.prepare(
    `UPDATE execution_project_tasks SET phase_id = ?, milestone_id = ?, title = ?, description = ?, objective = ?,
      owner_id = ?, approver_id = ?, sop_version_id = ?, start_at = ?, due_at = ?, estimated_hours = ?,
      priority = ?, trigger_text = ?, preconditions = ?, inputs = ?, steps = ?, deliverables = ?,
      acceptance_criteria = ?, is_key = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
  ).run(
    parsed.phaseId, parsed.milestoneId, parsed.title, parsed.description, parsed.objective, parsed.ownerId,
    parsed.approverId, parsed.sopVersionId, parsed.startAt, parsed.dueAt, parsed.estimatedHours, parsed.priority,
    parsed.triggerText, parsed.preconditions, parsed.inputs, JSON.stringify(parsed.steps), JSON.stringify(parsed.deliverables),
    JSON.stringify(parsed.acceptanceCriteria), parsed.isCritical ? 1 : 0, taskId,
  );
  replaceTaskRelations(taskId, parsed, db);
  insertProjectActivityLog(db, {
    projectId, actorAdminId: principal.id, action: "TASK_UPDATED", entityType: "TASK", entityId: taskId,
    payload: { before, after: taskSnapshot(taskRow(projectId, taskId, db)!) },
  });
  return taskView(projectId, taskRow(projectId, taskId, db)!, db);
}

export function deleteTask(projectId: number, taskId: number, principal: AdminPrincipal, db: Db = getDb()) {
  ensureExecutionProjectWorkflowSchema(db);
  const current = taskRow(projectId, taskId, db);
  if (!current) throw new WorkflowError("任务不存在", 404);
  const result = access(projectId, principal, "MANAGE_TASKS", db);
  if (!result.permission.allowed) throw new WorkflowError(result.permission.reason || "无权删除任务", 403);
  if (current.status !== "DRAFT") throw new WorkflowError("已发布任务不能物理删除，只能取消", 409);
  db.prepare("UPDATE execution_project_tasks SET deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(taskId);
  insertProjectActivityLog(db, {
    projectId, actorAdminId: principal.id, action: "TASK_DELETED", entityType: "TASK", entityId: taskId,
    payload: { before: taskSnapshot(current) },
  });
  return { deleted: true };
}

function dependencyReady(taskId: number, db: Db) {
  const dependencies = rows<{ status: TaskStatus }>(
    db.prepare(
      `SELECT t.status FROM execution_task_dependencies d JOIN execution_project_tasks t ON t.id = d.depends_on_task_id
       WHERE d.task_id = ?`,
    ),
    taskId,
  );
  return dependencies.every((item) => item.status === "DONE");
}

export function publishPlan(projectId: number, principal: AdminPrincipal, requestedTaskIds: number[] | undefined, db: Db = getDb()) {
  ensureExecutionProjectWorkflowSchema(db);
  const result = access(projectId, principal, "PUBLISH_PLAN", db);
  if (!result.project) throw new WorkflowError("项目不存在", 404);
  if (!result.permission.allowed) throw new WorkflowError(result.permission.reason || "无权发布任务计划", 403);
  const selected = requestedTaskIds?.length
    ? requestedTaskIds.map((taskId) => taskRow(projectId, taskId, db)).filter((task): task is Record<string, unknown> => Boolean(task && task.status === "DRAFT"))
    : rows<Record<string, unknown>>(
      db.prepare("SELECT * FROM execution_project_tasks WHERE project_id = ? AND status = 'DRAFT' AND deleted_at IS NULL ORDER BY id"),
      projectId,
    );
  const taskErrors: NonNullable<WorkflowError["taskErrors"]> = [];
  for (const task of selected) {
    const deliverables = parseJson<string[]>(task.deliverables, []);
    const acceptanceCriteria = parseJson<string[]>(task.acceptance_criteria, []);
    if (!task.title || !task.owner_id || !task.approver_id || !task.due_at || !deliverables.length || !acceptanceCriteria.length)
      taskErrors.push({ taskId: Number(task.id), code: String(task.code), title: String(task.title), error: "缺少负责人、验收人、截止时间、交付物或验收标准" });
  }
  if (!selected.length) throw new WorkflowError("没有可发布的草稿任务", 400);
  if (taskErrors.length) throw new WorkflowError("部分任务不满足发布条件", 400, { taskErrors });
  return savepoint(db, () => {
    const update = db.prepare("UPDATE execution_project_tasks SET status = 'READY', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'DRAFT'");
    for (const task of selected) update.run(Number(task.id));
    insertProjectActivityLog(db, {
      projectId, actorAdminId: principal.id, action: "PLAN_PUBLISHED", entityType: "PROJECT", entityId: projectId,
      payload: { taskIds: selected.map((task) => Number(task.id)), count: selected.length },
    });
    return { publishedTaskIds: selected.map((task) => Number(task.id)), count: selected.length };
  });
}

function latestPendingApproval(taskId: number, db: Db) {
  return db.prepare(
    "SELECT * FROM execution_task_approvals WHERE task_id = ? ORDER BY id DESC LIMIT 1",
  ).get(taskId) as Record<string, unknown> | undefined;
}

export function transitionTask(projectId: number, taskId: number, action: string, principal: AdminPrincipal, input: Record<string, unknown>, db: Db = getDb()) {
  ensureExecutionProjectWorkflowSchema(db);
  const current = taskRow(projectId, taskId, db);
  if (!current) throw new WorkflowError("任务不存在", 404);
  const taskAssignment = { ownerId: Number(current.owner_id) || null, approverId: Number(current.approver_id) || null };
  const projectAccess = access(projectId, principal, "VIEW_PROJECT", db, taskAssignment);
  if (!projectAccess.project) throw new WorkflowError("项目不存在", 404);
  if (!projectAccess.permission.allowed) throw new WorkflowError(projectAccess.permission.reason || "无权操作任务", 403);
  const manager = principal.role === "super" || projectAccess.member?.role === "PROJECT_MANAGER";
  const owner = principal.role === "super" || Number(current.owner_id) === principal.id;
  if (["START", "WAIT_EXTERNAL", "WAIT_INTERNAL", "BLOCK", "RESUME"].includes(action) && !owner && !manager)
    throw new WorkflowError("只有负责人或项目经理可以执行该操作", 403);
  if (["CANCEL", "REOPEN"].includes(action) && !manager)
    throw new WorkflowError("只有项目经理或超级管理员可以执行该操作", 403);
  const targets: Record<string, TaskStatus> = {
    START: "IN_PROGRESS", WAIT_EXTERNAL: "WAITING_EXTERNAL", WAIT_INTERNAL: "WAITING_INTERNAL",
    BLOCK: "BLOCKED", RESUME: "IN_PROGRESS", CANCEL: "CANCELLED", REOPEN: "IN_PROGRESS",
  };
  const target = targets[action];
  if (!target) throw new WorkflowError("不支持的任务操作", 400);
  const context = {
    ownerId: current.owner_id as number | null,
    approverId: current.approver_id as number | null,
    dueAt: current.due_at as string | null,
    deliverables: current.deliverables as string | null,
    acceptanceCriteria: current.acceptance_criteria as string | null,
    waitingFor: text(input.waitingFor, 500),
    waitingReason: text(input.waitingReason, 2000),
    nextFollowUpAt: text(input.nextFollowUpAt, 80),
    blockerReason: text(input.blockerReason, 2000),
    blockerImpact: text(input.blockerImpact, 2000),
    cancelReason: text(input.cancelReason, 2000),
    reopenReason: text(input.reopenReason, 2000),
    revisionReason: text(input.revisionReason, 2000),
  };
  if (action === "START" && !dependencyReady(taskId, db)) {
    if (!manager || !text(input.overrideReason, 2000)) throw new WorkflowError("仍有未完成依赖，开始前需要填写依赖覆盖原因", 409);
    insertProjectActivityLog(db, {
      projectId, actorAdminId: principal.id, action: "DEPENDENCY_OVERRIDE", entityType: "TASK", entityId: taskId,
      payload: { reason: text(input.overrideReason, 2000) },
    });
  }
  if (action === "RESUME" && !text(input.resolutionNote, 2000)) throw new WorkflowError("解除等待或阻塞必须填写解决说明", 400);
  const actor: StateTransitionActor = {
    actorId: principal.id,
    isProjectManager: manager,
    isApprover: Number(current.approver_id) === principal.id,
  };
  const validation = validateTaskTransition(String(current.status) as TaskStatus, target, context, actor);
  if (!validation.allowed) throw new WorkflowError(validation.reason || "任务状态不能这样变更", 409);
  db.prepare(
    `UPDATE execution_project_tasks SET status = ?, waiting_for = ?, waiting_reason = ?, next_follow_up_at = ?,
      blocker_reason = ?, blocker_impact = ?, cancel_reason = ?, revision_reason = ?, completed_at = ?,
      updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
  ).run(
    target,
    action === "WAIT_EXTERNAL" || action === "WAIT_INTERNAL" ? context.waitingFor : action === "RESUME" ? "" : current.waiting_for as SQLInputValue,
    action === "WAIT_EXTERNAL" || action === "WAIT_INTERNAL" ? context.waitingReason : action === "RESUME" ? "" : current.waiting_reason as SQLInputValue,
    action === "WAIT_EXTERNAL" || action === "WAIT_INTERNAL" ? context.nextFollowUpAt : action === "RESUME" ? null : current.next_follow_up_at as SQLInputValue,
    action === "BLOCK" ? context.blockerReason : action === "RESUME" ? "" : current.blocker_reason as SQLInputValue,
    action === "BLOCK" ? context.blockerImpact : action === "RESUME" ? "" : current.blocker_impact as SQLInputValue,
    action === "CANCEL" ? context.cancelReason : current.cancel_reason as SQLInputValue,
    current.revision_reason as SQLInputValue,
    target === "DONE" ? new Date().toISOString() : null,
    taskId,
  );
  const actionLabels: Record<string, string> = {
    START: "TASK_STARTED", WAIT_EXTERNAL: "TASK_WAITING_EXTERNAL", WAIT_INTERNAL: "TASK_WAITING_INTERNAL",
    BLOCK: "TASK_BLOCKED", RESUME: "TASK_RESUMED", CANCEL: "TASK_CANCELLED", REOPEN: "TASK_REOPENED",
  };
  insertProjectActivityLog(db, {
    projectId, actorAdminId: principal.id, action: actionLabels[action], entityType: "TASK", entityId: taskId,
    payload: { from: current.status, to: target, reason: text(input.resolutionNote || input.cancelReason || input.reopenReason, 2000) },
  });
  return taskView(projectId, taskRow(projectId, taskId, db)!, db);
}

function evidence(input: Record<string, unknown>) {
  const links = (Array.isArray(input.evidenceLinks) ? input.evidenceLinks : [])
    .map((item) => text(item, 1000))
    .filter(Boolean);
  if (links.some((link) => !validUrl(link) && !link.startsWith("/"))) throw new WorkflowError("证据链接只允许 http、https 或系统内部路径", 400);
  return links;
}

function fileVersionIds(input: Record<string, unknown>) {
  return [...new Set((Array.isArray(input.fileVersionIds) ? input.fileVersionIds : [])
    .map((value) => Number(value))
    .filter((value) => Number.isInteger(value) && value > 0))];
}

function validateTaskFileEvidence(projectId: number, taskId: number, ids: number[], db: Db) {
  if (!ids.length) return;
  const placeholders = ids.map(() => "?").join(",");
  const found = rows<{ id: number; task_id: number | null }>(
    db.prepare(
      `SELECT v.id, a.task_id FROM execution_file_versions v
       JOIN execution_file_assets a ON a.id = v.asset_id
       WHERE a.project_id = ? AND v.id IN (${placeholders}) AND a.deleted_at IS NULL`,
    ),
    projectId,
    ...ids,
  );
  if (found.length !== ids.length) throw new WorkflowError("文件证据必须属于当前项目且可访问", 400);
  if (found.some((row) => row.task_id !== null && Number(row.task_id) !== taskId))
    throw new WorkflowError("文件证据与当前任务的关联不合法", 400);
}

export function submitTask(projectId: number, taskId: number, principal: AdminPrincipal, input: Record<string, unknown>, db: Db = getDb()) {
  ensureExecutionProjectWorkflowSchema(db);
  ensureExecutionProjectFileSchema(db);
  const current = taskRow(projectId, taskId, db);
  if (!current) throw new WorkflowError("任务不存在", 404);
  const result = access(projectId, principal, "VIEW_PROJECT", db, { ownerId: Number(current.owner_id) || null, approverId: Number(current.approver_id) || null });
  if (!result.project) throw new WorkflowError("项目不存在", 404);
  const manager = principal.role === "super" || result.member?.role === "PROJECT_MANAGER";
  const isOwner = Number(current.owner_id) === principal.id;
  if (!isOwner && !manager) throw new WorkflowError("只有任务负责人可以提交验收", 403);
  if (!isOwner && !text(input.delegateReason, 2000)) throw new WorkflowError("代提交必须填写原因", 400);
  const resultSummary = text(input.resultSummary, 5000);
  const links = evidence(input);
  const fileIds = fileVersionIds(input);
  validateTaskFileEvidence(projectId, taskId, fileIds, db);
  const noFileEvidenceReason = text(input.noFileEvidenceReason, 2000);
  if (!resultSummary) throw new WorkflowError("成果说明不能为空", 400, { fieldErrors: { resultSummary: "请填写成果说明" } });
  if (!links.length && !fileIds.length && !noFileEvidenceReason) throw new WorkflowError("请提供文件版本、证据链接，或说明无需文件证据", 400, { fieldErrors: { evidenceLinks: "请提供文件版本、证据链接或无需文件证据说明" } });
  if (!["IN_PROGRESS", "REVISION_REQUIRED"].includes(String(current.status))) throw new WorkflowError("当前任务状态不能提交验收", 409);
  const latest = latestPendingApproval(taskId, db);
  const submissionNumber = Number(latest?.submission_number || 0) + 1;
  return savepoint(db, () => {
    db.prepare(
      "INSERT INTO execution_task_approvals(task_id, approver_id, decision, comment, submission_number, result_summary, evidence_links, file_version_ids, no_file_evidence_reason, submitted_by_admin_id) VALUES (?, ?, 'PENDING', ?, ?, ?, ?, ?, ?, ?)",
    ).run(taskId, Number(current.approver_id), resultSummary, submissionNumber, resultSummary, JSON.stringify(links), JSON.stringify(fileIds), noFileEvidenceReason, principal.id);
    const insertEvidence = db.prepare(
      "INSERT INTO execution_task_evidence(task_id, file_version_id, external_url, note, submission_number, created_by_admin_id) VALUES (?, ?, ?, ?, ?, ?)",
    );
    for (const versionId of fileIds) insertEvidence.run(taskId, versionId, null, "", submissionNumber, principal.id);
    for (const link of links) insertEvidence.run(taskId, null, link, "", submissionNumber, principal.id);
    if (noFileEvidenceReason) insertEvidence.run(taskId, null, null, noFileEvidenceReason, submissionNumber, principal.id);
    db.prepare("UPDATE execution_project_tasks SET status = 'REVIEW', result_summary = ?, no_file_evidence_reason = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(resultSummary, noFileEvidenceReason, taskId);
    insertProjectActivityLog(db, {
      projectId, actorAdminId: principal.id, action: "TASK_SUBMITTED", entityType: "TASK", entityId: taskId,
      payload: { submissionNumber, resultSummary, evidenceLinks: links, fileVersionIds: fileIds, noFileEvidenceReason, delegateReason: text(input.delegateReason, 2000) },
    });
    return taskView(projectId, taskRow(projectId, taskId, db)!, db);
  });
}

export function decideTask(projectId: number, taskId: number, decision: "APPROVED" | "REJECTED", principal: AdminPrincipal, input: Record<string, unknown>, db: Db = getDb()) {
  ensureExecutionProjectWorkflowSchema(db);
  const current = taskRow(projectId, taskId, db);
  if (!current) throw new WorkflowError("任务不存在", 404);
  const result = access(projectId, principal, "VIEW_PROJECT", db, { ownerId: Number(current.owner_id) || null, approverId: Number(current.approver_id) || null });
  if (!result.project) throw new WorkflowError("项目不存在", 404);
  const isDesignatedApprover = Number(current.approver_id) === principal.id &&
    (principal.role === "super" || Boolean(result.member));
  const canApprove = isDesignatedApprover
    ? { allowed: true as const }
    : canApproveTask(
      principal,
      result.member ? { userId: result.member.user_id, role: result.member.role } : null,
      { approverId: Number(current.approver_id) || null },
    );
  if (!canApprove.allowed) throw new WorkflowError(canApprove.reason || "无权验收任务", 403);
  if (current.status !== "REVIEW") throw new WorkflowError("当前任务不在待验收状态", 409);
  const pending = latestPendingApproval(taskId, db);
  if (!pending || pending.decision !== "PENDING") throw new WorkflowError("当前没有待处理的验收提交", 409);
  const note = text(input.decisionNote || input.rejectionReason, 3000);
  if (decision === "REJECTED" && !note) throw new WorkflowError("退回必须填写原因", 400);
  return savepoint(db, () => {
    const updated = db.prepare("UPDATE execution_task_approvals SET decision = ?, comment = ?, decided_at = ?, decided_by_admin_id = ? WHERE id = ? AND decision = 'PENDING'")
      .run(decision, note, new Date().toISOString(), principal.id, Number(pending.id));
    if (!Number(updated.changes)) throw new WorkflowError("该验收提交已经被其他操作处理", 409);
    const status = decision === "APPROVED" ? "DONE" : "REVISION_REQUIRED";
    db.prepare("UPDATE execution_project_tasks SET status = ?, revision_reason = ?, completed_at = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
      .run(status, decision === "REJECTED" ? note : "", decision === "APPROVED" ? new Date().toISOString() : null, taskId);
    insertProjectActivityLog(db, {
      projectId, actorAdminId: principal.id, action: decision === "APPROVED" ? "TASK_APPROVED" : "TASK_REJECTED",
      entityType: "TASK", entityId: taskId, payload: { submissionNumber: pending.submission_number, note },
    });
    return taskView(projectId, taskRow(projectId, taskId, db)!, db);
  });
}

export function updatePhase(projectId: number, phaseId: number, principal: AdminPrincipal, input: Record<string, unknown>, db: Db = getDb()) {
  ensureExecutionProjectWorkflowSchema(db);
  const result = access(projectId, principal, "MANAGE_PHASES", db);
  if (!result.project) throw new WorkflowError("项目不存在", 404);
  if (!result.permission.allowed) throw new WorkflowError(result.permission.reason || "无权编辑阶段", 403);
  const current = db.prepare("SELECT * FROM execution_project_phases WHERE id = ? AND project_id = ?").get(phaseId, projectId) as Record<string, unknown> | undefined;
  if (!current) throw new WorkflowError("阶段不存在", 404);
  const next = { startsAt: text(input.startsAt, 80) || null, dueAt: text(input.dueAt, 80) || null, gateDefinition: text(input.gateDefinition, 3000) };
  if ((next.startsAt !== current.starts_at || next.dueAt !== current.due_at) && !text(input.changeReason, 2000))
    throw new WorkflowError("调整阶段关键日期必须填写修改原因", 400);
  db.prepare("UPDATE execution_project_phases SET starts_at = ?, due_at = ?, gate_definition = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(next.startsAt, next.dueAt, next.gateDefinition, phaseId);
  insertProjectActivityLog(db, { projectId, actorAdminId: principal.id, action: "PHASE_UPDATED", entityType: "PHASE", entityId: phaseId, payload: { before: current, after: next, reason: text(input.changeReason, 2000) } });
  return db.prepare("SELECT * FROM execution_project_phases WHERE id = ?").get(phaseId);
}

export function updateMilestone(projectId: number, milestoneId: number, principal: AdminPrincipal, input: Record<string, unknown>, db: Db = getDb()) {
  ensureExecutionProjectWorkflowSchema(db);
  const result = access(projectId, principal, "MANAGE_MILESTONES", db);
  if (!result.project) throw new WorkflowError("项目不存在", 404);
  if (!result.permission.allowed) throw new WorkflowError(result.permission.reason || "无权编辑里程碑", 403);
  const current = db.prepare("SELECT * FROM execution_project_milestones WHERE id = ? AND project_id = ?").get(milestoneId, projectId) as Record<string, unknown> | undefined;
  if (!current) throw new WorkflowError("里程碑不存在", 404);
  const next = { dueAt: text(input.dueAt, 80) || null, acceptanceCriteria: text(input.acceptanceCriteria, 3000), isKey: Boolean(input.isKey) };
  if (next.dueAt !== current.due_at && !text(input.changeReason, 2000))
    throw new WorkflowError("调整里程碑日期必须填写修改原因", 400);
  db.prepare("UPDATE execution_project_milestones SET due_at = ?, acceptance_criteria = ?, is_key = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(next.dueAt, next.acceptanceCriteria, next.isKey ? 1 : 0, milestoneId);
  insertProjectActivityLog(db, { projectId, actorAdminId: principal.id, action: "MILESTONE_UPDATED", entityType: "MILESTONE", entityId: milestoneId, payload: { before: current, after: next, reason: text(input.changeReason, 2000) } });
  return db.prepare("SELECT * FROM execution_project_milestones WHERE id = ?").get(milestoneId);
}
