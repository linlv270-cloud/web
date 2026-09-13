import { adminPrincipalFromRequest, requireAdmin } from "../../../../../../../lib/auth";
import { ensureProjectCenterSchema, projectIdFromParam, schemaNotReadyResponse } from "../../../../../../../lib/project-center-api";
import { updatePhase, workflowErrorResponse } from "../../../../../../../lib/execution-project-workflow";

function itemId(value: string) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function PATCH(request: Request, { params }: { params: Promise<{ projectId: string; phaseId: string }> }) {
  const denied = requireAdmin(request);
  if (denied) return denied;
  if (!ensureProjectCenterSchema()) return schemaNotReadyResponse();
  const values = await params;
  const projectId = projectIdFromParam(values.projectId);
  const phaseId = itemId(values.phaseId);
  if (!projectId || !phaseId) return Response.json({ error: "参数无效" }, { status: 400 });
  try {
    return Response.json({ phase: updatePhase(projectId, phaseId, adminPrincipalFromRequest(request)!, await request.json()) });
  } catch (error) {
    return workflowErrorResponse(error);
  }
}
