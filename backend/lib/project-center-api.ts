import { DatabaseSync } from "node:sqlite";
import { getDb } from "./database";
import { canProjectAction } from "./project-permissions";
import {
  getAccessibleExecutionProject,
  getExecutionProjectDetail,
  getProjectMember,
  isExecutionProjectSchemaReady,
} from "./execution-projects";
import type { AdminPrincipal } from "./types";

export const PROJECT_CENTER_SCHEMA_ERROR = {
  errorCode: "PROJECT_CENTER_SCHEMA_NOT_READY",
  error: "项目中台数据库尚未初始化",
} as const;

export function schemaNotReadyResponse() {
  return Response.json(PROJECT_CENTER_SCHEMA_ERROR, {
    status: 503,
    headers: { "cache-control": "no-store" },
  });
}

export function getProjectCenterDb() {
  return getDb() as DatabaseSync;
}

export function ensureProjectCenterSchema() {
  return isExecutionProjectSchemaReady(getProjectCenterDb());
}

export function projectIdFromParam(value: string) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export function accessibleProjectOrNull(projectId: number, principal: AdminPrincipal) {
  if (!ensureProjectCenterSchema()) return { schemaReady: false as const };
  const access = getAccessibleExecutionProject(projectId, principal, getProjectCenterDb());
  return access
    ? { schemaReady: true as const, ...access }
    : { schemaReady: true as const, project: null };
}

export function canReadProjectTasks(
  projectId: number,
  principal: AdminPrincipal,
) {
  if (!ensureProjectCenterSchema()) return { schemaReady: false as const };
  const access = getAccessibleExecutionProject(projectId, principal, getProjectCenterDb());
  if (!access) return { schemaReady: true as const, access: null };
  const membership = principal.role === "super" || principal.id === null
    ? null
    : getProjectMember(projectId, principal.id, getProjectCenterDb()) || null;
  const permission = canProjectAction(
    principal,
    membership ? { userId: membership.user_id, role: membership.role, active: !membership.removed_at } : null,
    "VIEW_PROJECT",
  );
  return permission.allowed
    ? { schemaReady: true as const, access: { principal, membership } }
    : { schemaReady: true as const, access: null };
}

export function projectDetailResponse(projectId: number, principal: AdminPrincipal) {
  const access = accessibleProjectOrNull(projectId, principal);
  if (!access.schemaReady) return schemaNotReadyResponse();
  if (!access.project) return Response.json({ error: "项目不存在" }, { status: 404 });
  return Response.json(getExecutionProjectDetail(projectId, getProjectCenterDb()), {
    headers: { "cache-control": "no-store" },
  });
}
