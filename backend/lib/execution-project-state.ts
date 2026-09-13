import {
  type HealthStatus,
  type ProjectHealthInput,
  type TaskHealthInput,
  type TaskStateContext,
  type TaskStatus,
  TASK_STATUSES,
} from "./execution-project-types";

export type StateTransitionAction =
  | "SUBMIT_REVIEW"
  | "APPROVE"
  | "REQUEST_REVISION"
  | "REOPEN"
  | "CANCEL";

export type StateTransitionActor = {
  actorId: number | null;
  isProjectManager?: boolean;
  isApprover?: boolean;
};

export type StateTransitionResult = {
  allowed: boolean;
  reason?: string;
};

const transitions: Record<TaskStatus, readonly TaskStatus[]> = {
  DRAFT: ["READY", "CANCELLED"],
  READY: ["IN_PROGRESS", "CANCELLED"],
  IN_PROGRESS: ["WAITING_EXTERNAL", "WAITING_INTERNAL", "BLOCKED", "REVIEW", "CANCELLED"],
  WAITING_EXTERNAL: ["IN_PROGRESS", "BLOCKED", "CANCELLED"],
  WAITING_INTERNAL: ["IN_PROGRESS", "BLOCKED", "CANCELLED"],
  BLOCKED: ["IN_PROGRESS", "CANCELLED"],
  REVIEW: ["DONE", "REVISION_REQUIRED", "CANCELLED"],
  REVISION_REQUIRED: ["IN_PROGRESS", "CANCELLED"],
  DONE: ["IN_PROGRESS"],
  CANCELLED: [],
};

function present(value: string | number | null | undefined) {
  return value !== null && value !== undefined && String(value).trim().length > 0;
}

function required(context: TaskStateContext, keys: Array<keyof TaskStateContext>) {
  return keys.every((key) => {
    const value = context[key];
    return Array.isArray(value) ? value.length > 0 : present(value as string | number | null | undefined);
  });
}

function hasEvidence(context: TaskStateContext) {
  return (context.evidence || []).some((item) => present(item.fileVersionId) || present(item.externalUrl) || present(item.note));
}

export function allowedTaskTransitions(from: TaskStatus): readonly TaskStatus[] {
  return transitions[from] || [];
}

export function validateTaskStateEntry(
  target: TaskStatus,
  context: TaskStateContext,
  actor: StateTransitionActor = { actorId: null },
): StateTransitionResult {
  if (target === "READY" && !required(context, ["ownerId", "approverId", "dueAt", "deliverables", "acceptanceCriteria"])) {
    return { allowed: false, reason: "READY requires owner, approver, due date, deliverables, and acceptance criteria" };
  }
  if ((target === "WAITING_EXTERNAL" || target === "WAITING_INTERNAL") &&
      !required(context, ["waitingFor", "waitingReason", "nextFollowUpAt"])) {
    return { allowed: false, reason: "WAITING requires waitingFor, waitingReason, and nextFollowUpAt" };
  }
  if (target === "BLOCKED" && !required(context, ["blockerReason", "blockerImpact"])) {
    return { allowed: false, reason: "BLOCKED requires blockerReason and blockerImpact" };
  }
  if (target === "REVIEW" && (!present(context.resultSummary) || (!hasEvidence(context) && !present(context.noFileEvidenceReason)))) {
    return { allowed: false, reason: "REVIEW requires a result summary and evidence or an explicit no-file-evidence reason" };
  }
  if (target === "DONE" && !(actor.isApprover || actor.isProjectManager)) {
    return { allowed: false, reason: "Only the designated approver or project manager can mark a task DONE" };
  }
  if (target === "REVISION_REQUIRED" && (!actor.isApprover && !actor.isProjectManager)) {
    return { allowed: false, reason: "Only the designated approver or project manager can request revisions" };
  }
  if (target === "REVISION_REQUIRED" && !present(context.revisionReason)) {
    return { allowed: false, reason: "REVISION_REQUIRED requires a revision reason" };
  }
  if (target === "CANCELLED" && !present(context.cancelReason)) {
    return { allowed: false, reason: "CANCELLED requires a cancellation reason" };
  }
  return { allowed: true };
}

export function validateTaskTransition(
  from: TaskStatus,
  to: TaskStatus,
  context: TaskStateContext = {},
  actor: StateTransitionActor = { actorId: null },
): StateTransitionResult {
  if (!TASK_STATUSES.includes(from) || !TASK_STATUSES.includes(to)) {
    return { allowed: false, reason: "Unknown task state" };
  }
  if (!transitions[from].includes(to)) {
    return { allowed: false, reason: `Transition ${from} -> ${to} is not allowed` };
  }
  if (from === "DONE" && to === "IN_PROGRESS") {
    if (!present(actor.actorId) || !actor.isProjectManager) {
      return { allowed: false, reason: "Reopening a DONE task requires a project manager actor" };
    }
    if (!present(context.reopenReason)) {
      return { allowed: false, reason: "Reopening a DONE task requires a reason" };
    }
  }
  return validateTaskStateEntry(to, context, actor);
}

export function isTaskOverdue(task: Pick<TaskHealthInput, "status" | "dueAt">, now = new Date()) {
  if (!task.dueAt || task.status === "DONE" || task.status === "CANCELLED") return false;
  const due = new Date(task.dueAt);
  return Number.isFinite(due.getTime()) && due.getTime() < now.getTime();
}

export function calculateProjectHealth(input: ProjectHealthInput, now = new Date()): HealthStatus {
  if (input.hasCriticalRisk || input.openBlockerCount && input.openBlockerCount > 0) return "RED";
  const overdueKeys = input.tasks.filter((task) => task.isKey && isTaskOverdue(task, now)).length;
  const overdueTasks = input.tasks.filter((task) => isTaskOverdue(task, now)).length;
  const yellowSignals = overdueKeys > 0 || overdueTasks >= 2 ||
    (input.overdueMilestoneCount || 0) > 0 || (input.openWaitingCount || 0) > 0;
  return yellowSignals ? "YELLOW" : "GREEN";
}

export function findDependencyCycle(edges: Array<{ taskId: number; dependsOnTaskId: number }>): number[] | null {
  const graph = new Map<number, number[]>();
  for (const edge of edges) graph.set(edge.taskId, [...(graph.get(edge.taskId) || []), edge.dependsOnTaskId]);
  const visiting = new Set<number>();
  const visited = new Set<number>();
  const stack: number[] = [];
  const visit = (node: number): number[] | null => {
    if (visiting.has(node)) {
      const index = stack.indexOf(node);
      return [...stack.slice(index), node];
    }
    if (visited.has(node)) return null;
    visiting.add(node);
    stack.push(node);
    for (const dependency of graph.get(node) || []) {
      const cycle = visit(dependency);
      if (cycle) return cycle;
    }
    stack.pop();
    visiting.delete(node);
    visited.add(node);
    return null;
  };
  for (const node of graph.keys()) {
    const cycle = visit(node);
    if (cycle) return cycle;
  }
  return null;
}

export function hasDependencyCycle(edges: Array<{ taskId: number; dependsOnTaskId: number }>) {
  return findDependencyCycle(edges) !== null;
}
