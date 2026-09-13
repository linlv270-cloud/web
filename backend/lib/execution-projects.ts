import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { getDb } from "./database";
import { findDependencyCycle } from "./execution-project-state";
import { canProjectAction } from "./project-permissions";
import { getProjectHealthSnapshot, healthReasonText } from "./project-health";
import type { AdminPrincipal } from "./types";
import type {
  ProjectPriority,
  ProjectRole,
  ProjectSource,
  ProjectStatus,
  HealthStatus,
  TaskStatus,
} from "./execution-project-types";

type SqliteDb = Pick<DatabaseSync, "prepare" | "exec">;

export type ExecutionProjectRow = {
  id: number;
  code: string;
  name: string;
  source: ProjectSource;
  status: ProjectStatus;
  health: HealthStatus;
  description: string;
  manager_admin_id: number | null;
  created_by_admin_id: number | null;
  created_by_label: string;
  source_creator_id: number | null;
  source_venue_id: number | null;
  source_event_id: number | null;
  source_design_session_id: number | null;
  source_design_draft_id: number | null;
  source_reference_id: string;
  venue_name: string;
  venue_contact_name: string;
  venue_contact_info: string;
  venue_address: string;
  activity_direction: string;
  activity_start_at: string | null;
  activity_end_at: string | null;
  move_in_at: string | null;
  move_out_at: string | null;
  scale_description: string;
  cooperation_mode: string;
  budget_range_text: string;
  known_constraints: string;
  priority: ProjectPriority;
  creation_basis: string;
  confirmed_items: string;
  unconfirmed_items: string;
  notes: string;
  starts_at: string | null;
  target_end_at: string | null;
  paused_reason: string;
  cancelled_reason: string;
  archived_at: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ProjectMemberRow = {
  id: number;
  project_id: number;
  user_id: number;
  role: ProjectRole;
  assigned_at: string;
  removed_at: string | null;
};

export type CreateExecutionProjectInput = {
  code: string;
  name: string;
  source: ProjectSource;
  description?: string;
  managerAdminId?: number | null;
  createdByAdminId?: number | null;
  createdByLabel?: string;
  sourceCreatorId?: number | null;
  sourceVenueId?: number | null;
  sourceEventId?: number | null;
  sourceDesignSessionId?: number | null;
  sourceDesignDraftId?: number | null;
  sourceReferenceId?: string;
  venueName?: string;
  venueContactName?: string;
  venueContactInfo?: string;
  venueAddress?: string;
  activityDirection?: string;
  activityStartAt?: string | null;
  activityEndAt?: string | null;
  moveInAt?: string | null;
  moveOutAt?: string | null;
  scaleDescription?: string;
  cooperationMode?: string;
  budgetRangeText?: string;
  knownConstraints?: string;
  priority?: ProjectPriority;
  creationBasis?: string;
  confirmedItems?: string;
  unconfirmedItems?: string;
  notes?: string;
  startsAt?: string | null;
  targetEndAt?: string | null;
  members?: Array<{ userId: number; role: Exclude<ProjectRole, "PROJECT_MANAGER"> }>;
  sopVersionId?: number | null;
  sopVersionIds?: number[];
};

export type CreatedExecutionProject = {
  project: ExecutionProjectRow;
  phaseCount: number;
  milestoneCount: number;
  taskCount: number;
};

export const DEFAULT_PHASES = [
  ["P00", "项目初始化"],
  ["P01", "前期沟通"],
  ["P02", "场地调查"],
  ["P03", "方案细化"],
  ["P04", "商务确认"],
  ["P05", "视觉与物料"],
  ["P06", "内容与人员"],
  ["P07", "传播发布"],
  ["P08", "制作与现场准备"],
  ["P09", "活动执行"],
  ["P10", "撤场与结算"],
  ["P11", "复盘归档"],
] as const;

export const DEFAULT_MILESTONES = [
  ["M00", "项目正式启动"],
  ["M01", "场地资料完整"],
  ["M02", "方案 V1 提交"],
  ["M03", "正式方案确认"],
  ["M04", "合同签署"],
  ["M05", "主 KV 确认"],
  ["M06", "主理人与内容确认"],
  ["M07", "传播正式上线"],
  ["M08", "制作文件全部下单"],
  ["M09", "搭建完成"],
  ["M10", "活动开场"],
  ["M11", "活动结束并完成撤场"],
  ["M12", "结算完成"],
  ["M13", "项目归档"],
] as const;

export const DEFAULT_SOP_TEMPLATES = [
  ["SOP_PREPARATION", "前期准备"],
  ["SOP_VENUE", "场地与商务"],
  ["SOP_CONCEPT", "方案与创意"],
  ["SOP_DESIGN", "视觉与物料"],
  ["SOP_CONTENT", "内容与主理人"],
  ["SOP_MARKETING", "传播发布"],
  ["SOP_PRODUCTION", "制作与供应商"],
  ["SOP_EVENT", "现场执行"],
  ["SOP_SETTLEMENT", "撤场与结算"],
  ["SOP_REVIEW", "复盘与归档"],
] as const;

const DEFAULT_SOP_TASKS = DEFAULT_SOP_TEMPLATES.map(([code, name], index) => ({
  code,
  name,
  phaseCode: `P${String(Math.min(index, 9)).padStart(2, "0")}`,
}));

let savepointSequence = 0;

function asRows<T>(
  statement: { all: (...values: SQLInputValue[]) => unknown[] },
  ...values: SQLInputValue[]
) {
  return statement.all(...values) as T[];
}

function withSavepoint<T>(db: SqliteDb, operation: () => T) {
  savepointSequence += 1;
  const name = `execution_project_tx_${savepointSequence}`;
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

export function getExecutionProject(projectId: number, db: SqliteDb = getDb()) {
  return db.prepare("SELECT * FROM execution_projects WHERE id = ? AND deleted_at IS NULL").get(projectId) as
    | ExecutionProjectRow
    | undefined;
}

export function isExecutionProjectSchemaReady(db: SqliteDb = getDb()) {
  try {
    const row = db.prepare(
      "SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'table' AND name = 'execution_projects'",
    ).get() as { count: number };
    return Number(row.count) === 1;
  } catch {
    return false;
  }
}

export function getProjectMember(projectId: number, userId: number, db: SqliteDb = getDb()) {
  return db.prepare(
    "SELECT * FROM execution_project_members WHERE project_id = ? AND user_id = ? AND removed_at IS NULL",
  ).get(projectId, userId) as ProjectMemberRow | undefined;
}

export function listProjectMembers(projectId: number, db: SqliteDb = getDb()) {
  return asRows<ProjectMemberRow>(
    db.prepare(
      "SELECT * FROM execution_project_members WHERE project_id = ? AND removed_at IS NULL ORDER BY role, id",
    ),
    projectId,
  );
}

export function getAccessibleExecutionProject(
  projectId: number,
  principal: AdminPrincipal,
  db: SqliteDb = getDb(),
) {
  const project = getExecutionProject(projectId, db);
  if (!project) return null;
  const membership = principal.role === "super" || principal.id === null
    ? null
    : getProjectMember(projectId, principal.id, db) || null;
  const permission = canProjectAction(
    principal,
    membership ? { userId: membership.user_id, role: membership.role, active: !membership.removed_at } : null,
    "VIEW_PROJECT",
  );
  return permission.allowed ? { project, membership } : null;
}

export function listExecutionProjects(
  principal: AdminPrincipal,
  filters: {
    status?: string;
    health?: string;
    ownerId?: number;
    keyword?: string;
    activityStartFrom?: string;
    activityStartTo?: string;
    page: number;
    pageSize: number;
  },
  db: SqliteDb = getDb(),
) {
  const where = ["p.deleted_at IS NULL"];
  const values: SQLInputValue[] = [];
  if (principal.role !== "super") {
    where.push("EXISTS (SELECT 1 FROM execution_project_members pm WHERE pm.project_id = p.id AND pm.user_id = ? AND pm.removed_at IS NULL)");
    values.push(principal.id);
  }
  if (filters.status) {
    where.push("p.status = ?");
    values.push(filters.status);
  }
  if (filters.ownerId) {
    where.push("p.manager_admin_id = ?");
    values.push(filters.ownerId);
  }
  if (filters.keyword) {
    where.push("(p.name LIKE ? OR p.code LIKE ? OR p.venue_name LIKE ?)");
    const keyword = `%${filters.keyword}%`;
    values.push(keyword, keyword, keyword);
  }
  if (filters.activityStartFrom) {
    where.push("p.activity_start_at >= ?");
    values.push(filters.activityStartFrom);
  }
  if (filters.activityStartTo) {
    where.push("p.activity_start_at <= ?");
    values.push(filters.activityStartTo);
  }
  const whereSql = where.join(" AND ");
  const count = Number((db.prepare(`SELECT COUNT(*) AS count FROM execution_projects p WHERE ${whereSql}`).get(...values) as { count: number }).count);
  const offset = (filters.page - 1) * filters.pageSize;
  const pagination = filters.health ? "" : "LIMIT ? OFFSET ?";
  const rows = asRows<Record<string, unknown>>(
    db.prepare(
      `SELECT p.*,
        COALESCE(a.name, a.phone, '') AS manager_name,
        COALESCE((SELECT ph.name FROM execution_project_phases ph
          WHERE ph.project_id = p.id AND ph.status IN ('IN_PROGRESS', 'PENDING')
          ORDER BY CASE ph.status WHEN 'IN_PROGRESS' THEN 0 ELSE 1 END, ph.sort_order LIMIT 1), '') AS current_phase,
        (SELECT COUNT(*) FROM execution_project_tasks t WHERE t.project_id = p.id AND t.deleted_at IS NULL AND t.status NOT IN ('DRAFT', 'CANCELLED')) AS published_task_count,
        (SELECT COUNT(*) FROM execution_project_tasks t WHERE t.project_id = p.id AND t.deleted_at IS NULL AND t.status = 'DONE') AS done_task_count,
        (SELECT COUNT(*) FROM execution_project_tasks t WHERE t.project_id = p.id AND t.deleted_at IS NULL AND t.status NOT IN ('DONE', 'CANCELLED') AND t.due_at IS NOT NULL AND t.due_at < CURRENT_TIMESTAMP) AS overdue_task_count,
        (SELECT COUNT(*) FROM execution_project_tasks t WHERE t.project_id = p.id AND t.deleted_at IS NULL AND t.status = 'BLOCKED') AS blocked_task_count,
        (SELECT COUNT(*) FROM execution_project_records r WHERE r.project_id = p.id AND r.deleted_at IS NULL AND r.record_type = 'RISK' AND r.status != 'CLOSED') AS open_risk_count,
        (SELECT COUNT(*) FROM execution_project_records r WHERE r.project_id = p.id AND r.deleted_at IS NULL AND r.record_type = 'ISSUE' AND r.status != 'CLOSED') AS open_issue_count
       FROM execution_projects p
       LEFT JOIN admin_accounts a ON a.id = p.manager_admin_id
       WHERE ${whereSql}
       ORDER BY CASE p.health WHEN 'RED' THEN 0 WHEN 'YELLOW' THEN 1 ELSE 2 END,
         CASE WHEN p.activity_start_at IS NULL THEN 1 ELSE 0 END,
         p.activity_start_at ASC, p.updated_at DESC, p.id DESC
         ${pagination}`,
    ),
    ...values,
    ...(filters.health ? [] : [filters.pageSize, offset]),
  );
  const projected = rows
    .map((row) => {
      const health = getProjectHealthSnapshot(Number(row.id), db);
      return projectListItem({ ...row, health: health.health, health_reasons: healthReasonText(health) });
    })
    .filter((item) => !filters.health || item.healthStatus === filters.health);
  const visible = filters.health ? projected.slice(offset, offset + filters.pageSize) : projected;
  return {
    items: visible,
    page: filters.page,
    pageSize: filters.pageSize,
    total: filters.health ? projected.length : count,
    totalPages: Math.ceil((filters.health ? projected.length : count) / filters.pageSize),
  };
}

function projectListItem(row: Record<string, unknown>) {
  const overdue = Number(row.overdue_task_count || 0);
  const blocked = Number(row.blocked_task_count || 0);
  const healthReasons = Array.isArray(row.health_reasons) ? row.health_reasons.map(String) : [
    blocked > 0 ? `${blocked} 个任务阻塞` : "",
    overdue > 0 ? `${overdue} 个任务逾期` : "",
    Number(row.open_risk_count || 0) > 0 ? `${Number(row.open_risk_count)} 个未关闭风险` : "",
    Number(row.open_issue_count || 0) > 0 ? `${Number(row.open_issue_count)} 个未关闭问题` : "",
  ].filter(Boolean);
  return {
    id: Number(row.id),
    name: String(row.name || ""),
    code: String(row.code || ""),
    venueName: String(row.venue_name || ""),
    currentPhase: String(row.current_phase || ""),
    executionStatus: String(row.status || ""),
    healthStatus: String(row.health || ""),
    healthReasons,
    activityStartAt: row.activity_start_at || null,
    activityEndAt: row.activity_end_at || null,
    projectManager: { id: row.manager_admin_id || null, name: String(row.manager_name || "") },
    publishedTaskCount: Number(row.published_task_count || 0),
    doneTaskCount: Number(row.done_task_count || 0),
    overdueTaskCount: overdue,
    blockedTaskCount: blocked,
    openRiskCount: Number(row.open_risk_count || 0),
    openIssueCount: Number(row.open_issue_count || 0),
    updatedAt: String(row.updated_at || ""),
  };
}

export function getExecutionProjectDetail(projectId: number, db: SqliteDb = getDb()) {
  const project = getExecutionProject(projectId, db);
  if (!project) return null;
  const manager = db.prepare("SELECT id, name, phone FROM admin_accounts WHERE id = ?").get(project.manager_admin_id) as
    | { id: number; name: string; phone: string }
    | undefined;
  const stats = db.prepare(
    `SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN status NOT IN ('DRAFT', 'CANCELLED') THEN 1 ELSE 0 END) AS published,
      SUM(CASE WHEN status = 'DONE' THEN 1 ELSE 0 END) AS done,
      SUM(CASE WHEN status = 'BLOCKED' THEN 1 ELSE 0 END) AS blocked,
      SUM(CASE WHEN status NOT IN ('DONE', 'CANCELLED') AND due_at IS NOT NULL AND due_at < CURRENT_TIMESTAMP THEN 1 ELSE 0 END) AS overdue
     FROM execution_project_tasks WHERE project_id = ? AND deleted_at IS NULL`,
  ).get(projectId) as Record<string, unknown>;
  const recordStats = db.prepare(
    `SELECT
      SUM(CASE WHEN record_type = 'RISK' AND status != 'CLOSED' THEN 1 ELSE 0 END) AS open_risk_count,
      SUM(CASE WHEN record_type = 'ISSUE' AND status != 'CLOSED' THEN 1 ELSE 0 END) AS open_issue_count,
      SUM(CASE WHEN record_type = 'RISK' AND status != 'CLOSED' AND payload_json LIKE '%"probability":"HIGH"%' THEN 1 ELSE 0 END) AS high_risk_count
     FROM execution_project_records WHERE project_id = ? AND deleted_at IS NULL`,
  ).get(projectId) as Record<string, unknown>;
  const milestones = asRows<Record<string, unknown>>(
    db.prepare(
      `SELECT * FROM execution_project_milestones
       WHERE project_id = ? ORDER BY CASE WHEN due_at IS NULL THEN 1 ELSE 0 END, due_at, sort_order LIMIT 5`,
    ),
    projectId,
  );
  const activity = asRows<Record<string, unknown>>(
    db.prepare(
      `SELECT id, actor_admin_id, action, entity_type, entity_id, payload_json, created_at
       FROM execution_project_activity_logs WHERE project_id = ? ORDER BY id DESC LIMIT 10`,
    ),
    projectId,
  );
  const blocked = Number(stats.blocked || 0);
  const overdue = Number(stats.overdue || 0);
  const health = getProjectHealthSnapshot(projectId, db);
  return {
    project,
    currentPhase: (db.prepare(
      `SELECT * FROM execution_project_phases WHERE project_id = ?
       ORDER BY CASE status WHEN 'IN_PROGRESS' THEN 0 WHEN 'PENDING' THEN 1 ELSE 2 END, sort_order LIMIT 1`,
    ).get(projectId) || null),
    health: health.health,
    healthReasons: healthReasonText(health),
    projectManager: manager || null,
    members: listProjectMembers(projectId, db),
    taskStats: {
      total: Number(stats.total || 0),
      published: Number(stats.published || 0),
      done: Number(stats.done || 0),
      blocked,
      overdue,
    },
    recordStats: {
      openRisk: Number(recordStats.open_risk_count || 0),
      openIssue: Number(recordStats.open_issue_count || 0),
      highRisk: Number(recordStats.high_risk_count || 0),
    },
    milestones,
    recentActivity: activity,
  };
}

export function listExecutionProjectPhases(projectId: number, db: SqliteDb = getDb()) {
  return asRows<Record<string, unknown>>(
    db.prepare(
      "SELECT * FROM execution_project_phases WHERE project_id = ? ORDER BY sort_order, id",
    ),
    projectId,
  );
}

export function listExecutionProjectMilestones(projectId: number, db: SqliteDb = getDb()) {
  return asRows<Record<string, unknown>>(
    db.prepare(
      `SELECT * FROM execution_project_milestones
       WHERE project_id = ?
       ORDER BY CASE WHEN due_at IS NULL THEN 1 ELSE 0 END, due_at, sort_order, id`,
    ),
    projectId,
  );
}

export function listExecutionProjectTasks(
  projectId: number,
  viewer: { principal: AdminPrincipal; membership: ProjectMemberRow | null },
  filters: { phaseId?: number; status?: string; ownerId?: number; approverId?: number; overdue?: boolean; critical?: boolean; scope?: "mine" | "review"; page: number; pageSize: number },
  db: SqliteDb = getDb(),
) {
  const where = ["t.project_id = ?", "t.deleted_at IS NULL"];
  const values: SQLInputValue[] = [projectId];
  const canSeeDraft = viewer.principal.role === "super" || viewer.membership?.role === "PROJECT_MANAGER";
  if (!canSeeDraft) where.push("t.status != 'DRAFT'");
  if (filters.phaseId) { where.push("t.phase_id = ?"); values.push(filters.phaseId); }
  if (filters.status) { where.push("t.status = ?"); values.push(filters.status); }
  if (filters.ownerId) { where.push("t.owner_id = ?"); values.push(filters.ownerId); }
  if (filters.approverId) { where.push("t.approver_id = ?"); values.push(filters.approverId); }
  if (filters.scope === "mine" && viewer.principal.id !== null) { where.push("t.owner_id = ?"); values.push(viewer.principal.id); }
  if (filters.scope === "review" && viewer.principal.id !== null) { where.push("t.approver_id = ? AND t.status = 'REVIEW'"); values.push(viewer.principal.id); }
  if (filters.overdue) where.push("t.status NOT IN ('DONE', 'CANCELLED') AND t.due_at IS NOT NULL AND t.due_at < CURRENT_TIMESTAMP");
  if (filters.critical) where.push("t.is_key = 1");
  const whereSql = where.join(" AND ");
  const total = Number((db.prepare(`SELECT COUNT(*) AS count FROM execution_project_tasks t WHERE ${whereSql}`).get(...values) as { count: number }).count);
  const offset = (filters.page - 1) * filters.pageSize;
  const rows = asRows<Record<string, unknown>>(
    db.prepare(
      `SELECT t.*, p.name AS phase_name, p.sort_order AS phase_order
       FROM execution_project_tasks t
       LEFT JOIN execution_project_phases p ON p.id = t.phase_id
       WHERE ${whereSql}
       ORDER BY t.is_key DESC, CASE WHEN t.due_at IS NULL THEN 1 ELSE 0 END, t.due_at, t.id
       LIMIT ? OFFSET ?`,
    ),
    ...values,
    filters.pageSize,
    offset,
  );
  return { items: rows, page: filters.page, pageSize: filters.pageSize, total, totalPages: Math.ceil(total / filters.pageSize) };
}

export function isProjectCodeAvailable(code: string, db: SqliteDb = getDb(), excludingProjectId?: number) {
  const row = db.prepare(
    "SELECT id FROM execution_projects WHERE code = ? AND deleted_at IS NULL AND (? IS NULL OR id != ?)",
  ).get(code, excludingProjectId ?? null, excludingProjectId ?? null) as { id: number } | undefined;
  return !row;
}

export function insertProjectActivityLog(
  db: SqliteDb,
  input: {
    projectId: number;
    actorAdminId?: number | null;
    action: string;
    entityType: string;
    entityId?: number | null;
    payload?: Record<string, unknown>;
  },
) {
  const result = db.prepare(
    `INSERT INTO execution_project_activity_logs(
      project_id, actor_admin_id, action, entity_type, entity_id, payload_json
    ) VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(
    input.projectId,
    input.actorAdminId ?? null,
    input.action,
    input.entityType,
    input.entityId ?? null,
    JSON.stringify(input.payload || {}),
  );
  return Number(result.lastInsertRowid);
}

export function createDefaultPhases(projectId: number, ownerId: number | null, db: SqliteDb = getDb()) {
  const insert = db.prepare(
    `INSERT INTO execution_project_phases(project_id, code, name, sort_order, gate_definition, owner_id)
     VALUES (?, ?, ?, ?, ?, ?)`,
  );
  for (const [index, [code, name]] of DEFAULT_PHASES.entries()) {
    insert.run(projectId, code, name, index, `${name}阶段完成条件`, ownerId);
  }
  return DEFAULT_PHASES.length;
}

export function createDefaultMilestones(projectId: number, ownerId: number | null, db: SqliteDb = getDb()) {
  const insert = db.prepare(
    `INSERT INTO execution_project_milestones(
      project_id, code, name, sort_order, acceptance_criteria, is_key, owner_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );
  for (const [index, [code, name]] of DEFAULT_MILESTONES.entries()) {
    const isKey = code === "M10" || code === "M11" ? 1 : 0;
    insert.run(projectId, code, name, index, `${name}完成并记录确认结果`, isKey, ownerId);
  }
  return DEFAULT_MILESTONES.length;
}

export function seedExecutionSopStructure(db: SqliteDb = getDb()) {
  const insertTemplate = db.prepare(
    "INSERT OR IGNORE INTO execution_sop_templates(code, name, description) VALUES (?, ?, ?)",
  );
  const insertVersion = db.prepare(
    `INSERT OR IGNORE INTO execution_sop_versions(
      template_id, version_number, status, notes
    ) SELECT id, 1, 'PUBLISHED', '第 1A 批结构化种子'
      FROM execution_sop_templates WHERE code = ?`,
  );
  const insertTask = db.prepare(
    `INSERT OR IGNORE INTO execution_sop_task_templates(
      sop_version_id, phase_code, task_code, title, description, sort_order, is_key,
      deliverables, acceptance_criteria
    ) SELECT v.id, ?, ?, ?, ?, 1, 0, '阶段任务草稿', '完成任务说明并提交成果'
      FROM execution_sop_versions v
      JOIN execution_sop_templates t ON t.id = v.template_id
      WHERE t.code = ? AND v.version_number = 1`,
  );
  for (const [code, name] of DEFAULT_SOP_TEMPLATES) {
    insertTemplate.run(code, name, `${name}标准作业模板`);
    insertVersion.run(code);
  }
  for (const task of DEFAULT_SOP_TASKS) {
    insertTask.run(
      task.phaseCode,
      `${task.code}_TASK_01`,
      `${task.name}任务`,
      `执行${task.name}标准作业`,
      task.code,
    );
  }
  return DEFAULT_SOP_TEMPLATES.length;
}

export function instantiateSopTasks(
  projectId: number,
  sopVersionId: number,
  ownerId: number | null,
  db: SqliteDb = getDb(),
) {
  const templates = asRows<{
    phase_code: string;
    task_code: string;
    title: string;
    description: string;
    is_key: number;
    deliverables: string;
    acceptance_criteria: string;
  }>(
    db.prepare(
      `SELECT phase_code, task_code, title, description, is_key, deliverables, acceptance_criteria
       FROM execution_sop_task_templates WHERE sop_version_id = ? ORDER BY sort_order, id`,
    ),
    sopVersionId,
  );
  const insert = db.prepare(
    `INSERT INTO execution_project_tasks(
      project_id, phase_id, code, title, description, owner_id, is_key, deliverables, acceptance_criteria,
      sop_template_id, sop_version_id
    ) SELECT ?, p.id, ?, ?, ?, ?, ?, ?, ?, v.template_id, v.id
      FROM execution_project_phases p
      JOIN execution_sop_versions v ON v.id = ?
      WHERE p.project_id = ? AND p.code = ?`,
  );
  for (const template of templates) {
    insert.run(
      projectId,
      template.task_code,
      template.title,
      template.description,
      ownerId,
      template.is_key,
      template.deliverables,
      template.acceptance_criteria,
      sopVersionId,
      projectId,
      template.phase_code,
    );
  }
  return templates.length;
}

export function createExecutionProject(
  input: CreateExecutionProjectInput,
  db: SqliteDb = getDb(),
): CreatedExecutionProject {
  return withSavepoint(db, () => {
    if (!isProjectCodeAvailable(input.code, db)) throw new Error("Project code already exists");
    const projectResult = db.prepare(
      `INSERT INTO execution_projects(
        code, name, source, description, manager_admin_id, created_by_admin_id, created_by_label,
        source_creator_id, source_venue_id, source_event_id, source_design_session_id,
        source_design_draft_id, source_reference_id, venue_name, venue_contact_name, venue_contact_info,
        venue_address, activity_direction, activity_start_at, activity_end_at, move_in_at, move_out_at,
        scale_description, cooperation_mode, budget_range_text, known_constraints, priority,
        creation_basis, confirmed_items, unconfirmed_items, notes, starts_at, target_end_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      input.code,
      input.name,
      input.source,
      input.description || "",
      input.managerAdminId ?? null,
      input.createdByAdminId ?? null,
      input.createdByLabel || "",
      input.sourceCreatorId ?? null,
      input.sourceVenueId ?? null,
      input.sourceEventId ?? null,
      input.sourceDesignSessionId ?? null,
      input.sourceDesignDraftId ?? null,
      input.sourceReferenceId || "",
      input.venueName || "",
      input.venueContactName || "",
      input.venueContactInfo || "",
      input.venueAddress || "",
      input.activityDirection || "",
      input.activityStartAt ?? null,
      input.activityEndAt ?? null,
      input.moveInAt ?? null,
      input.moveOutAt ?? null,
      input.scaleDescription || "",
      input.cooperationMode || "",
      input.budgetRangeText || "",
      input.knownConstraints || "",
      input.priority || "NORMAL",
      input.creationBasis || "",
      input.confirmedItems || "",
      input.unconfirmedItems || "",
      input.notes || "",
      input.startsAt ?? null,
      input.targetEndAt ?? null,
    );
    const projectId = Number(projectResult.lastInsertRowid);
    if (input.managerAdminId) {
      db.prepare(
        "INSERT INTO execution_project_members(project_id, user_id, role) VALUES (?, ?, 'PROJECT_MANAGER')",
      ).run(projectId, input.managerAdminId);
    }
    const memberInsert = db.prepare(
      "INSERT INTO execution_project_members(project_id, user_id, role) VALUES (?, ?, ?)",
    );
    for (const member of input.members || []) memberInsert.run(projectId, member.userId, member.role);
    const phaseCount = createDefaultPhases(projectId, input.managerAdminId ?? null, db);
    const milestoneCount = createDefaultMilestones(projectId, input.managerAdminId ?? null, db);
    seedExecutionSopStructure(db);
    const sopVersionIds = input.sopVersionIds?.length
      ? input.sopVersionIds
      : input.sopVersionId
        ? [input.sopVersionId]
        : asRows<{ id: number }>(
          db.prepare(
            `SELECT v.id FROM execution_sop_versions v
             JOIN execution_sop_templates t ON t.id = v.template_id
             WHERE v.version_number = 1 AND v.status = 'PUBLISHED'
             ORDER BY t.id`,
          ),
        ).map((row) => row.id);
    const taskCount = sopVersionIds.reduce(
      (count, versionId) => count + instantiateSopTasks(projectId, versionId, input.managerAdminId ?? null, db),
      0,
    );
    insertProjectActivityLog(db, {
      projectId,
      actorAdminId: input.createdByAdminId ?? input.managerAdminId ?? null,
      action: "PROJECT_CREATED",
      entityType: "PROJECT",
      entityId: projectId,
      payload: { phaseCount, milestoneCount, taskCount, createdByLabel: input.createdByLabel || "" },
    });
    const project = getExecutionProject(projectId, db);
    if (!project) throw new Error("Created project could not be read back");
    return { project, phaseCount, milestoneCount, taskCount };
  });
}

export function getProjectDependencyCycle(projectId: number, db: SqliteDb = getDb()) {
  const edges = asRows<{ task_id: number; depends_on_task_id: number }>(
    db.prepare(
      `SELECT d.task_id, d.depends_on_task_id
       FROM execution_task_dependencies d
       JOIN execution_project_tasks t ON t.id = d.task_id
       WHERE t.project_id = ?`,
    ),
    projectId,
  );
  return findDependencyCycle(edges.map((edge) => ({
    taskId: edge.task_id,
    dependsOnTaskId: edge.depends_on_task_id,
  })));
}

export function countProjectTasks(projectId: number, db: SqliteDb = getDb()) {
  const row = db.prepare(
    "SELECT COUNT(*) AS count FROM execution_project_tasks WHERE project_id = ? AND deleted_at IS NULL",
  ).get(projectId) as { count: number };
  return Number(row.count);
}

export type ExecutionTaskSummary = {
  id: number;
  status: TaskStatus;
  owner_id: number | null;
  approver_id: number | null;
};
