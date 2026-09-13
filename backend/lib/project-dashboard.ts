import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { getDb } from "./database";
import { getProjectHealthSnapshot, healthReasonText } from "./project-health";
import type { AdminPrincipal } from "./types";

type Db = Pick<DatabaseSync, "prepare">;

function rows<T>(statement: { all: (...values: SQLInputValue[]) => unknown[] }, ...values: SQLInputValue[]) {
  return statement.all(...values) as T[];
}

function date(value: unknown) {
  const result = new Date(String(value || ""));
  return Number.isFinite(result.getTime()) ? result : null;
}

function accessibleProjectIds(principal: AdminPrincipal, db: Db) {
  if (principal.role === "super") {
    return rows<{ id: number }>(db.prepare("SELECT id FROM execution_projects WHERE deleted_at IS NULL"));
  }
  return rows<{ id: number }>(
    db.prepare(
      `SELECT p.id FROM execution_projects p
       JOIN execution_project_members pm ON pm.project_id = p.id
       WHERE p.deleted_at IS NULL AND pm.user_id = ? AND pm.removed_at IS NULL`,
    ),
    principal.id,
  );
}

export function getProjectDashboard(principal: AdminPrincipal, db: Db = getDb(), now = new Date()) {
  const projects = accessibleProjectIds(principal, db);
  const projectIds = projects.map((item) => Number(item.id));
  const ids = projectIds.length ? projectIds : [-1];
  const placeholders = ids.map(() => "?").join(",");
  const snapshots = projectIds.map((id) => ({
    id,
    snapshot: getProjectHealthSnapshot(id, db, now),
    project: db.prepare(
      "SELECT id, code, name, status, activity_start_at, activity_end_at, manager_admin_id FROM execution_projects WHERE id = ?",
    ).get(id) as Record<string, unknown>,
  }));
  const tasks = rows<Record<string, unknown>>(db.prepare(
    `SELECT t.*, p.name AS project_name, p.code AS project_code, ph.name AS phase_name,
      o.name AS owner_name, o.phone AS owner_phone, a.name AS approver_name
     FROM execution_project_tasks t
     JOIN execution_projects p ON p.id = t.project_id
     LEFT JOIN execution_project_phases ph ON ph.id = t.phase_id
     LEFT JOIN admin_accounts o ON o.id = t.owner_id
     LEFT JOIN admin_accounts a ON a.id = t.approver_id
     WHERE t.project_id IN (${placeholders}) AND t.deleted_at IS NULL`,
  ), ...ids);
  const milestones = rows<Record<string, unknown>>(db.prepare(
    `SELECT m.*, p.name AS project_name, p.code AS project_code
     FROM execution_project_milestones m JOIN execution_projects p ON p.id = m.project_id
     WHERE m.project_id IN (${placeholders})`,
  ), ...ids);
  const records = rows<Record<string, unknown>>(db.prepare(
    `SELECT r.*, p.name AS project_name, p.code AS project_code
     FROM execution_project_records r JOIN execution_projects p ON p.id = r.project_id
     WHERE r.project_id IN (${placeholders}) AND r.deleted_at IS NULL`,
  ), ...ids);

  const active = snapshots.filter(({ project }) => String(project.status) === "ACTIVE");
  const within30 = active.filter(({ project }) => {
    const start = date(project.activity_start_at);
    return Boolean(start && start.getTime() >= now.getTime() && start.getTime() <= now.getTime() + 30 * 86400000);
  });
  const weekEnd = new Date(now);
  weekEnd.setDate(weekEnd.getDate() + (7 - weekEnd.getDay() || 7));
  const dueThisWeek = tasks.filter((task) => {
    const due = date(task.due_at);
    return Boolean(due && due.getTime() >= now.getTime() && due.getTime() <= weekEnd.getTime() &&
      !["DONE", "CANCELLED"].includes(String(task.status)));
  });
  const overdue = tasks.filter((task) => {
    const due = date(task.due_at);
    return Boolean(due && due.getTime() < now.getTime() && !["DONE", "CANCELLED"].includes(String(task.status)));
  });
  const blocked = tasks.filter((task) => task.status === "BLOCKED");
  const externalFollowUp = tasks.filter((task) => task.status === "WAITING_EXTERNAL" && date(task.next_follow_up_at)?.getTime()! < now.getTime());
  const review = tasks.filter((task) => task.status === "REVIEW");
  const pendingDecisions = records.filter((record) => record.record_type === "DECISION" && ["OPEN", "PROPOSED"].includes(String(record.status)));
  const highRisks = records.filter((record) => record.record_type === "RISK" && record.status !== "CLOSED" && /"?(probability|impact)"?\s*:\s*"?(HIGH|高)/.test(String(record.payload_json || "")));

  const load = rows<Record<string, unknown>>(db.prepare(
    `SELECT a.id, a.name, a.phone,
      SUM(CASE WHEN t.status IN ('IN_PROGRESS', 'WAITING_EXTERNAL', 'WAITING_INTERNAL', 'BLOCKED', 'REVIEW', 'REVISION_REQUIRED') THEN 1 ELSE 0 END) AS active_count,
      SUM(CASE WHEN t.status NOT IN ('DONE', 'CANCELLED') AND t.due_at >= date('now', 'weekday 1') AND t.due_at < date('now', 'weekday 1', '+7 days') THEN 1 ELSE 0 END) AS due_this_week,
      SUM(CASE WHEN t.status NOT IN ('DONE', 'CANCELLED') AND t.due_at < CURRENT_TIMESTAMP THEN 1 ELSE 0 END) AS overdue_count,
      SUM(CASE WHEN t.status = 'REVIEW' THEN 1 ELSE 0 END) AS pending_review,
      SUM(COALESCE(t.estimated_hours, 0)) AS estimated_hours,
      SUM(CASE WHEN t.status = 'BLOCKED' THEN 1 ELSE 0 END) AS blocked_count
     FROM admin_accounts a
     JOIN execution_project_tasks t ON t.owner_id = a.id
     WHERE t.project_id IN (${placeholders}) AND t.deleted_at IS NULL
     GROUP BY a.id ORDER BY active_count DESC, estimated_hours DESC`,
  ), ...ids);

  const keyMilestones = milestones
    .filter((item) => item.is_key && item.status !== "COMPLETED" && date(item.due_at))
    .sort((a, b) => date(a.due_at)!.getTime() - date(b.due_at)!.getTime())
    .slice(0, 20);
  const projectPayload = snapshots
    .map(({ id, project, snapshot }) => ({
      ...project,
      id,
      health: snapshot.health,
      healthReasons: healthReasonText(snapshot),
    }))
    .sort((a, b) => {
      const weight = (value: string) => value === "RED" ? 0 : value === "YELLOW" ? 1 : 2;
      return weight(String(a.health)) - weight(String(b.health));
    });

  return {
    generatedAt: now.toISOString(),
    scopeProjectCount: projectIds.length,
    stats: {
      activeProjects: active.length,
      openingWithin30Days: within30.length,
      dueThisWeek: dueThisWeek.length,
      overdueTasks: overdue.length,
      blockedTasks: blocked.length,
      externalFollowUpDue: externalFollowUp.length,
      pendingReviewTasks: review.length,
      redProjects: snapshots.filter(({ snapshot }) => snapshot.health === "RED").length,
      yellowProjects: snapshots.filter(({ snapshot }) => snapshot.health === "YELLOW").length,
      pendingDecisions: pendingDecisions.length,
      highRisks: highRisks.length,
    },
    redProjects: projectPayload.filter((item) => item.health === "RED"),
    yellowProjects: projectPayload.filter((item) => item.health === "YELLOW"),
    upcomingKeyMilestones: keyMilestones.filter((item) => (date(item.due_at)!.getTime() >= now.getTime())),
    overdueKeyMilestones: keyMilestones.filter((item) => (date(item.due_at)!.getTime() < now.getTime())),
    blockedTasks: blocked,
    pendingDecisions,
    externalFollowUp,
    pendingReviewTasks: review,
    memberLoad: load,
  };
}
