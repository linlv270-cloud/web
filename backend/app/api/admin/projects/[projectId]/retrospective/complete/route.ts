import { adminPrincipalFromRequest, requireAdmin } from "../../../../../../../lib/auth";
import { ensureProjectCenterSchema, projectIdFromParam, schemaNotReadyResponse } from "../../../../../../../lib/project-center-api";
import { completeProjectRetrospective, projectOperationsErrorResponse } from "../../../../../../../lib/execution-project-operations";

export async function POST(request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const denied = requireAdmin(request);
  if (denied) return denied;
  if (!ensureProjectCenterSchema()) return schemaNotReadyResponse();
  const projectId = projectIdFromParam((await params).projectId);
  if (!projectId) return Response.json({ error: "项目ID无效" }, { status: 400 });
  try { return Response.json(completeProjectRetrospective(projectId, adminPrincipalFromRequest(request)!, await request.json().catch(() => ({})))); } catch (error) { return projectOperationsErrorResponse(error); }
}
