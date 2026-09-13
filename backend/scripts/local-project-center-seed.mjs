import { readFileSync } from "node:fs";

const database = await import("../lib/database.ts");
const repository = await import("../lib/repository.ts");
const projects = await import("../lib/execution-projects.ts");
const workflow = await import("../lib/execution-project-workflow.ts");
const records = await import("../lib/execution-project-records.ts");

const db = database.getDb();
db.exec(readFileSync(new URL("./migrations/001_execution_project_center.sql", import.meta.url), "utf8"));
const manager = repository.createAdminAccount("本地项目经理", "18860001001", "本地验收").find((item) => item.phone === "18860001001");
const member = repository.createAdminAccount("本地执行成员", "18860001002", "本地验收").find((item) => item.phone === "18860001002");
const observer = repository.createAdminAccount("本地观察员", "18860001003", "本地验收").find((item) => item.phone === "18860001003");
if (!manager || !member || !observer) throw new Error("seed accounts failed");
const project = projects.createExecutionProject({
  code: "LOCAL-5-DEMO",
  name: "第 5 批本地验收项目",
  source: "VENUE_REQUEST",
  managerAdminId: manager.id,
  members: [{ userId: member.id, role: "MEMBER" }, { userId: observer.id, role: "OBSERVER" }],
  venueName: "上海示范场地",
  activityDirection: "展览与线下体验",
  activityStartAt: "2026-09-20T10:00:00.000Z",
  activityEndAt: "2026-09-22T18:00:00.000Z",
  creationBasis: "本地验收",
  confirmedItems: "场地与档期已确认",
  unconfirmedItems: "供应商最终清单待确认",
}, db);
const projectId = project.project.id;
const phase = db.prepare("SELECT id FROM execution_project_phases WHERE project_id = ? ORDER BY sort_order LIMIT 1").get(projectId);
const phase2 = db.prepare("SELECT id FROM execution_project_phases WHERE project_id = ? ORDER BY sort_order LIMIT 1 OFFSET 1").get(projectId);
const milestone = db.prepare("SELECT id FROM execution_project_milestones WHERE project_id = ? ORDER BY sort_order LIMIT 1").get(projectId);
db.prepare("UPDATE execution_project_phases SET starts_at = ?, due_at = ? WHERE id = ?").run("2026-09-13T09:00:00.000Z", "2026-09-18T18:00:00.000Z", phase.id);
db.prepare("UPDATE execution_project_phases SET starts_at = ?, due_at = ? WHERE id = ?").run("2026-09-19T09:00:00.000Z", "2026-09-22T18:00:00.000Z", phase2.id);
db.prepare("UPDATE execution_project_milestones SET due_at = ?, acceptance_criteria = ?, is_key = 1 WHERE id = ?").run("2026-09-17T18:00:00.000Z", "现场验收记录与最终文件已确认", milestone.id);
const principal = { id: manager.id, role: "subadmin", label: "本地项目经理" };
const tasks = [
  { code: "LOCAL-BLOCKED", title: "关键供应商确认", phaseId: phase.id, ownerId: member.id, approverId: manager.id, startAt: "2026-09-13T09:00:00.000Z", dueAt: "2026-09-14T18:00:00.000Z", deliverables: ["确认单"], acceptanceCriteria: ["已确认"], isCritical: true },
  { code: "LOCAL-WAITING", title: "外部物料回传", phaseId: phase.id, ownerId: member.id, approverId: manager.id, startAt: "2026-09-14T09:00:00.000Z", dueAt: "2026-09-16T18:00:00.000Z", deliverables: ["物料包"], acceptanceCriteria: ["文件齐全"] },
  { code: "LOCAL-REVIEW", title: "主视觉方案验收", phaseId: phase2.id, ownerId: member.id, approverId: manager.id, startAt: "2026-09-19T09:00:00.000Z", dueAt: "2026-09-21T18:00:00.000Z", deliverables: ["主视觉"], acceptanceCriteria: ["符合规范"], isCritical: true },
  { code: "LOCAL-READY", title: "现场动线准备", phaseId: phase2.id, ownerId: manager.id, approverId: manager.id, dueAt: "2026-09-22T18:00:00.000Z", deliverables: ["动线图"], acceptanceCriteria: ["确认动线"] },
].map((input) => workflow.createTask(projectId, principal, input, db));
workflow.publishPlan(projectId, principal, tasks.map((task) => task.id), db);
db.prepare("UPDATE execution_project_tasks SET status = 'BLOCKED', blocker_reason = '供应商尚未确认最终数量', blocker_impact = '影响现场搭建' WHERE code = 'LOCAL-BLOCKED'").run();
db.prepare("UPDATE execution_project_tasks SET status = 'WAITING_EXTERNAL', waiting_for = '供应商', waiting_reason = '等待物料清单', next_follow_up_at = '2026-09-15T10:00:00.000Z' WHERE code = 'LOCAL-WAITING'").run();
db.prepare("UPDATE execution_project_tasks SET status = 'REVIEW', result_summary = '方案已提交' WHERE code = 'LOCAL-REVIEW'").run();
records.createProjectRecord(projectId, principal, { type: "RISK", title: "供应商交付风险", content: "供应商确认时间存在不确定性", status: "MONITORING", probability: "HIGH", impact: "HIGH" }, db);
records.createProjectRecord(projectId, principal, { type: "DECISION", title: "是否启用备用供应商", content: "需要管理者确认备用方案", status: "OPEN" }, db);
console.log(JSON.stringify({ projectId, managerId: manager.id, memberId: member.id }));
db.close();
