import { adminPrincipalFromRequest, requireAdmin } from "../../../../../../../../lib/auth";
import { ensureProjectCenterSchema, projectIdFromParam, schemaNotReadyResponse } from "../../../../../../../../lib/project-center-api";
import { decideTask, workflowErrorResponse } from "../../../../../../../../lib/execution-project-workflow";

function taskIdFromParam(value: string) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function POST(request: Request, { params }: { params: Promise<{ projectId: string; taskId: string }> }) {
  const denied = requireAdmin(request);
  if (denied) return denied;
  if (!ensureProjectCenterSchema()) return schemaNotReadyResponse();
  const values = await params;
  const projectId = projectIdFromParam(values.projectId);
  const taskId = taskIdFromParam(values.taskId);
  if (!projectId || !taskId) return Response.json({ error: "参数无效" }, { status: 400 });
  try {
    return Response.json({ task: decideTask(projectId, taskId, "REJECTED", adminPrincipalFromRequest(request)!, await request.json()) });
  } catch (error) {
    return workflowErrorResponse(error);
  }
}
