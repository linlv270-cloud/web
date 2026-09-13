import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, test } from "node:test";

const dataDir = mkdtempSync(path.join(tmpdir(), "qideng-project-center-dashboard-"));
process.env.DATA_DIR = dataDir;
process.env.DATABASE_PATH = path.join(dataDir, "dashboard.sqlite");
process.env.NODE_ENV = "production";
delete process.env.QIDENG_BOOTSTRAP_INVITE_CODE;

const database = await import("../lib/database.ts");
const repository = await import("../lib/repository.ts");
const projects = await import("../lib/execution-projects.ts");
const workflow = await import("../lib/execution-project-workflow.ts");
const health = await import("../lib/project-health.ts");
const dashboard = await import("../lib/project-dashboard.ts");
const operations = await import("../lib/execution-project-operations.ts");
const records = await import("../lib/execution-project-records.ts");
const migration = readFileSync(path.join(import.meta.dirname, "../scripts/migrations/001_execution_project_center.sql"), "utf8");
const db = database.getDb();
db.exec(migration);

const manager = repository.createAdminAccount("驾驶舱经理", "18850001001", "超级管理员").find((item) => item.phone === "18850001001");
const member = repository.createAdminAccount("驾驶舱成员", "18850001002", "超级管理员").find((item) => item.phone === "18850001002");
const outsider = repository.createAdminAccount("无权账号", "18850001003", "超级管理员").find((item) => item.phone === "18850001003");
assert.ok(manager && member && outsider);
const managerPrincipal = { id: manager.id, role: "subadmin", label: "驾驶舱经理" };
const memberPrincipal = { id: member.id, role: "subadmin", label: "驾驶舱成员" };
const superPrincipal = { id: null, role: "super", label: "超级管理员" };

const first = projects.createExecutionProject({
  code: "PRJ-DASH-001",
  name: "驾驶舱红色项目",
  source: "VENUE_REQUEST",
  managerAdminId: manager.id,
  members: [{ userId: member.id, role: "MEMBER" }],
  activityStartAt: "2026-12-01T10:00:00.000Z",
}, db);
const second = projects.createExecutionProject({
  code: "PRJ-DASH-002",
  name: "驾驶舱另一项目",
  source: "CONCEPT_FIRST",
  managerAdminId: outsider.id,
}, db);
const projectId = first.project.id;
const phaseId = Number(db.prepare("SELECT id FROM execution_project_phases WHERE project_id = ? ORDER BY id LIMIT 1").get(projectId).id);
const keyTask = workflow.createTask(projectId, managerPrincipal, {
  phaseId,
  title: "关键阻塞任务",
  ownerId: member.id,
  approverId: manager.id,
  dueAt: "2026-09-01T10:00:00.000Z",
  deliverables: ["成果"],
  acceptanceCriteria: ["标准"],
  isCritical: true,
}, db);
db.prepare("UPDATE execution_project_tasks SET status = 'BLOCKED', blocker_reason = '供应商未确认', blocker_impact = '影响开场' WHERE id = ?").run(keyTask.id);

test("dashboard is permission-scoped, unpaginated, and uses the same health rules", () => {
  const managerDashboard = dashboard.getProjectDashboard(managerPrincipal, db, new Date("2026-09-13T00:00:00.000Z"));
  const memberDashboard = dashboard.getProjectDashboard(memberPrincipal, db, new Date("2026-09-13T00:00:00.000Z"));
  const superDashboard = dashboard.getProjectDashboard(superPrincipal, db, new Date("2026-09-13T00:00:00.000Z"));
  assert.equal(managerDashboard.scopeProjectCount, 1);
  assert.equal(memberDashboard.scopeProjectCount, 1);
  assert.equal(superDashboard.scopeProjectCount, 2);
  assert.equal(managerDashboard.stats.blockedTasks, 1);
  assert.equal(managerDashboard.stats.redProjects, 1);
  assert.equal(health.getProjectHealthSnapshot(projectId, db, new Date("2026-09-13T00:00:00.000Z")).health, "RED");
  assert.equal(projects.listExecutionProjects(managerPrincipal, { page: 1, pageSize: 20, health: "RED" }, db).items[0].healthStatus, "RED");
});

test("project controls require a reason for manual red and are included in the shared health result", () => {
  assert.throws(() => operations.updateProjectControls(projectId, managerPrincipal, {
    healthOverride: true,
  }, db), /标红.*原因/);
  operations.updateProjectControls(projectId, managerPrincipal, {
    healthOverride: true,
    healthOverrideReason: "管理者确认供应商风险需要持续升级",
    settlementStatusNote: "待结算",
    followUpNotes: "下周跟进",
  }, db);
  const snapshot = health.getProjectHealthSnapshot(projectId, db, new Date("2026-09-13T00:00:00.000Z"));
  assert.equal(snapshot.health, "RED");
  assert.equal(snapshot.reasons.some((item) => item.kind === "PROJECT" && /人工标红/.test(item.label) && /供应商风险/.test(item.reason)), true);
  assert.equal(db.prepare("SELECT action FROM execution_project_activity_logs WHERE project_id = ? ORDER BY id DESC LIMIT 1").get(projectId).action, "PROJECT_CONTROLS_UPDATED");
});

test("stage gate, milestone completion, retrospective, close check, cancel, and archive are explicit", () => {
  assert.throws(() => operations.completePhase(projectId, phaseId, managerPrincipal, { action: "COMPLETE" }, db), /阶段门|例外/);
  operations.completePhase(projectId, phaseId, managerPrincipal, { action: "COMPLETE", exceptionReason: "供应商风险已登记，允许例外推进" }, db);
  const milestone = db.prepare("SELECT id FROM execution_project_milestones WHERE project_id = ? ORDER BY id LIMIT 1").get(projectId);
  operations.completeMilestone(projectId, Number(milestone.id), managerPrincipal, { action: "COMPLETE", completionNote: "已完成现场确认" }, db);
  operations.saveProjectRetrospective(projectId, managerPrincipal, {
    goalsAchieved: "完成核心交付",
    mainProblems: "供应商排期",
    nextTimeImprovements: "提前锁定资源",
    summary: "项目复盘",
  }, db);
  operations.completeProjectRetrospective(projectId, managerPrincipal, {}, db);
  const blockedCheck = operations.getProjectCloseCheck(projectId, managerPrincipal, db);
  assert.equal(blockedCheck.passed, false);
  assert.ok(blockedCheck.blockingItems.some((item) => item.code === "OPEN_TASKS"));
  db.prepare("UPDATE execution_project_tasks SET status = 'DONE', blocker_reason = '', blocker_impact = '' WHERE project_id = ?").run(projectId);
  db.prepare("UPDATE execution_project_milestones SET status = 'COMPLETED', completed_at = CURRENT_TIMESTAMP WHERE project_id = ? AND is_key = 1").run(projectId);
  db.prepare("UPDATE execution_projects SET settlement_status_note = '已完成结算核对', follow_up_notes = '无后续事项' WHERE id = ?").run(projectId);
  const readyCheck = operations.getProjectCloseCheck(projectId, managerPrincipal, db);
  assert.equal(readyCheck.passed, true);
  assert.throws(() => operations.updateProjectLifecycle(projectId, "close", managerPrincipal, { closeType: "COMPLETED", closeNotes: "完成" }, db), /超级管理员/);
  operations.updateProjectLifecycle(projectId, "close", superPrincipal, { closeType: "COMPLETED", closeNotes: "项目完成" }, db);
  assert.equal(db.prepare("SELECT status FROM execution_projects WHERE id = ?").get(projectId).status, "COMPLETED");
  operations.updateProjectLifecycle(projectId, "archive", superPrincipal, { archiveReason: "复盘完成并归档" }, db);
  assert.equal(db.prepare("SELECT status FROM execution_projects WHERE id = ?").get(projectId).status, "ARCHIVED");
  assert.throws(() => records.createProjectRecord(projectId, managerPrincipal, { type: "RISK", title: "归档后", content: "禁止写入" }, db), /只读|权限|不存在/);
});

test("cancellation preserves history and requires a reason", () => {
  const project = projects.createExecutionProject({
    code: "PRJ-DASH-CANCEL",
    name: "提前取消项目",
    source: "VENUE_REQUEST",
    managerAdminId: manager.id,
  }, db);
  assert.throws(() => operations.updateProjectLifecycle(project.project.id, "close", superPrincipal, { closeType: "CANCELLED" }, db), /原因/);
  operations.updateProjectLifecycle(project.project.id, "close", superPrincipal, {
    closeType: "CANCELLED",
    cancellationReason: "合作方取消",
    completedWork: "完成前期沟通",
    unfinishedItems: "未开始制作",
    incurredCosts: "无",
    restartPossible: true,
  }, db);
  assert.equal(db.prepare("SELECT status FROM execution_projects WHERE id = ?").get(project.project.id).status, "CANCELLED");
  assert.ok(db.prepare("SELECT COUNT(*) AS count FROM execution_project_activity_logs WHERE project_id = ? AND action = 'PROJECT_CANCELLED'").get(project.project.id).count === 1);
});

after(() => {
  db.close();
  rmSync(dataDir, { recursive: true, force: true });
});
