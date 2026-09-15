import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, test } from "node:test";

const dataDir = mkdtempSync(path.join(tmpdir(), "qideng-project-collaboration-"));
process.env.DATA_DIR = dataDir;
process.env.DATABASE_PATH = path.join(dataDir, "collaboration.sqlite");
process.env.NODE_ENV = "production";
delete process.env.QIDENG_BOOTSTRAP_INVITE_CODE;

const database = await import("../lib/database.ts");
const repository = await import("../lib/repository.ts");
const projects = await import("../lib/execution-projects.ts");
const workflow = await import("../lib/execution-project-workflow.ts");
const work = await import("../lib/execution-project-work.ts");
const notifications = await import("../lib/execution-project-notifications.ts");
const migration = readFileSync(path.join(import.meta.dirname, "../scripts/migrations/001_execution_project_center.sql"), "utf8");
const db = database.getDb();
db.exec(migration);

const manager = repository.createAdminAccount("协作经理", "18870001001", "测试").find((item) => item.phone === "18870001001");
const member = repository.createAdminAccount("协作成员", "18870001002", "测试").find((item) => item.phone === "18870001002");
assert.ok(manager && member);
const managerPrincipal = { id: manager.id, role: "subadmin", label: "协作经理" };
const memberPrincipal = { id: member.id, role: "subadmin", label: "协作成员" };
const project = projects.createExecutionProject({
  code: "PRJ-COLLAB-001", name: "协作体验测试项目", source: "VENUE_REQUEST",
  managerAdminId: manager.id, members: [{ userId: member.id, role: "MEMBER" }],
}, db);
const phaseId = Number(db.prepare("SELECT id FROM execution_project_phases WHERE project_id = ? ORDER BY id LIMIT 1").get(project.project.id).id);

test("published work is visible to the right people and notification delivery is deduplicated", () => {
  const task = workflow.createTask(project.project.id, managerPrincipal, {
    phaseId, title: "发布后的协作任务", ownerId: member.id, approverId: manager.id,
    dueAt: "2026-10-01T10:00:00.000Z", deliverables: ["结果"], acceptanceCriteria: ["通过"],
  }, db);
  workflow.publishPlan(project.project.id, managerPrincipal, [task.id], db);
  const memberWork = work.listMyProjectWork(memberPrincipal, {}, db).items.find((item) => item.id === task.id);
  assert.ok(memberWork);
  assert.equal(work.listMyProjectWork(memberPrincipal, { scope: "review" }, db).items.some((item) => item.id === task.id), false);
  const notices = notifications.listProjectNotifications(memberPrincipal, {}, db);
  assert.equal(notices.items.filter((item) => item.taskId === task.id).length, 1);
  assert.equal(notifications.createProjectNotifications({
    projectId: project.project.id, taskId: task.id, eventType: "TASK_PUBLISHED",
    title: "重复事件", body: "不应重复", recipientIds: [member.id], actorAdminId: manager.id, dedupeSuffix: "fixed",
  }, db), 1);
  assert.equal(notifications.createProjectNotifications({
    projectId: project.project.id, taskId: task.id, eventType: "TASK_PUBLISHED",
    title: "重复事件", body: "不应重复", recipientIds: [member.id], actorAdminId: manager.id, dedupeSuffix: "fixed",
  }, db), 0);
});

test("task edits reject stale versions without overwriting the current task", () => {
  const task = workflow.createTask(project.project.id, managerPrincipal, {
    phaseId, title: "版本保护任务", ownerId: member.id, approverId: manager.id,
    dueAt: "2026-10-02T10:00:00.000Z",
  }, db);
  const current = db.prepare("SELECT * FROM execution_project_tasks WHERE id = ?").get(task.id);
  assert.throws(() => workflow.updateTask(project.project.id, task.id, managerPrincipal, {
    phaseId, title: "不应覆盖", ownerId: member.id, approverId: manager.id,
    expectedUpdatedAt: "2000-01-01 00:00:00",
  }, db), /刚刚被别人修改/);
  assert.equal(db.prepare("SELECT title FROM execution_project_tasks WHERE id = ?").get(task.id).title, "版本保护任务");
  const updated = workflow.updateTask(project.project.id, task.id, managerPrincipal, {
    phaseId, title: "正常更新", ownerId: member.id, approverId: manager.id,
    dueAt: "2026-10-03T10:00:00.000Z", expectedUpdatedAt: current.updated_at,
  }, db);
  assert.equal(updated.title, "正常更新");
});

test("notification read state is scoped to the recipient", () => {
  const before = notifications.listProjectNotifications(memberPrincipal, {}, db).items.find((item) => item.taskTitle === "发布后的协作任务");
  assert.ok(before);
  assert.equal(notifications.markProjectNotificationRead(before.id, managerPrincipal, db), false);
  assert.equal(notifications.markProjectNotificationRead(before.id, memberPrincipal, db), true);
  assert.equal(notifications.listProjectNotifications(memberPrincipal, { unreadOnly: true }, db).items.some((item) => item.id === before.id), false);
});

after(() => {
  db.close();
  rmSync(dataDir, { recursive: true, force: true });
});
