import { adminPrincipalFromRequest, requireAdmin } from "../../../../../../../lib/auth";
import { projectIdFromParam, schemaNotReadyResponse, ensureProjectCenterSchema } from "../../../../../../../lib/project-center-api";
import { removeMember, updateMember, workflowErrorResponse } from "../../../../../../../lib/execution-project-workflow";

function memberIdFromParam(value: string) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function PATCH(request: Request, { params }: { params: Promise<{ projectId: string; memberId: string }> }) {
  const denied = requireAdmin(request);
  if (denied) return denied;
  if (!ensureProjectCenterSchema()) return schemaNotReadyResponse();
  const values = await params;
  const projectId = projectIdFromParam(values.projectId);
  const memberId = memberIdFromParam(values.memberId);
  if (!projectId || !memberId) return Response.json({ error: "参数无效" }, { status: 400 });
  try {
    return Response.json({ members: updateMember(projectId, memberId, adminPrincipalFromRequest(request)!, await request.json()) });
  } catch (error) {
    return workflowErrorResponse(error);
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ projectId: string; memberId: string }> }) {
  const denied = requireAdmin(request);
  if (denied) return denied;
  if (!ensureProjectCenterSchema()) return schemaNotReadyResponse();
  const values = await params;
  const projectId = projectIdFromParam(values.projectId);
  const memberId = memberIdFromParam(values.memberId);
  if (!projectId || !memberId) return Response.json({ error: "参数无效" }, { status: 400 });
  try {
    return Response.json({ members: removeMember(projectId, memberId, adminPrincipalFromRequest(request)!) });
  } catch (error) {
    return workflowErrorResponse(error);
  }
}
