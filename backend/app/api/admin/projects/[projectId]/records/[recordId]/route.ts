import { adminPrincipalFromRequest, requireAdmin } from "../../../../../../../lib/auth";
import { ensureProjectCenterSchema, projectIdFromParam, schemaNotReadyResponse } from "../../../../../../../lib/project-center-api";
import { getProjectRecord, recordErrorResponse, updateProjectRecord } from "../../../../../../../lib/execution-project-records";

function id(value: string) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

export async function GET(request: Request, { params }: { params: Promise<{ projectId: string; recordId: string }> }) {
  const denied = requireAdmin(request);
  if (denied) return denied;
  if (!ensureProjectCenterSchema()) return schemaNotReadyResponse();
  const values = await params;
  const projectId = projectIdFromParam(values.projectId);
  const recordId = id(values.recordId);
  if (!projectId || !recordId) return Response.json({ error: "参数无效" }, { status: 400 });
  try {
    return Response.json(getProjectRecord(projectId, recordId, adminPrincipalFromRequest(request)!), { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return recordErrorResponse(error);
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ projectId: string; recordId: string }> }) {
  const denied = requireAdmin(request);
  if (denied) return denied;
  if (!ensureProjectCenterSchema()) return schemaNotReadyResponse();
  const values = await params;
  const projectId = projectIdFromParam(values.projectId);
  const recordId = id(values.recordId);
  if (!projectId || !recordId) return Response.json({ error: "参数无效" }, { status: 400 });
  try {
    return Response.json(updateProjectRecord(projectId, recordId, adminPrincipalFromRequest(request)!, await request.json()), {
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    return recordErrorResponse(error);
  }
}
