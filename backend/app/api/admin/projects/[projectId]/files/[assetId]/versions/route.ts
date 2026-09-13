import { adminPrincipalFromRequest, requireAdmin } from "../../../../../../../../lib/auth";
import { ensureProjectCenterSchema, projectIdFromParam, schemaNotReadyResponse } from "../../../../../../../../lib/project-center-api";
import { addProjectFileVersion, fileErrorResponse } from "../../../../../../../../lib/execution-project-files";

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
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return Response.json({ error: "请选择要上传的文件" }, { status: 400 });
    return Response.json(await addProjectFileVersion(projectId, assetId, adminPrincipalFromRequest(request)!, {
      versionNote: String(form.get("versionNote") || ""),
      replacementReason: String(form.get("replacementReason") || ""),
      originalName: file.name,
      mimeType: file.type,
      body: Buffer.from(await file.arrayBuffer()),
    }), { status: 201, headers: { "cache-control": "no-store" } });
  } catch (error) {
    return fileErrorResponse(error);
  }
}
