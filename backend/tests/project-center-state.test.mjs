import assert from "node:assert/strict";
import { test } from "node:test";
import {
  calculateProjectHealth,
  findDependencyCycle,
  isTaskOverdue,
  validateTaskTransition,
} from "../lib/execution-project-state.ts";

const readyContext = {
  ownerId: 1,
  approverId: 2,
  dueAt: "2026-09-20T00:00:00.000Z",
  deliverables: "方案文件",
  acceptanceCriteria: "完成内部评审",
};

test("task state machine allows the normal draft to review path", () => {
  assert.equal(validateTaskTransition("DRAFT", "READY", readyContext).allowed, true);
  assert.equal(validateTaskTransition("READY", "IN_PROGRESS").allowed, true);
  assert.equal(validateTaskTransition("IN_PROGRESS", "REVIEW", {
    resultSummary: "已完成",
    evidence: [{ externalUrl: "https://example.test/evidence" }],
  }).allowed, true);
});

test("task state machine rejects illegal transitions and missing required fields", () => {
  assert.match(validateTaskTransition("DRAFT", "DONE").reason, /not allowed/);
  assert.match(validateTaskTransition("DRAFT", "READY", {}).reason, /READY requires/);
  assert.match(validateTaskTransition("IN_PROGRESS", "WAITING_EXTERNAL", {}).reason, /WAITING requires/);
  assert.match(validateTaskTransition("IN_PROGRESS", "BLOCKED", {}).reason, /BLOCKED requires/);
  assert.match(validateTaskTransition("IN_PROGRESS", "REVIEW", { resultSummary: "完成" }).reason, /evidence/);
  assert.match(validateTaskTransition("REVIEW", "REVISION_REQUIRED", {
    resultSummary: "完成",
    evidence: [{ note: "已核对" }],
  }, { actorId: 1 }).reason, /Only the designated/);
  assert.match(validateTaskTransition("REVIEW", "REVISION_REQUIRED", {
    resultSummary: "完成",
    evidence: [{ note: "已核对" }],
  }, { actorId: 2, isApprover: true }).reason, /revision reason/);
  assert.match(validateTaskTransition("REVIEW", "DONE", {
    resultSummary: "完成",
    evidence: [{ note: "已核对" }],
  }).reason, /Only the designated/);
  assert.match(validateTaskTransition("DONE", "IN_PROGRESS", {}, { actorId: null, isProjectManager: true }).reason, /actor/);
});

test("task state machine requires a reason and actor to reopen or cancel", () => {
  assert.match(validateTaskTransition("DONE", "IN_PROGRESS", {}, {
    actorId: 7,
    isProjectManager: true,
  }).reason, /reopening.*reason/i);
  assert.equal(validateTaskTransition("DONE", "IN_PROGRESS", {
    reopenedBy: 7,
    reopenReason: "需求变化",
  }, { actorId: 7, isProjectManager: true }).allowed, true);
  assert.match(validateTaskTransition("IN_PROGRESS", "CANCELLED", {}).reason, /cancellation reason/);
  assert.equal(validateTaskTransition("IN_PROGRESS", "CANCELLED", { cancelReason: "客户取消" }).allowed, true);
});

test("overdue and health calculations distinguish green, yellow, and red", () => {
  const now = new Date("2026-09-12T00:00:00.000Z");
  assert.equal(isTaskOverdue({ status: "IN_PROGRESS", dueAt: "2026-09-11T00:00:00.000Z" }, now), true);
  assert.equal(isTaskOverdue({ status: "DONE", dueAt: "2026-09-01T00:00:00.000Z" }, now), false);
  assert.equal(calculateProjectHealth({ tasks: [], openBlockerCount: 0 }, now), "GREEN");
  assert.equal(calculateProjectHealth({
    tasks: [{ status: "IN_PROGRESS", dueAt: "2026-09-11T00:00:00.000Z", isKey: true }],
  }, now), "YELLOW");
  assert.equal(calculateProjectHealth({ tasks: [], openBlockerCount: 1 }, now), "RED");
  assert.equal(calculateProjectHealth({ tasks: [], hasCriticalRisk: true }, now), "RED");
});

test("dependency cycle detection returns the cycle and accepts a DAG", () => {
  assert.equal(findDependencyCycle([
    { taskId: 1, dependsOnTaskId: 2 },
    { taskId: 2, dependsOnTaskId: 3 },
  ]), null);
  assert.deepEqual(findDependencyCycle([
    { taskId: 1, dependsOnTaskId: 2 },
    { taskId: 2, dependsOnTaskId: 3 },
    { taskId: 3, dependsOnTaskId: 1 },
  ]), [1, 2, 3, 1]);
});
