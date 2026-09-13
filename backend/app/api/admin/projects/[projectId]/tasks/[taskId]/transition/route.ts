import { adminPrincipalFromRequest, requireAdmin } from "../../../../../../../../lib/auth";
import { ensureProjectCenterSchema, projectIdFromParam, schemaNotReadyResponse } from "../../../../../../../../lib/project-center-api";
import { transitionTask, workflowErrorResponse } from "../../../../../../../../lib/execution-project-workflow";

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
    const input = await request.json() as Record<string, unknown>;
    const action = typeof input.action === "string" ? input.action : "";
    return Response.json({ task: transitionTask(projectId, taskId, action, adminPrincipalFromRequest(request)!, input) });
  } catch (error) {
    return workflowErrorResponse(error);
  }
}
