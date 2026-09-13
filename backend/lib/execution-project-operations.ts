import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { getDb } from "./database";
import { getExecutionProject, getProjectMember, insertProjectActivityLog } from "./execution-projects";
import { canProjectAction } from "./project-permissions";
import type { AdminPrincipal } from "./types";

type Db = Pick<DatabaseSync, "prepare" | "exec">;

export class ProjectOperationsError extends Error {
  status: number;
  details?: Record<string, unknown>;
  constructor(message: string, status = 400, details?: Record<string, unknown>) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export function projectOperationsErrorResponse(error: unknown) {
  if (error instanceof ProjectOperationsError) {
    return Response.json({ error: error.message, ...(error.details || {}) }, { status: error.status, headers: { "cache-control": "no-store" } });
  }
  return Response.json({ error: error instanceof Error ? error.message : "项目操作失败" }, { status: 400 });
}

function text(value: unknown, max = 5000) {
  return typeof value === "string" || typeof value === "number" ? String(value).trim().slice(0, max) : "";
}

function access(projectId: number, principal: AdminPrincipal, action: "VIEW_PROJECT" | "EDIT_PROJECT") {
  const db = getDb();
  const project = getExecutionProject(projectId, db);
  if (!project) throw new ProjectOperationsError("项目不存在", 404);
  const member = principal.role === "super" || principal.id === null ? null : getProjectMember(projectId, principal.id, db);
  const permission = canProjectAction(principal, member ? { userId: member.user_id, role: member.role, active: !member.removed_at } : null, action);
  if (!permission.allowed) throw new ProjectOperationsError(permission.reason || "无权操作项目", 403);
  return { db, project, member, isManager: principal.role === "super" || member?.role === "PROJECT_MANAGER" };
}

function projectCloseCheck(projectId: number, db: Db) {
  const blockingItems: Array<Record<string, unknown>> = [];
  const warningItems: Array<Record<string, unknown>> = [];
  const count = (sql: string, ...values: SQLInputValue[]) => Number((db.prepare(sql).get(...values) as { count: number }).count);
  const draft = count("SELECT COUNT(*) AS count FROM execution_project_tasks WHERE project_id = ? AND deleted_at IS NULL AND status = 'DRAFT'", projectId);
  const activeTasks = count("SELECT COUNT(*) AS count FROM execution_project_tasks WHERE project_id = ? AND deleted_at IS NULL AND status IN ('READY','IN_PROGRESS','WAITING_EXTERNAL','WAITING_INTERNAL','BLOCKED','REVIEW','REVISION_REQUIRED')", projectId);
  const openIssues = count("SELECT COUNT(*) AS count FROM execution_project_records WHERE project_id = ? AND deleted_at IS NULL AND record_type = 'ISSUE' AND status NOT IN ('RESOLVED','CLOSED')", projectId);
  const highRisks = count("SELECT COUNT(*) AS count FROM execution_project_records WHERE project_id = ? AND deleted_at IS NULL AND record_type = 'RISK' AND status != 'CLOSED' AND (payload_json LIKE '%\"probability\":\"HIGH\"%' OR payload_json LIKE '%\"impact\":\"HIGH\"%')", projectId);
  const decisions = count("SELECT COUNT(*) AS count FROM execution_project_records WHERE project_id = ? AND deleted_at IS NULL AND record_type = 'DECISION' AND status IN ('OPEN','PROPOSED')", projectId);
  const milestones = count("SELECT COUNT(*) AS count FROM execution_project_milestones WHERE project_id = ? AND is_key = 1 AND status NOT IN ('COMPLETED','SKIPPED')", projectId);
  const fileReview = count("SELECT COUNT(*) AS count FROM execution_file_versions v JOIN execution_file_assets a ON a.id = v.asset_id WHERE a.project_id = ? AND a.deleted_at IS NULL AND v.status IN ('IN_REVIEW','REVISION_REQUIRED')", projectId);
  const finalFiles = count("SELECT COUNT(*) AS count FROM execution_file_versions v JOIN execution_file_assets a ON a.id = v.asset_id WHERE a.project_id = ? AND a.deleted_at IS NULL AND v.status = 'FINAL'", projectId);
  const retrospective = db.prepare("SELECT id, completed_at FROM execution_project_retrospectives WHERE project_id = ?").get(projectId) as Record<string, unknown> | undefined;
  const settlement = db.prepare("SELECT settlement_status_note, follow_up_notes FROM execution_projects WHERE id = ?").get(projectId) as Record<string, unknown>;
  if (draft) blockingItems.push({ code: "DRAFT_TASKS", count: draft, reason: `仍有 ${draft} 个草稿任务未发布` });
  if (activeTasks) blockingItems.push({ code: "OPEN_TASKS", count: activeTasks, reason: `仍有 ${activeTasks} 个任务未完成` });
  if (openIssues) blockingItems.push({ code: "OPEN_ISSUES", count: openIssues, reason: `仍有 ${openIssues} 个未解决问题` });
  if (highRisks) blockingItems.push({ code: "HIGH_RISKS", count: highRisks, reason: `仍有 ${highRisks} 个未关闭高风险` });
  if (decisions) blockingItems.push({ code: "PENDING_DECISIONS", count: decisions, reason: `仍有 ${decisions} 个待决策事项` });
  if (milestones) blockingItems.push({ code: "KEY_MILESTONES", count: milestones, reason: `仍有 ${milestones} 个关键里程碑未完成` });
  if (fileReview) blockingItems.push({ code: "FILES_IN_REVIEW", count: fileReview, reason: `仍有 ${fileReview} 个文件版本待审核或需修改` });
  if (!retrospective?.completed_at) blockingItems.push({ code: "RETROSPECTIVE", reason: "项目复盘尚未完成" });
  if (!settlement?.settlement_status_note) warningItems.push({ code: "SETTLEMENT", reason: "尚未填写结算状态说明" });
  if (!settlement?.follow_up_notes) warningItems.push({ code: "FOLLOW_UP", reason: "尚未填写后续事项处理说明" });
  if (!finalFiles) warningItems.push({ code: "FINAL_FILE", reason: "尚未标记最终交付文件" });
  return {
    passed: blockingItems.length === 0,
    blockingItems,
    warningItems,
    summary: { draftTasks: draft, openTasks: activeTasks, openIssues, highRisks, pendingDecisions: decisions, unfinishedKeyMilestones: milestones, filesInReview: fileReview, finalFiles, retrospectiveCompleted: Boolean(retrospective?.completed_at) },
  };
}

export function getProjectCloseCheck(projectId: number, principal: AdminPrincipal, db: Db = getDb()) {
  const accessResult = access(projectId, principal, "VIEW_PROJECT");
  return projectCloseCheck(projectId, db);
}

export function updateProjectControls(projectId: number, principal: AdminPrincipal, input: Record<string, unknown>, db: Db = getDb()) {
  const result = access(projectId, principal, "EDIT_PROJECT");
  if (!result.isManager) throw new ProjectOperationsError("只有项目经理或超级管理员可以修改项目控制信息", 403);
  if (result.project.status === "ARCHIVED") throw new ProjectOperationsError("归档项目为只读，不能修改", 409);
  const override = Boolean(input.healthOverride);
  const healthOverrideReason = text(input.healthOverrideReason, 2000);
  if (override && !healthOverrideReason) throw new ProjectOperationsError("人工标红必须填写原因", 400);
  const settlementStatusNote = text(input.settlementStatusNote, 3000);
  const followUpNotes = text(input.followUpNotes, 3000);
  const before = db.prepare(
    "SELECT health_override, health_override_reason, settlement_status_note, follow_up_notes FROM execution_projects WHERE id = ?",
  ).get(projectId);
  db.prepare(
    `UPDATE execution_projects
     SET health_override = ?, health_override_reason = ?, settlement_status_note = ?,
         follow_up_notes = ?, updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
  ).run(override ? "RED" : null, override ? healthOverrideReason : "", settlementStatusNote, followUpNotes, projectId);
  insertProjectActivityLog(db, {
    projectId,
    actorAdminId: principal.id,
    action: "PROJECT_CONTROLS_UPDATED",
    entityType: "PROJECT",
    entityId: projectId,
    payload: {
      before,
      after: { healthOverride: override ? "RED" : null, healthOverrideReason, settlementStatusNote, followUpNotes },
    },
  });
  return getExecutionProject(projectId, db);
}

export function getProjectRetrospective(projectId: number, principal: AdminPrincipal, db: Db = getDb()) {
  access(projectId, principal, "VIEW_PROJECT");
  return db.prepare("SELECT * FROM execution_project_retrospectives WHERE project_id = ?").get(projectId) || {
    project_id: projectId,
    goals_achieved: "",
    schedule_variance: "",
    budget_variance_text: "",
    main_problems: "",
    effective_sops: "",
    sop_changes_suggested: "",
    missed_tasks: "",
    reusable_assets: "",
    next_time_improvements: "",
    summary: "",
    completed_at: null,
  };
}

export function saveProjectRetrospective(projectId: number, principal: AdminPrincipal, input: Record<string, unknown>, db: Db = getDb()) {
  const result = access(projectId, principal, "EDIT_PROJECT");
  if (!result.isManager) throw new ProjectOperationsError("只有项目经理或超级管理员可以编辑复盘", 403);
  const current = db.prepare("SELECT * FROM execution_project_retrospectives WHERE project_id = ?").get(projectId) as Record<string, unknown> | undefined;
  const fields = ["goalsAchieved", "scheduleVariance", "budgetVarianceText", "mainProblems", "effectiveSops", "sopChangesSuggested", "missedTasks", "reusableAssets", "nextTimeImprovements", "summary"] as const;
  const values = fields.map((field) => text(input[field], 5000));
  if (current?.completed_at && !text(input.changeReason, 1000)) throw new ProjectOperationsError("完成复盘后再次修改必须填写原因", 400);
  if (current) {
    db.prepare(
      `UPDATE execution_project_retrospectives SET goals_achieved = ?, schedule_variance = ?, budget_variance_text = ?, main_problems = ?,
       effective_sops = ?, sop_changes_suggested = ?, missed_tasks = ?, reusable_assets = ?, next_time_improvements = ?, summary = ?,
       updated_by_admin_id = ?, updated_at = CURRENT_TIMESTAMP WHERE project_id = ?`,
    ).run(...values, principal.id, projectId);
  } else {
    db.prepare(
      `INSERT INTO execution_project_retrospectives(project_id, goals_achieved, schedule_variance, budget_variance_text, main_problems,
       effective_sops, sop_changes_suggested, missed_tasks, reusable_assets, next_time_improvements, summary, created_by_admin_id, updated_by_admin_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(projectId, ...values, principal.id, principal.id);
  }
  insertProjectActivityLog(db, { projectId, actorAdminId: principal.id, action: "RETROSPECTIVE_UPDATED", entityType: "RETROSPECTIVE", entityId: Number(current?.id || 0) || null, payload: { before: current || null, after: input, reason: text(input.changeReason, 1000) } });
  return getProjectRetrospective(projectId, principal, db);
}

export function completeProjectRetrospective(projectId: number, principal: AdminPrincipal, input: Record<string, unknown>, db: Db = getDb()) {
  const result = access(projectId, principal, "EDIT_PROJECT");
  if (!result.isManager) throw new ProjectOperationsError("只有项目经理或超级管理员可以完成复盘", 403);
  const current = db.prepare("SELECT id, completed_at FROM execution_project_retrospectives WHERE project_id = ?").get(projectId) as Record<string, unknown> | undefined;
  if (!current) throw new ProjectOperationsError("请先保存复盘内容", 400);
  if (current.completed_at) return getProjectRetrospective(projectId, principal, db);
  db.prepare("UPDATE execution_project_retrospectives SET completed_at = CURRENT_TIMESTAMP, updated_by_admin_id = ?, updated_at = CURRENT_TIMESTAMP WHERE project_id = ?").run(principal.id, projectId);
  insertProjectActivityLog(db, { projectId, actorAdminId: principal.id, action: "RETROSPECTIVE_COMPLETED", entityType: "RETROSPECTIVE", entityId: Number(current.id), payload: { completedAt: new Date().toISOString() } });
  return getProjectRetrospective(projectId, principal, db);
}

export function updateProjectLifecycle(projectId: number, operation: "pause" | "resume" | "close" | "archive", principal: AdminPrincipal, input: Record<string, unknown>, db: Db = getDb()) {
  const result = access(projectId, principal, "EDIT_PROJECT");
  if (principal.role !== "super") throw new ProjectOperationsError("只有超级管理员可以执行项目生命周期操作", 403);
  const project = result.project;
  if (operation === "pause") {
    if (project.status !== "ACTIVE") throw new ProjectOperationsError("只有执行中的项目可以暂停", 409);
    const reason = text(input.pauseReason, 2000);
    if (!reason) throw new ProjectOperationsError("暂停必须填写原因", 400);
    db.prepare("UPDATE execution_projects SET status = 'PAUSED', paused_reason = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(reason, projectId);
    insertProjectActivityLog(db, { projectId, actorAdminId: principal.id, action: "PROJECT_PAUSED", entityType: "PROJECT", entityId: projectId, payload: { reason } });
  } else if (operation === "resume") {
    if (project.status !== "PAUSED") throw new ProjectOperationsError("只有已暂停的项目可以恢复", 409);
    const reason = text(input.resumeReason, 2000);
    if (!reason) throw new ProjectOperationsError("恢复必须填写原因", 400);
    db.prepare("UPDATE execution_projects SET status = 'ACTIVE', paused_reason = '', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(projectId);
    insertProjectActivityLog(db, { projectId, actorAdminId: principal.id, action: "PROJECT_RESUMED", entityType: "PROJECT", entityId: projectId, payload: { reason } });
  } else if (operation === "close") {
    if (!["ACTIVE", "PAUSED"].includes(project.status)) throw new ProjectOperationsError("当前项目状态不能关闭", 409);
    const closeType = text(input.closeType, 30).toUpperCase();
    const check = projectCloseCheck(projectId, db);
    if (closeType === "COMPLETED") {
      if (!check.passed && !input.override) throw new ProjectOperationsError("关闭检查仍有阻塞项", 409, { blockingItems: check.blockingItems, warningItems: check.warningItems });
      if (input.override && !text(input.overrideReason, 2000)) throw new ProjectOperationsError("例外关闭必须填写原因", 400);
      const closeNotes = text(input.closeNotes, 5000);
      if (!closeNotes) throw new ProjectOperationsError("正常完成必须填写关闭说明", 400);
      db.prepare("UPDATE execution_projects SET status = 'COMPLETED', closed_at = CURRENT_TIMESTAMP, closed_by_admin_id = ?, closure_type = 'COMPLETED', close_notes = ?, close_override_reason = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(principal.id, closeNotes, text(input.overrideReason, 2000), projectId);
      insertProjectActivityLog(db, { projectId, actorAdminId: principal.id, action: input.override ? "PROJECT_CLOSED_WITH_EXCEPTIONS" : "PROJECT_COMPLETED", entityType: "PROJECT", entityId: projectId, payload: { check, closeNotes, overrideReason: text(input.overrideReason, 2000) } });
    } else if (closeType === "CANCELLED") {
      const reason = text(input.cancellationReason, 2000);
      if (!reason) throw new ProjectOperationsError("提前取消必须填写原因", 400);
      const details = { completedWork: text(input.completedWork, 5000), unfinishedItems: text(input.unfinishedItems, 5000), incurredCosts: text(input.incurredCosts, 2000), restartPossible: Boolean(input.restartPossible) };
      db.prepare("UPDATE execution_projects SET status = 'CANCELLED', closed_at = CURRENT_TIMESTAMP, closed_by_admin_id = ?, closure_type = 'CANCELLED', cancelled_reason = ?, cancellation_details = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(principal.id, reason, JSON.stringify(details), projectId);
      insertProjectActivityLog(db, { projectId, actorAdminId: principal.id, action: "PROJECT_CANCELLED", entityType: "PROJECT", entityId: projectId, payload: { reason, details } });
    } else throw new ProjectOperationsError("关闭类型无效", 400);
  } else {
    if (!["COMPLETED", "CANCELLED"].includes(project.status)) throw new ProjectOperationsError("只有已完成或已取消的项目可以归档", 409);
    const reason = text(input.archiveReason, 2000);
    if (!reason) throw new ProjectOperationsError("归档必须填写原因", 400);
    const retrospective = db.prepare("SELECT completed_at FROM execution_project_retrospectives WHERE project_id = ?").get(projectId) as Record<string, unknown> | undefined;
    if (!retrospective?.completed_at) throw new ProjectOperationsError("完成复盘后才能归档", 409);
    db.prepare("UPDATE execution_projects SET status = 'ARCHIVED', archived_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(projectId);
    insertProjectActivityLog(db, { projectId, actorAdminId: principal.id, action: "PROJECT_ARCHIVED", entityType: "PROJECT", entityId: projectId, payload: { reason } });
  }
  return getExecutionProject(projectId, db);
}

export function completePhase(projectId: number, phaseId: number, principal: AdminPrincipal, input: Record<string, unknown>, db: Db = getDb()) {
  const result = access(projectId, principal, "EDIT_PROJECT");
  if (!result.isManager) throw new ProjectOperationsError("只有项目经理可以完成阶段", 403);
  const phase = db.prepare("SELECT * FROM execution_project_phases WHERE id = ? AND project_id = ?").get(phaseId, projectId) as Record<string, unknown> | undefined;
  if (!phase) throw new ProjectOperationsError("阶段不存在", 404);
  const action = text(input.action, 20).toUpperCase();
  if (action === "SKIP") {
    const reason = text(input.reason, 2000);
    if (!reason) throw new ProjectOperationsError("不适用阶段必须填写关闭原因", 400);
    db.prepare("UPDATE execution_project_phases SET status = 'SKIPPED', closed_reason = ?, completed_at = CURRENT_TIMESTAMP, completed_by_admin_id = ?, completion_note = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(reason, principal.id, reason, phaseId);
  } else {
    const open = Number((db.prepare("SELECT COUNT(*) AS count FROM execution_project_tasks WHERE project_id = ? AND phase_id = ? AND deleted_at IS NULL AND status NOT IN ('DONE','CANCELLED')").get(projectId, phaseId) as { count: number }).count);
    const exceptionReason = text(input.exceptionReason, 2000);
    if (open && !exceptionReason) throw new ProjectOperationsError("阶段门未满足，请先完成任务或填写例外原因", 409, { openTaskCount: open });
    db.prepare("UPDATE execution_project_phases SET status = 'COMPLETED', completed_at = CURRENT_TIMESTAMP, completed_by_admin_id = ?, completion_note = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(principal.id, exceptionReason || text(input.completionNote, 2000), phaseId);
  }
  insertProjectActivityLog(db, { projectId, actorAdminId: principal.id, action: action === "SKIP" ? "PHASE_SKIPPED" : "PHASE_COMPLETED", entityType: "PHASE", entityId: phaseId, payload: { before: phase, input } });
  return db.prepare("SELECT * FROM execution_project_phases WHERE id = ?").get(phaseId);
}

export function completeMilestone(projectId: number, milestoneId: number, principal: AdminPrincipal, input: Record<string, unknown>, db: Db = getDb()) {
  const result = access(projectId, principal, "EDIT_PROJECT");
  if (!result.isManager) throw new ProjectOperationsError("只有项目经理可以操作里程碑", 403);
  const milestone = db.prepare("SELECT * FROM execution_project_milestones WHERE id = ? AND project_id = ?").get(milestoneId, projectId) as Record<string, unknown> | undefined;
  if (!milestone) throw new ProjectOperationsError("里程碑不存在", 404);
  const action = text(input.action, 20).toUpperCase();
  const note = text(input.completionNote || input.reason, 3000);
  if (action === "REOPEN") {
    if (!note) throw new ProjectOperationsError("重新打开里程碑必须填写原因", 400);
    db.prepare("UPDATE execution_project_milestones SET status = 'IN_PROGRESS', completed_at = NULL, completed_by_admin_id = NULL, reopen_reason = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(note, milestoneId);
  } else {
    if (!text(milestone.acceptance_criteria, 3000)) throw new ProjectOperationsError("里程碑必须先填写验收条件", 409);
    if (!note) throw new ProjectOperationsError("完成里程碑必须填写完成说明", 400);
    db.prepare("UPDATE execution_project_milestones SET status = 'COMPLETED', completed_at = CURRENT_TIMESTAMP, completed_by_admin_id = ?, completion_note = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(principal.id, note, milestoneId);
  }
  insertProjectActivityLog(db, { projectId, actorAdminId: principal.id, action: action === "REOPEN" ? "MILESTONE_REOPENED" : "MILESTONE_COMPLETED", entityType: "MILESTONE", entityId: milestoneId, payload: { before: milestone, note } });
  return db.prepare("SELECT * FROM execution_project_milestones WHERE id = ?").get(milestoneId);
}
