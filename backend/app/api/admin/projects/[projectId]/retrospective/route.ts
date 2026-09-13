import { adminPrincipalFromRequest, requireAdmin } from "../../../../../../lib/auth";
import { ensureProjectCenterSchema, projectIdFromParam, schemaNotReadyResponse } from "../../../../../../lib/project-center-api";
import { getProjectRetrospective, saveProjectRetrospective, projectOperationsErrorResponse } from "../../../../../../lib/execution-project-operations";

export async function GET(request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const denied = requireAdmin(request);
  if (denied) return denied;
  if (!ensureProjectCenterSchema()) return schemaNotReadyResponse();
  const projectId = projectIdFromParam((await params).projectId);
  if (!projectId) return Response.json({ error: "项目ID无效" }, { status: 400 });
  try { return Response.json(getProjectRetrospective(projectId, adminPrincipalFromRequest(request)!)); } catch (error) { return projectOperationsErrorResponse(error); }
}

export async function PUT(request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const denied = requireAdmin(request);
  if (denied) return denied;
  if (!ensureProjectCenterSchema()) return schemaNotReadyResponse();
  const projectId = projectIdFromParam((await params).projectId);
  if (!projectId) return Response.json({ error: "项目ID无效" }, { status: 400 });
  try { return Response.json(saveProjectRetrospective(projectId, adminPrincipalFromRequest(request)!, await request.json())); } catch (error) { return projectOperationsErrorResponse(error); }
}
