import { adminPrincipalFromRequest, requireAdmin } from "../../../../../../lib/auth";
import { ensureProjectCenterSchema, projectIdFromParam, schemaNotReadyResponse } from "../../../../../../lib/project-center-api";
import { publishPlan, workflowErrorResponse } from "../../../../../../lib/execution-project-workflow";

export async function POST(request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const denied = requireAdmin(request);
  if (denied) return denied;
  if (!ensureProjectCenterSchema()) return schemaNotReadyResponse();
  const projectId = projectIdFromParam((await params).projectId);
  if (!projectId) return Response.json({ error: "项目ID无效" }, { status: 400 });
  try {
    const input = await request.json().catch(() => ({})) as Record<string, unknown>;
    const taskIds = Array.isArray(input.taskIds) ? input.taskIds.map(Number).filter(Number.isInteger) : undefined;
    return Response.json(publishPlan(projectId, adminPrincipalFromRequest(request)!, taskIds));
  } catch (error) {
    return workflowErrorResponse(error);
  }
}
