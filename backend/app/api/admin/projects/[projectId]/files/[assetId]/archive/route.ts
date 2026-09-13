import { adminPrincipalFromRequest, requireAdmin } from "../../../../../../../../lib/auth";
import { ensureProjectCenterSchema, projectIdFromParam, schemaNotReadyResponse } from "../../../../../../../../lib/project-center-api";
import { archiveProjectFile, fileErrorResponse } from "../../../../../../../../lib/execution-project-files";

function id(value: string) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

export async function POST(request: Request, { params }: { params: Promise<{ projectId: string; assetId: string }> }) {
  const denied = requireAdmin(request);
  if (denied) return denied;
  if (!ensureProjectCenterSchema()) return schemaNotReadyResponse();
  const values = await params;
  const projectId = projectIdFromParam(values.projectId);
  const assetId = id(values.assetId);
  if (!projectId || !assetId) return Response.json({ error: "参数无效" }, { status: 400 });
  try {
    return Response.json(archiveProjectFile(projectId, assetId, adminPrincipalFromRequest(request)!, await request.json().catch(() => ({}))), {
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    return fileErrorResponse(error);
  }
}
