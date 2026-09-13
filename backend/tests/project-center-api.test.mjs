import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, test } from "node:test";

const dataDir = mkdtempSync(path.join(tmpdir(), "qideng-project-center-api-"));
process.env.DATA_DIR = dataDir;
process.env.NODE_ENV = "production";
delete process.env.QIDENG_BOOTSTRAP_INVITE_CODE;

const database = await import("../lib/database.ts");
const auth = await import("../lib/auth.ts");
const repository = await import("../lib/repository.ts");
const projectsRoute = await import("../app/api/admin/projects/route.ts");
const projectRoute = await import("../app/api/admin/projects/[projectId]/route.ts");
const phasesRoute = await import("../app/api/admin/projects/[projectId]/phases/route.ts");
const milestonesRoute = await import("../app/api/admin/projects/[projectId]/milestones/route.ts");
const tasksRoute = await import("../app/api/admin/projects/[projectId]/tasks/route.ts");
const { seedExecutionSopStructure } = await import("../lib/execution-projects.ts");

const migration = readFileSync(
  path.join(import.meta.dirname, "../scripts/migrations/001_execution_project_center.sql"),
  "utf8",
);

function request(pathname, init = {}) {
  return new Request(`http://localhost${pathname}`, init);
}

function session(principal) {
  return auth.createAdminSession(request("/api/admin/projects"), principal).cookie;
}

const superPrincipal = { id: null, role: "super", label: "超级管理员" };
const managerAccounts = repository.createAdminAccount("项目经理", "18820001001", "超级管理员");
const managerAccount = managerAccounts.find((item) => item.phone === "18820001001");
const outsiderAccounts = repository.createAdminAccount("外部管理员", "18820001002", "超级管理员");
const outsiderAccount = outsiderAccounts.find((item) => item.phone === "18820001002");
const unrelatedAccounts = repository.createAdminAccount("无关管理员", "18820001003", "超级管理员");
const unrelatedAccount = unrelatedAccounts.find((item) => item.phone === "18820001003");
assert.ok(managerAccount);
assert.ok(outsiderAccount);
assert.ok(unrelatedAccount);
const managerPrincipal = { id: managerAccount.id, role: "subadmin", label: "项目经理" };
const outsiderPrincipal = { id: outsiderAccount.id, role: "subadmin", label: "外部管理员" };
const unrelatedPrincipal = { id: unrelatedAccount.id, role: "subadmin", label: "无关管理员" };

const baseBody = {
  name: "秋季城市展陈项目",
  source: "VENUE_REQUEST",
  venueName: "测试场地",
  venueContactName: "场地联系人",
  venueContactInfo: "13800000000",
  activityDirection: "面向城市公众的设计体验活动",
  activityStartAt: "2026-10-10T10:00:00.000Z",
  activityEndAt: "2026-10-12T18:00:00.000Z",
  projectManagerId: managerAccount.id,
  creationBasis: "场地方正式提出合作需求",
  confirmedItems: "活动城市、合作方向",
  unconfirmedItems: "最终预算、制作供应商",
  sourceReferenceId: "VENUE-REQ-001",
};

async function postProject(body, cookie = session(superPrincipal)) {
  return projectsRoute.POST(request("/api/admin/projects", {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify(body),
  }));
}

test("authenticated API reports schema not ready without running a migration", async () => {
  const response = await projectsRoute.GET(request("/api/admin/projects", {
    headers: { cookie: session(superPrincipal) },
  }));
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), {
    errorCode: "PROJECT_CENTER_SCHEMA_NOT_READY",
    error: "项目中台数据库尚未初始化",
  });
});

test("API requires login and only super administrators can create projects", async () => {
  const unauthenticated = await projectsRoute.GET(request("/api/admin/projects"));
  assert.equal(unauthenticated.status, 401);

  database.getDb().exec(migration);
  const subadminCreate = await postProject(baseBody, session(managerPrincipal));
  assert.equal(subadminCreate.status, 403);
});

test("manual project creation validates required fields and dates", async () => {
  const missing = await postProject({ ...baseBody, confirmedItems: "" });
  assert.equal(missing.status, 400);
  const backwards = await postProject({
    ...baseBody,
    activityEndAt: "2026-10-01T18:00:00.000Z",
  });
  assert.equal(backwards.status, 400);
  const invalidManager = await postProject({ ...baseBody, projectManagerId: 99999 });
  assert.equal(invalidManager.status, 400);
  const automatic = await postProject({ ...baseBody, auto: true });
  assert.equal(automatic.status, 400);
});

test("super administrator creates one complete manual project transaction", async () => {
  const response = await postProject({ ...baseBody, code: "PRJ-MANUAL-001", createdByAdminId: 99999 });
  assert.equal(response.status, 201);
  const payload = await response.json();
  assert.equal(payload.counts.phases, 12);
  assert.equal(payload.counts.milestones, 14);
  assert.ok(payload.counts.draftTasks >= 10);
  projectId = payload.project.id;
  const db = database.getDb();
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM execution_projects").get().count, 1);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM execution_project_phases WHERE project_id = ?").get(projectId).count, 12);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM execution_project_milestones WHERE project_id = ?").get(projectId).count, 14);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM execution_project_tasks WHERE project_id = ? AND status = 'DRAFT'").get(projectId).count >= 10, true);
  assert.equal(db.prepare("SELECT created_by_admin_id FROM execution_projects WHERE id = ?").get(projectId).created_by_admin_id, null);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM execution_project_activity_logs WHERE project_id = ? AND action = 'PROJECT_CREATED'").get(projectId).count, 1);
  return projectId;
});

let projectId = 0;

test("duplicate code returns conflict and source reference remains passive", async () => {
  const duplicate = await postProject({ ...baseBody, code: "PRJ-MANUAL-001" });
  assert.equal(duplicate.status, 409);
  const second = await postProject({ ...baseBody, code: "PRJ-MANUAL-003", sourceReferenceId: "VENUE-REQ-001" });
  assert.equal(second.status, 201);
  assert.equal(database.getDb().prepare("SELECT COUNT(*) AS count FROM execution_projects WHERE source_reference_id = 'VENUE-REQ-001'").get().count, 2);
});

test("super and members can read project resources while outsiders cannot", async () => {
  const superDetail = await projectRoute.GET(request(`/api/admin/projects/${projectId}`, {
    headers: { cookie: session(superPrincipal) },
  }), { params: Promise.resolve({ projectId: String(projectId) }) });
  assert.equal(superDetail.status, 200);
  const phases = await phasesRoute.GET(request(`/api/admin/projects/${projectId}/phases`, {
    headers: { cookie: session(superPrincipal) },
  }), { params: Promise.resolve({ projectId: String(projectId) }) });
  assert.equal((await phases.json()).phases.length, 12);
  const milestones = await milestonesRoute.GET(request(`/api/admin/projects/${projectId}/milestones`, {
    headers: { cookie: session(superPrincipal) },
  }), { params: Promise.resolve({ projectId: String(projectId) }) });
  assert.equal((await milestones.json()).milestones.length, 14);

  const db = database.getDb();
  db.prepare("INSERT INTO execution_project_members(project_id, user_id, role) VALUES (?, ?, 'MEMBER')").run(projectId, outsiderAccount.id);
  const memberTasks = await tasksRoute.GET(request(`/api/admin/projects/${projectId}/tasks`, {
    headers: { cookie: session(outsiderPrincipal) },
  }), { params: Promise.resolve({ projectId: String(projectId) }) });
  assert.equal(memberTasks.status, 200);
  assert.equal((await memberTasks.json()).items.some((task) => task.status === "DRAFT"), false);
  const outsiderDetail = await projectRoute.GET(request(`/api/admin/projects/${projectId}`, {
    headers: { cookie: session(unrelatedPrincipal) },
  }), { params: Promise.resolve({ projectId: String(projectId) }) });
  assert.equal(outsiderDetail.status, 404);
});

test("project manager can read draft tasks, and list pagination and filters are server-side", async () => {
  const db = database.getDb();
  const managerProject = db.prepare(
    "SELECT project_id FROM execution_project_members WHERE user_id = ? AND role = 'PROJECT_MANAGER' LIMIT 1",
  ).get(managerAccount.id).project_id;
  const tasks = await tasksRoute.GET(request(`/api/admin/projects/${managerProject}/tasks?status=DRAFT&page=1&pageSize=5`, {
    headers: { cookie: session(managerPrincipal) },
  }), { params: Promise.resolve({ projectId: String(managerProject) }) });
  const taskPayload = await tasks.json();
  assert.equal(tasks.status, 200);
  assert.ok(taskPayload.items.length <= 5);
  assert.ok(taskPayload.total >= 10);

  const list = await projectsRoute.GET(request("/api/admin/projects?page=1&pageSize=1&keyword=秋季", {
    headers: { cookie: session(superPrincipal) },
  }));
  const listPayload = await list.json();
  assert.equal(list.status, 200);
  assert.equal(listPayload.pageSize, 1);
  assert.ok(listPayload.total >= 1);
  assert.equal(listPayload.items.length, 1);
});

after(() => {
  database.getDb().close();
  rmSync(dataDir, { recursive: true, force: true });
});
