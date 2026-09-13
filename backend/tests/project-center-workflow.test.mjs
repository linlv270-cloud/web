import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, test } from "node:test";

const dataDir = mkdtempSync(path.join(tmpdir(), "qideng-project-workflow-"));
process.env.DATA_DIR = dataDir;
process.env.NODE_ENV = "production";
delete process.env.QIDENG_BOOTSTRAP_INVITE_CODE;

const database = await import("../lib/database.ts");
const repository = await import("../lib/repository.ts");
const projects = await import("../lib/execution-projects.ts");
const workflow = await import("../lib/execution-project-workflow.ts");
const migration = readFileSync(path.join(import.meta.dirname, "../scripts/migrations/001_execution_project_center.sql"), "utf8");

const db = database.getDb();
db.exec(migration);
const manager = repository.createAdminAccount("项目经理", "18830001001", "超级管理员").find((item) => item.phone === "18830001001");
const member = repository.createAdminAccount("执行成员", "18830001002", "超级管理员").find((item) => item.phone === "18830001002");
const observer = repository.createAdminAccount("观察员", "18830001003", "超级管理员").find((item) => item.phone === "18830001003");
assert.ok(manager && member && observer);

const managerPrincipal = { id: manager.id, role: "subadmin", label: "项目经理" };
const memberPrincipal = { id: member.id, role: "subadmin", label: "执行成员" };
const superPrincipal = { id: null, role: "super", label: "超级管理员" };
const created = projects.createExecutionProject({
  code: "PRJ-WORKFLOW-001",
  name: "任务闭环测试项目",
  source: "VENUE_REQUEST",
  managerAdminId: manager.id,
  members: [{ userId: member.id, role: "MEMBER" }, { userId: observer.id, role: "OBSERVER" }],
}, db);
const projectId = created.project.id;
const phaseId = db.prepare("SELECT id FROM execution_project_phases WHERE project_id = ? ORDER BY id LIMIT 1").get(projectId).id;

test("project members enforce roles, duplicates, manager retention, and task reassignment", () => {
  assert.equal(workflow.listMembers(projectId, managerPrincipal, db).length, 3);
  assert.throws(() => workflow.addMember(projectId, managerPrincipal, { userId: member.id, role: "MEMBER" }, db), /已经是项目成员/);
  const managerMembershipBefore = workflow.listMembers(projectId, managerPrincipal, db).find((item) => item.user_id === manager.id);
  assert.ok(managerMembershipBefore);
  assert.throws(() => workflow.updateMember(projectId, managerMembershipBefore.id, memberPrincipal, { role: "MEMBER" }, db), /不能管理成员|项目经理|requested project permission/);
  const added = repository.createAdminAccount("临时成员", "18830001004", "超级管理员").find((item) => item.phone === "18830001004");
  assert.ok(added);
  workflow.addMember(projectId, managerPrincipal, { userId: added.id, role: "MEMBER", functionalLabel: "制作" }, db);
  const task = workflow.createTask(projectId, managerPrincipal, {
    phaseId,
    title: "临时成员任务",
    ownerId: added.id,
    approverId: member.id,
    dueAt: "2026-10-01T10:00:00.000Z",
    deliverables: ["交付物"],
    acceptanceCriteria: ["验收标准"],
  }, db);
  const addedMembership = workflow.listMembers(projectId, managerPrincipal, db).find((item) => item.user_id === added.id);
  assert.ok(addedMembership);
  assert.throws(() => workflow.removeMember(projectId, addedMembership.id, managerPrincipal, db), /重新分配/);
  db.prepare("UPDATE execution_project_tasks SET status = 'DONE' WHERE id = ?").run(task.id);
  workflow.removeMember(projectId, addedMembership.id, managerPrincipal, db);
  const managerMembership = workflow.listMembers(projectId, managerPrincipal, db).find((item) => item.user_id === manager.id);
  assert.ok(managerMembership);
  assert.throws(() => workflow.removeMember(projectId, managerMembership.id, managerPrincipal, db), /至少保留一个项目经理|不能移除项目经理/);
});

test("task creation rejects invalid people and dependency cycles", () => {
  assert.throws(() => workflow.createTask(projectId, managerPrincipal, {
    phaseId, title: "无效负责人", ownerId: 99999, approverId: member.id,
  }, db), /不是项目成员/);
  const first = workflow.createTask(projectId, managerPrincipal, { phaseId, title: "依赖 A", ownerId: member.id, approverId: member.id }, db);
  const second = workflow.createTask(projectId, managerPrincipal, { phaseId, title: "依赖 B", ownerId: member.id, approverId: member.id, dependencyTaskIds: [first.id] }, db);
  assert.throws(() => workflow.updateTask(projectId, first.id, managerPrincipal, {
    phaseId, title: "依赖 A", ownerId: member.id, approverId: member.id, dependencyTaskIds: [second.id],
  }, db), /循环/);
});

test("publish is atomic and task execution requires dependencies", () => {
  const incomplete = workflow.createTask(projectId, managerPrincipal, { phaseId, title: "不完整草稿", ownerId: member.id }, db);
  assert.throws(() => workflow.publishPlan(projectId, managerPrincipal, [incomplete.id], db), (error) => error.taskErrors?.some((item) => item.taskId === incomplete.id));
  assert.equal(db.prepare("SELECT status FROM execution_project_tasks WHERE id = ?").get(incomplete.id).status, "DRAFT");
  const dependency = workflow.createTask(projectId, managerPrincipal, {
    phaseId, title: "前置任务", ownerId: member.id, approverId: member.id, dueAt: "2026-10-01T10:00:00.000Z",
    deliverables: ["前置交付"], acceptanceCriteria: ["前置验收"],
  }, db);
  const dependent = workflow.createTask(projectId, managerPrincipal, {
    phaseId, title: "后续任务", ownerId: member.id, approverId: member.id, dueAt: "2026-10-02T10:00:00.000Z",
    deliverables: ["后续交付"], acceptanceCriteria: ["后续验收"], dependencyTaskIds: [dependency.id],
  }, db);
  workflow.publishPlan(projectId, managerPrincipal, [dependency.id, dependent.id], db);
  assert.throws(() => workflow.transitionTask(projectId, dependent.id, "START", memberPrincipal, {}, db), /依赖/);
  workflow.transitionTask(projectId, dependent.id, "START", managerPrincipal, { overrideReason: "客户要求先行" }, db);
  assert.equal(db.prepare("SELECT action FROM execution_project_activity_logs WHERE entity_id = ? AND action = 'DEPENDENCY_OVERRIDE'").get(dependent.id).action, "DEPENDENCY_OVERRIDE");
});

test("waiting, blocking, submission, rejection, resubmission and approval retain history", () => {
  const task = workflow.createTask(projectId, managerPrincipal, {
    phaseId, title: "完整闭环任务", ownerId: member.id, approverId: member.id, dueAt: "2026-10-03T10:00:00.000Z",
    deliverables: ["完整成果"], acceptanceCriteria: ["成果符合要求"],
  }, db);
  workflow.publishPlan(projectId, managerPrincipal, [task.id], db);
  workflow.transitionTask(projectId, task.id, "START", memberPrincipal, {}, db);
  assert.throws(() => workflow.transitionTask(projectId, task.id, "WAIT_EXTERNAL", memberPrincipal, {}, db), /WAITING|等待/);
  workflow.transitionTask(projectId, task.id, "WAIT_EXTERNAL", memberPrincipal, { waitingFor: "场地方", waitingReason: "等待确认", nextFollowUpAt: "2026-09-20T10:00:00.000Z" }, db);
  workflow.transitionTask(projectId, task.id, "RESUME", memberPrincipal, { resolutionNote: "已收到确认" }, db);
  workflow.transitionTask(projectId, task.id, "BLOCK", memberPrincipal, { blockerReason: "供应商未排期", blockerImpact: "影响制作" }, db);
  workflow.transitionTask(projectId, task.id, "RESUME", memberPrincipal, { resolutionNote: "已重新排期" }, db);
  workflow.submitTask(projectId, task.id, memberPrincipal, { resultSummary: "第一次成果", evidenceLinks: ["https://example.test/one"] }, db);
  workflow.decideTask(projectId, task.id, "REJECTED", memberPrincipal, { rejectionReason: "需要补充尺寸" }, db);
  workflow.transitionTask(projectId, task.id, "START", memberPrincipal, {}, db);
  workflow.submitTask(projectId, task.id, memberPrincipal, { resultSummary: "第二次成果", noFileEvidenceReason: "现场已口头确认，无文件证据" }, db);
  workflow.decideTask(projectId, task.id, "APPROVED", memberPrincipal, {}, db);
  assert.equal(db.prepare("SELECT status FROM execution_project_tasks WHERE id = ?").get(task.id).status, "DONE");
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM execution_task_approvals WHERE task_id = ?").get(task.id).count, 2);
  assert.equal(db.prepare("SELECT MIN(submission_number) AS first, MAX(submission_number) AS last FROM execution_task_approvals WHERE task_id = ?").get(task.id).last, 2);
  assert.ok(db.prepare("SELECT COUNT(*) AS count FROM execution_project_activity_logs WHERE entity_id = ? AND action IN ('TASK_WAITING_EXTERNAL', 'TASK_BLOCKED', 'TASK_SUBMITTED', 'TASK_REJECTED', 'TASK_APPROVED')").get(task.id).count >= 5);
});

test("done tasks require a reason to reopen and cannot be physically deleted", () => {
  const task = workflow.createTask(projectId, managerPrincipal, { phaseId, title: "重开任务", ownerId: member.id, approverId: member.id }, db);
  assert.throws(() => workflow.deleteTask(projectId, task.id, memberPrincipal, db), /无权|requested project permission/);
  workflow.deleteTask(projectId, task.id, managerPrincipal, db);
  const done = workflow.createTask(projectId, managerPrincipal, { phaseId, title: "已完成任务", ownerId: member.id, approverId: member.id }, db);
  db.prepare("UPDATE execution_project_tasks SET status = 'DONE' WHERE id = ?").run(done.id);
  assert.throws(() => workflow.deleteTask(projectId, done.id, managerPrincipal, db), /不能物理删除/);
  assert.throws(() => workflow.transitionTask(projectId, done.id, "REOPEN", managerPrincipal, {}, db), /reason|原因/);
  workflow.transitionTask(projectId, done.id, "REOPEN", managerPrincipal, { reopenReason: "客户提出新版本" }, db);
  assert.equal(db.prepare("SELECT status FROM execution_project_tasks WHERE id = ?").get(done.id).status, "IN_PROGRESS");
});

after(() => {
  db.close();
  rmSync(dataDir, { recursive: true, force: true });
});
