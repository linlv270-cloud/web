import { adminPrincipalFromRequest, requireAdmin } from "../../../../../../../../../../lib/auth";
import { ensureProjectCenterSchema, projectIdFromParam, schemaNotReadyResponse } from "../../../../../../../../../../lib/project-center-api";
import { changeProjectFileVersionStatus, fileErrorResponse, type FileStatus } from "../../../../../../../../../../lib/execution-project-files";

function id(value: string) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

export async function POST(request: Request, { params }: { params: Promise<{ projectId: string; assetId: string; versionId: string }> }) {
  const denied = requireAdmin(request);
  if (denied) return denied;
  if (!ensureProjectCenterSchema()) return schemaNotReadyResponse();
  const values = await params;
  const projectId = projectIdFromParam(values.projectId);
  const assetId = id(values.assetId);
  const versionId = id(values.versionId);
  if (!projectId || !assetId || !versionId) return Response.json({ error: "参数无效" }, { status: 400 });
  try {
    const input = await request.json() as Record<string, unknown>;
    return Response.json(changeProjectFileVersionStatus(projectId, assetId, versionId, adminPrincipalFromRequest(request)!, {
      status: String(input.status || "") as FileStatus,
      comment: String(input.comment || ""),
    }), { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return fileErrorResponse(error);
  }
}
