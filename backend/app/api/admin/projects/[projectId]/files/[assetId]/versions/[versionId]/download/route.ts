import { adminPrincipalFromRequest, requireAdmin } from "../../../../../../../../../../lib/auth";
import { ensureProjectCenterSchema, projectIdFromParam, schemaNotReadyResponse } from "../../../../../../../../../../lib/project-center-api";
import { fileErrorResponse, getProjectFileDownload } from "../../../../../../../../../../lib/execution-project-files";

function id(value: string) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

export async function GET(request: Request, { params }: { params: Promise<{ projectId: string; assetId: string; versionId: string }> }) {
  const denied = requireAdmin(request);
  if (denied) return denied;
  if (!ensureProjectCenterSchema()) return schemaNotReadyResponse();
  const values = await params;
  const projectId = projectIdFromParam(values.projectId);
  const assetId = id(values.assetId);
  const versionId = id(values.versionId);
  if (!projectId || !assetId || !versionId) return Response.json({ error: "参数无效" }, { status: 400 });
  try {
    const object = getProjectFileDownload(projectId, assetId, versionId, adminPrincipalFromRequest(request)!);
    const { version } = object;
    const stored = await object.objectPromise;
    if (!stored) return Response.json({ error: "文件对象不存在" }, { status: 404 });
    const fileName = String(version.original_name || "attachment").replace(/[\r\n"]/g, "_");
    return new Response(stored.body, {
      headers: {
        "content-type": String(version.mime_type || "application/octet-stream"),
        "content-length": String(stored.body.length),
        "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
        "cache-control": "private, no-store",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (error) {
    return fileErrorResponse(error);
  }
}
