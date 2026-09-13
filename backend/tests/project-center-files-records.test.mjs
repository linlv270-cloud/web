import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, test } from "node:test";

const dataDir = mkdtempSync(path.join(tmpdir(), "qideng-project-center-files-"));
process.env.DATA_DIR = dataDir;
process.env.DATABASE_PATH = path.join(dataDir, "project-center.sqlite");
process.env.NODE_ENV = "production";
delete process.env.QIDENG_BOOTSTRAP_INVITE_CODE;

const database = await import("../lib/database.ts");
const repository = await import("../lib/repository.ts");
const projects = await import("../lib/execution-projects.ts");
const workflow = await import("../lib/execution-project-workflow.ts");
const files = await import("../lib/execution-project-files.ts");
const records = await import("../lib/execution-project-records.ts");
const migration = readFileSync(path.join(import.meta.dirname, "../scripts/migrations/001_execution_project_center.sql"), "utf8");

const db = database.getDb();
db.exec(migration);
const manager = repository.createAdminAccount("文件经理", "18840001001", "超级管理员").find((item) => item.phone === "18840001001");
const member = repository.createAdminAccount("文件成员", "18840001002", "超级管理员").find((item) => item.phone === "18840001002");
const observer = repository.createAdminAccount("只读观察员", "18840001003", "超级管理员").find((item) => item.phone === "18840001003");
const outsider = repository.createAdminAccount("项目外账号", "18840001004", "超级管理员").find((item) => item.phone === "18840001004");
assert.ok(manager && member && observer && outsider);

const superPrincipal = { id: null, role: "super", label: "超级管理员" };
const managerPrincipal = { id: manager.id, role: "subadmin", label: "文件经理" };
const memberPrincipal = { id: member.id, role: "subadmin", label: "文件成员" };
const observerPrincipal = { id: observer.id, role: "subadmin", label: "只读观察员" };
const outsiderPrincipal = { id: outsider.id, role: "subadmin", label: "项目外账号" };

const first = projects.createExecutionProject({
  code: "PRJ-FILES-001",
  name: "文件证据项目",
  source: "VENUE_REQUEST",
  managerAdminId: manager.id,
  members: [{ userId: member.id, role: "MEMBER" }, { userId: observer.id, role: "OBSERVER" }],
}, db);
const second = projects.createExecutionProject({
  code: "PRJ-FILES-002",
  name: "其他项目",
  source: "CONCEPT_FIRST",
  managerAdminId: manager.id,
}, db);
const projectId = first.project.id;
const otherProjectId = second.project.id;
const phaseId = Number(db.prepare("SELECT id FROM execution_project_phases WHERE project_id = ? ORDER BY id LIMIT 1").get(projectId).id);
const task = workflow.createTask(projectId, managerPrincipal, {
  phaseId,
  title: "需要文件证据的任务",
  ownerId: member.id,
  approverId: manager.id,
  dueAt: "2026-10-01T10:00:00.000Z",
  deliverables: ["文件"],
  acceptanceCriteria: ["版本可追溯"],
}, db);
workflow.publishPlan(projectId, managerPrincipal, [task.id], db);
workflow.transitionTask(projectId, task.id, "START", memberPrincipal, {}, db);

const pdf = Buffer.from("%PDF-1.7\n1 0 obj\n<<>>\nendobj\n", "utf8");
const uploadInput = {
  name: "现场方案",
  assetType: "PDF",
  phaseId,
  taskId: task.id,
  versionNote: "初版",
  originalName: "proposal.pdf",
  mimeType: "application/pdf",
  body: pdf,
};

test("file permissions, validation, versioning, and final replacement are enforced", async () => {
  await assert.rejects(() => files.createProjectFile(projectId, outsiderPrincipal, uploadInput, db), /membership|项目成员/);
  await assert.rejects(() => files.createProjectFile(projectId, observerPrincipal, uploadInput, db), /观察员|权限|read-only/);
  await assert.rejects(() => files.createProjectFile(projectId, memberPrincipal, { ...uploadInput, originalName: "bad.html", mimeType: "text/html" }, db), /不支持|类型/);

  const created = await files.createProjectFile(projectId, memberPrincipal, uploadInput, db);
  const assetId = Number(created.asset.id);
  const firstVersionId = Number(created.versions[0].id);
  assert.equal(created.versions[0].version_number, 1);
  assert.equal(created.versions[0].status, "DRAFT");
  assert.equal(files.listProjectFiles(projectId, observerPrincipal, { page: 1, pageSize: 20 }, db).total, 1);
  assert.throws(() => files.getProjectFileDownload(otherProjectId, assetId, firstVersionId, managerPrincipal, db), /不存在/);

  const versionTwo = await files.addProjectFileVersion(projectId, assetId, memberPrincipal, {
    ...uploadInput,
    originalName: "proposal-v2.pdf",
    versionNote: "补充尺寸",
  }, db);
  assert.equal(versionTwo.versions.length, 2);
  assert.equal(versionTwo.asset.current_version_number, 2);
  assert.equal(versionTwo.versions.find((item) => item.version_number === 1).status, "SUPERSEDED");
  assert.notEqual(versionTwo.versions.find((item) => item.version_number === 1).storage_key, versionTwo.versions.find((item) => item.version_number === 2).storage_key);

  files.changeProjectFileVersionStatus(projectId, assetId, 2, memberPrincipal, { status: "IN_REVIEW" }, db);
  files.changeProjectFileVersionStatus(projectId, assetId, 2, managerPrincipal, { status: "APPROVED" }, db);
  files.changeProjectFileVersionStatus(projectId, assetId, 2, managerPrincipal, { status: "FINAL", comment: "正式交付" }, db);
  await assert.rejects(() => files.addProjectFileVersion(projectId, assetId, memberPrincipal, {
    ...uploadInput,
    originalName: "proposal-v3.pdf",
  }, db), /FINAL|项目经理/);
  await assert.rejects(() => files.addProjectFileVersion(projectId, assetId, managerPrincipal, {
    ...uploadInput,
    originalName: "proposal-v3.pdf",
  }, db), /填写原因/);
  const replacement = await files.addProjectFileVersion(projectId, assetId, managerPrincipal, {
    ...uploadInput,
    originalName: "proposal-v3.pdf",
    replacementReason: "最终确认后补充现场尺寸",
  }, db);
  assert.equal(replacement.asset.current_version_number, 3);
  assert.equal(replacement.versions.find((item) => item.version_number === 2).status, "SUPERSEDED");
  assert.ok(db.prepare("SELECT COUNT(*) AS count FROM execution_project_activity_logs WHERE project_id = ? AND action = 'FINAL_FILE_SUPERSEDED'").get(projectId).count >= 1);

  const archiveCandidate = await files.createProjectFile(projectId, managerPrincipal, {
    ...uploadInput,
    phaseId: null,
    taskId: null,
    name: "待归档文件",
    originalName: "archive.pdf",
  }, db);
  assert.deepEqual(files.archiveProjectFile(projectId, Number(archiveCandidate.asset.id), managerPrincipal, { reason: "项目已完成归档" }, db), { archived: true });
  assert.equal(files.listProjectFiles(projectId, managerPrincipal, { page: 1, pageSize: 20 }, db).items.some((item) => Number(item.id) === Number(archiveCandidate.asset.id)), false);
  await assert.rejects(() => files.addProjectFileVersion(projectId, Number(archiveCandidate.asset.id), managerPrincipal, {
    ...uploadInput,
    originalName: "archive-v2.pdf",
  }, db), /文件不存在|已归档/);
});

test("task submissions retain fixed file-version evidence and reject cross-project references", async () => {
  const asset = files.listProjectFiles(projectId, memberPrincipal, { page: 1, pageSize: 20 }, db).items[0];
  const currentVersionId = Number(asset.current_version_id);
  const other = await files.createProjectFile(otherProjectId, superPrincipal, {
    ...uploadInput,
    phaseId: null,
    taskId: null,
    name: "其他项目文件",
  }, db);
  assert.throws(() => workflow.submitTask(projectId, task.id, memberPrincipal, {
    resultSummary: "交付",
    fileVersionIds: [Number(other.versions[0].id)],
  }, db), /当前项目/);
  const submitted = workflow.submitTask(projectId, task.id, memberPrincipal, {
    resultSummary: "交付",
    fileVersionIds: [currentVersionId],
  }, db);
  assert.equal(submitted.approvals[0].fileVersionIds[0], currentVersionId);
  assert.equal(db.prepare("SELECT file_version_ids FROM execution_task_approvals WHERE task_id = ?").get(task.id).file_version_ids, JSON.stringify([currentVersionId]));
  assert.equal(db.prepare("SELECT file_version_id FROM execution_task_evidence WHERE task_id = ? ORDER BY id DESC LIMIT 1").get(task.id).file_version_id, currentVersionId);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM execution_task_approvals WHERE task_id = ?").get(task.id).count, 1);
  workflow.decideTask(projectId, task.id, "REJECTED", managerPrincipal, { rejectionReason: "需要补充说明" }, db);
  workflow.transitionTask(projectId, task.id, "START", memberPrincipal, {}, db);
  const secondSubmission = workflow.submitTask(projectId, task.id, memberPrincipal, {
    resultSummary: "补充交付",
    noFileEvidenceReason: "本次仅补充文字说明",
  }, db);
  assert.equal(secondSubmission.approvals.length, 2);
  assert.equal(secondSubmission.approvals.find((item) => Number(item.submission_number) === 1).fileVersionIds[0], currentVersionId);
});

test("records enforce role, references, activity read-only, and before-after history", () => {
  const communication = records.createProjectRecord(projectId, memberPrincipal, {
    type: "COMMUNICATION",
    title: "场地沟通",
    content: "确认进场时间",
    taskId: task.id,
  }, db);
  assert.equal(communication.record_type, "COMMUNICATION");
  assert.throws(() => records.createProjectRecord(projectId, memberPrincipal, { type: "DECISION", title: "决策", content: "不允许" }, db), /只能创建/);
  assert.throws(() => records.createProjectRecord(projectId, observerPrincipal, { type: "COMMUNICATION", title: "只读", content: "不允许" }, db), /read-only|只读/);
  assert.throws(() => records.createProjectRecord(projectId, memberPrincipal, { type: "ACTIVITY", title: "日志", content: "不允许" }, db), /只读/);
  assert.throws(() => records.createProjectRecord(projectId, memberPrincipal, { type: "ISSUE", title: "跨项目", content: "不允许", taskId: 999999 }, db), /当前项目/);
  const risk = records.createProjectRecord(projectId, memberPrincipal, {
    type: "RISK",
    title: "现场延期风险",
    content: "进场时间仍待确认",
    status: "MONITORING",
    ownerAdminId: manager.id,
    probability: "HIGH",
    impact: "HIGH",
    prevention: "提前锁定进场窗口",
    response: "准备备用日期",
  }, db);
  assert.equal(risk.payload.probability, "HIGH");
  assert.equal(records.listProjectRecords(projectId, observerPrincipal, { page: 1, pageSize: 20, ownerId: manager.id, status: "MONITORING" }, db).items.some((item) => item.id === risk.id), true);
  const today = String(db.prepare("SELECT occurred_at FROM execution_project_records WHERE id = ?").get(risk.id).occurred_at).slice(0, 10);
  assert.equal(records.listProjectRecords(projectId, observerPrincipal, { page: 1, pageSize: 20, from: today, to: today }, db).items.some((item) => item.id === risk.id), true);
  const updated = records.updateProjectRecord(projectId, communication.id, memberPrincipal, { content: "已确认进场时间和联系人" }, db);
  assert.equal(updated.content, "已确认进场时间和联系人");
  records.updateProjectRecord(projectId, communication.id, managerPrincipal, { status: "CLOSED" }, db);
  assert.throws(() => records.updateProjectRecord(projectId, communication.id, memberPrincipal, { content: "再次修改" }, db), /未关闭|只能修改/);
  const activityList = records.listProjectRecords(projectId, observerPrincipal, { page: 1, pageSize: 100, type: "ACTIVITY" }, db);
  assert.ok(activityList.items.length > 0);
  assert.ok(activityList.items.every((item) => item.record_type === "ACTIVITY" && item.readOnly === true));
  assert.ok(db.prepare("SELECT COUNT(*) AS count FROM execution_project_activity_logs WHERE project_id = ? AND action = 'RECORD_UPDATED'").get(projectId).count >= 1);
});

after(() => {
  db.close();
  rmSync(dataDir, { recursive: true, force: true });
});
