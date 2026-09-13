import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { getDb } from "./database";
import type { HealthStatus, TaskStatus } from "./execution-project-types";

type Db = Pick<DatabaseSync, "prepare">;

export type HealthReason = {
  kind: "TASK" | "MILESTONE" | "RECORD" | "PROJECT";
  id: number | null;
  label: string;
  reason: string;
  severity: "RED" | "YELLOW";
};

export type ProjectHealthSnapshot = {
  status: string;
  health: HealthStatus;
  reasons: HealthReason[];
};

function rows<T>(statement: { all: (...values: SQLInputValue[]) => unknown[] }, ...values: SQLInputValue[]) {
  return statement.all(...values) as T[];
}

function date(value: unknown) {
  if (!value) return null;
  const result = new Date(String(value));
  return Number.isFinite(result.getTime()) ? result : null;
}

function isOverdue(status: string, dueAt: unknown, now: Date) {
  const due = date(dueAt);
  return !["DONE", "CANCELLED", "COMPLETED", "SKIPPED"].includes(status) && Boolean(due && due.getTime() < now.getTime());
}

function highRisk(payload: unknown) {
  try {
    const parsed = JSON.parse(String(payload || "{}")) as Record<string, unknown>;
    return ["HIGH", "高"].includes(String(parsed.probability || "").toUpperCase()) ||
      ["HIGH", "高"].includes(String(parsed.impact || "").toUpperCase());
  } catch {
    return String(payload || "").includes('"probability":"HIGH"') || String(payload || "").includes('"impact":"HIGH"');
  }
}

export function getProjectHealthSnapshot(projectId: number, db: Db = getDb(), now = new Date()): ProjectHealthSnapshot {
  const project = db.prepare(
    "SELECT status, health_override, health_override_reason, activity_start_at, activity_end_at FROM execution_projects WHERE id = ? AND deleted_at IS NULL",
  ).get(projectId) as Record<string, unknown> | undefined;
  if (!project) return { status: "MISSING", health: "GREEN", reasons: [] };

  const reasons: HealthReason[] = [];
  if (project.health_override === "RED") {
    reasons.push({
      kind: "PROJECT",
      id: projectId,
      label: "项目人工标红",
      reason: String(project.health_override_reason || "项目经理或超级管理员人工标红"),
      severity: "RED",
    });
  }

  const tasks = rows<Record<string, unknown>>(db.prepare(
    `SELECT id, title, status, due_at, next_follow_up_at, is_key
     FROM execution_project_tasks WHERE project_id = ? AND deleted_at IS NULL`,
  ), projectId);
  for (const task of tasks) {
    const status = String(task.status);
    if (task.is_key && status === "BLOCKED") reasons.push({ kind: "TASK", id: Number(task.id), label: String(task.title), reason: "关键任务已阻塞", severity: "RED" });
    if (isOverdue(status, task.due_at, now)) reasons.push({ kind: "TASK", id: Number(task.id), label: String(task.title), reason: "任务已逾期", severity: "YELLOW" });
    if (status === "WAITING_INTERNAL") reasons.push({ kind: "TASK", id: Number(task.id), label: String(task.title), reason: "等待内部事项", severity: "YELLOW" });
    if (status === "WAITING_EXTERNAL" && isOverdue(status, task.next_follow_up_at, now)) reasons.push({ kind: "TASK", id: Number(task.id), label: String(task.title), reason: "外部等待已到跟进时间", severity: "YELLOW" });
  }

  const milestones = rows<Record<string, unknown>>(db.prepare(
    "SELECT id, name, due_at, status, is_key FROM execution_project_milestones WHERE project_id = ?",
  ), projectId);
  for (const milestone of milestones) {
    if (milestone.is_key && isOverdue(String(milestone.status), milestone.due_at, now)) {
      reasons.push({ kind: "MILESTONE", id: Number(milestone.id), label: String(milestone.name), reason: "关键里程碑已逾期且未完成", severity: "RED" });
    }
    const due = date(milestone.due_at);
    if (milestone.is_key && due && due.getTime() >= now.getTime() && due.getTime() <= now.getTime() + 7 * 86400000 &&
        String(milestone.status) !== "COMPLETED") {
      const unfinished = Number((db.prepare(
        `SELECT COUNT(*) AS count FROM execution_project_tasks
         WHERE project_id = ? AND milestone_id = ? AND deleted_at IS NULL AND status NOT IN ('DONE', 'CANCELLED')`,
      ).get(projectId, Number(milestone.id)) as { count: number }).count);
      if (unfinished > 0) reasons.push({ kind: "MILESTONE", id: Number(milestone.id), label: String(milestone.name), reason: `未来 7 天到期，仍有 ${unfinished} 个前置任务未完成`, severity: "YELLOW" });
    }
  }

  const records = rows<Record<string, unknown>>(db.prepare(
    `SELECT id, record_type, title, status, payload_json
     FROM execution_project_records WHERE project_id = ? AND deleted_at IS NULL`,
  ), projectId);
  for (const record of records) {
    if (record.record_type === "RISK" && record.status !== "CLOSED" && highRisk(record.payload_json)) {
      reasons.push({ kind: "RECORD", id: Number(record.id), label: String(record.title), reason: "存在未关闭高影响风险", severity: "YELLOW" });
    }
    if (record.record_type === "DECISION" && ["OPEN", "PROPOSED"].includes(String(record.status))) {
      reasons.push({ kind: "RECORD", id: Number(record.id), label: String(record.title), reason: "存在待决策事项", severity: "YELLOW" });
    }
    if (record.record_type === "CHANGE" && String(record.status) === "PROPOSED") {
      reasons.push({ kind: "RECORD", id: Number(record.id), label: String(record.title), reason: "存在待批准变更", severity: "YELLOW" });
    }
  }

  const start = date(project.activity_start_at);
  if (start && start.getTime() < now.getTime() && String(project.status) === "ACTIVE" &&
      tasks.some((task) => !["DONE", "CANCELLED"].includes(String(task.status)))) {
    reasons.push({ kind: "PROJECT", id: projectId, label: "活动开场", reason: "活动已开始但仍有未完成任务，存在按时完成风险", severity: "RED" });
  }

  const health = reasons.some((item) => item.severity === "RED") ? "RED" : reasons.length ? "YELLOW" : "GREEN";
  return { status: String(project.status), health, reasons };
}

export function refreshProjectHealth(projectId: number, db: Db = getDb(), now = new Date()) {
  const snapshot = getProjectHealthSnapshot(projectId, db, now);
  db.prepare("UPDATE execution_projects SET health = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND deleted_at IS NULL")
    .run(snapshot.health, projectId);
  return snapshot;
}

export function healthReasonText(snapshot: ProjectHealthSnapshot) {
  return snapshot.reasons.map((item) => `${item.label}：${item.reason}`);
}

export type { TaskStatus };
