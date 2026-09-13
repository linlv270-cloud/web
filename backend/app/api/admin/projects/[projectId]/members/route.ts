import { adminPrincipalFromRequest, requireAdmin } from "../../../../../../lib/auth";
import { projectIdFromParam, schemaNotReadyResponse, ensureProjectCenterSchema } from "../../../../../../lib/project-center-api";
import { addMember, listMembers, workflowErrorResponse } from "../../../../../../lib/execution-project-workflow";

export async function GET(request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const denied = requireAdmin(request);
  if (denied) return denied;
  if (!ensureProjectCenterSchema()) return schemaNotReadyResponse();
  const projectId = projectIdFromParam((await params).projectId);
  if (!projectId) return Response.json({ error: "项目ID无效" }, { status: 400 });
  try {
    return Response.json({ members: listMembers(projectId, adminPrincipalFromRequest(request)!) }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return workflowErrorResponse(error);
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const denied = requireAdmin(request);
  if (denied) return denied;
  if (!ensureProjectCenterSchema()) return schemaNotReadyResponse();
  const projectId = projectIdFromParam((await params).projectId);
  if (!projectId) return Response.json({ error: "项目ID无效" }, { status: 400 });
  try {
    return Response.json({ members: addMember(projectId, adminPrincipalFromRequest(request)!, await request.json()) }, { status: 201 });
  } catch (error) {
    return workflowErrorResponse(error);
  }
}
