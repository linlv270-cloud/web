import { adminPrincipalFromRequest, requireAdmin } from "../../../../../../lib/auth";
import { listExecutionProjectMilestones } from "../../../../../../lib/execution-projects";
import { accessibleProjectOrNull, projectIdFromParam, schemaNotReadyResponse } from "../../../../../../lib/project-center-api";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const denied = requireAdmin(request);
  if (denied) return denied;
  const projectId = projectIdFromParam((await params).projectId);
  if (!projectId) return Response.json({ error: "项目ID无效" }, { status: 400 });
  const access = accessibleProjectOrNull(projectId, adminPrincipalFromRequest(request)!);
  if (!access.schemaReady) return schemaNotReadyResponse();
  if (!access.project) return Response.json({ error: "项目不存在" }, { status: 404 });
  return Response.json({ milestones: listExecutionProjectMilestones(projectId) }, { headers: { "cache-control": "no-store" } });
}
