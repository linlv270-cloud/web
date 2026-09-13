import type { AdminPrincipal } from "./types";
import type { ProjectRole } from "./execution-project-types";

export type ProjectAction =
  | "VIEW_PROJECT"
  | "CREATE_PROJECT"
  | "EDIT_PROJECT"
  | "MANAGE_MEMBERS"
  | "MANAGE_PHASES"
  | "MANAGE_MILESTONES"
  | "MANAGE_TASKS"
  | "PUBLISH_PLAN"
  | "UPDATE_OWN_TASK"
  | "SUBMIT_OWN_TASK"
  | "REPORT_WAITING"
  | "REPORT_BLOCKED"
  | "APPROVE_TASK"
  | "PAUSE_RESUME_PROJECT"
  | "ASSIGN_OWNER"
  | "VIEW_FILES"
  | "UPLOAD_FILES"
  | "MANAGE_FILE_STATUS"
  | "ARCHIVE_FILES"
  | "VIEW_RECORDS"
  | "CREATE_RECORD"
  | "EDIT_RECORD"
  | "DELETE_PROJECT"
  | "DELETE_ACTIVITY_LOG";

export type ProjectMembership = {
  userId: number;
  role: ProjectRole;
  active?: boolean;
};

export type TaskAssignment = {
  ownerId?: number | null;
  approverId?: number | null;
};

export type PermissionResult = {
  allowed: boolean;
  reason?: string;
};

function allowed(reason?: string): PermissionResult {
  return { allowed: true, reason };
}

function denied(reason: string): PermissionResult {
  return { allowed: false, reason };
}

export function canProjectAction(
  principal: AdminPrincipal | null,
  membership: ProjectMembership | null,
  action: ProjectAction,
  task: TaskAssignment | null = null,
): PermissionResult {
  if (!principal) return denied("Administrator authentication is required");
  if (["DELETE_PROJECT", "DELETE_ACTIVITY_LOG"].includes(action)) {
    return denied("Physical deletion and activity log deletion are not allowed");
  }
  if (principal.role === "super") return allowed("super administrator");
  if (!membership || membership.active === false) return denied("Project membership is required");

  const isManager = membership.role === "PROJECT_MANAGER";
  const isMember = membership.role === "MEMBER";
  const isObserver = membership.role === "OBSERVER";
  const isOwner = Boolean(task?.ownerId && principal.id === task.ownerId);
  const isApprover = Boolean(task?.approverId && principal.id === task.approverId);

  if (action === "VIEW_PROJECT") return allowed("project member");
  if (isObserver && ["VIEW_FILES", "VIEW_RECORDS"].includes(action)) return allowed("observer read access");
  if (isObserver) return denied("Observers have read-only access");
  if (isManager && [
    "EDIT_PROJECT", "MANAGE_MEMBERS", "MANAGE_PHASES", "MANAGE_MILESTONES",
    "MANAGE_TASKS", "PUBLISH_PLAN", "APPROVE_TASK", "UPLOAD_FILES",
    "MANAGE_FILE_STATUS", "ARCHIVE_FILES", "CREATE_RECORD", "EDIT_RECORD",
  ].includes(action)) return allowed("project manager");
  if (isManager && ["VIEW_FILES", "VIEW_RECORDS"].includes(action)) return allowed("project manager");
  if (isManager && action === "UPDATE_OWN_TASK") return allowed("project manager");
  if (isMember && ["UPDATE_OWN_TASK", "SUBMIT_OWN_TASK", "REPORT_WAITING", "REPORT_BLOCKED"].includes(action)) {
    return isOwner ? allowed("task owner") : denied("Only the task owner can update this task");
  }
  if (isMember && ["VIEW_FILES", "VIEW_RECORDS"].includes(action)) return allowed("project member");
  if (isMember && action === "UPLOAD_FILES") return allowed("project member");
  if (isMember && action === "CREATE_RECORD") return allowed("project member");
  if (isMember && action === "EDIT_RECORD") return allowed("project member");
  if (isMember && action === "APPROVE_TASK") {
    return isApprover ? denied("Members cannot approve tasks") : denied("Members cannot approve tasks");
  }
  if (isManager && action === "PAUSE_RESUME_PROJECT") return denied("Only super administrators can pause or resume projects");
  if (isManager && action === "ASSIGN_OWNER") {
    return denied("Project managers cannot perform this administrative action");
  }
  return denied("This role does not have the requested project permission");
}

export function canCreateProject(principal: AdminPrincipal | null): PermissionResult {
  return principal?.role === "super"
    ? allowed("super administrator")
    : denied("Only super administrators can create formal projects");
}

export function canApproveTask(
  principal: AdminPrincipal | null,
  membership: ProjectMembership | null,
  task: TaskAssignment | null,
) {
  const result = canProjectAction(principal, membership, "APPROVE_TASK", task);
  if (!result.allowed) return result;
  if (principal?.role === "super" || membership?.role === "PROJECT_MANAGER") return result;
  return task?.approverId === principal?.id
    ? allowed("designated approver")
    : denied("Only the designated approver or project manager can approve this task");
}
