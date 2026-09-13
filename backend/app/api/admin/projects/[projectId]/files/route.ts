import { adminPrincipalFromRequest, requireAdmin } from "../../../../../../lib/auth";
import { ensureProjectCenterSchema, projectIdFromParam, schemaNotReadyResponse } from "../../../../../../lib/project-center-api";
import {
  createProjectFile,
  fileErrorResponse,
  listProjectFiles,
} from "../../../../../../lib/execution-project-files";

function number(value: string | null) {
  const parsed = Number(value || 0);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

export async function GET(request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const denied = requireAdmin(request);
  if (denied) return denied;
  if (!ensureProjectCenterSchema()) return schemaNotReadyResponse();
  const projectId = projectIdFromParam((await params).projectId);
  if (!projectId) return Response.json({ error: "项目ID无效" }, { status: 400 });
  const url = new URL(request.url);
  try {
    return Response.json(listProjectFiles(projectId, adminPrincipalFromRequest(request)!, {
      page: number(url.searchParams.get("page")) || 1,
      pageSize: Math.min(number(url.searchParams.get("pageSize")) || 20, 100),
      phaseId: number(url.searchParams.get("phaseId")),
      taskId: number(url.searchParams.get("taskId")),
      assetType: url.searchParams.get("assetType") || undefined,
      status: url.searchParams.get("status") || undefined,
      keyword: url.searchParams.get("keyword") || undefined,
    }), { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return fileErrorResponse(error);
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const denied = requireAdmin(request);
  if (denied) return denied;
  if (!ensureProjectCenterSchema()) return schemaNotReadyResponse();
  const projectId = projectIdFromParam((await params).projectId);
  if (!projectId) return Response.json({ error: "项目ID无效" }, { status: 400 });
  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return Response.json({ error: "请选择要上传的文件" }, { status: 400 });
    const result = await createProjectFile(projectId, adminPrincipalFromRequest(request)!, {
      name: String(form.get("name") || ""),
      assetType: String(form.get("assetType") || ""),
      phaseId: Number(form.get("phaseId") || 0) || null,
      taskId: Number(form.get("taskId") || 0) || null,
      versionNote: String(form.get("versionNote") || ""),
      originalName: file.name,
      mimeType: file.type,
      body: Buffer.from(await file.arrayBuffer()),
    });
    return Response.json(result, { status: 201, headers: { "cache-control": "no-store" } });
  } catch (error) {
    return fileErrorResponse(error);
  }
}
