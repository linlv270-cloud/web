import { adminPrincipalFromRequest, requireAdmin } from "../../../../../../lib/auth";
import { ensureProjectCenterSchema, projectIdFromParam, schemaNotReadyResponse } from "../../../../../../lib/project-center-api";
import { listProjectRecords, createProjectRecord, recordErrorResponse } from "../../../../../../lib/execution-project-records";

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
    return Response.json(listProjectRecords(projectId, adminPrincipalFromRequest(request)!, {
      page: number(url.searchParams.get("page")) || 1,
      pageSize: Math.min(number(url.searchParams.get("pageSize")) || 20, 100),
      type: url.searchParams.get("type") || undefined,
      status: url.searchParams.get("status") || undefined,
      ownerId: number(url.searchParams.get("ownerId")),
      from: url.searchParams.get("from") || undefined,
      to: url.searchParams.get("to") || undefined,
      keyword: url.searchParams.get("keyword") || undefined,
    }), { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return recordErrorResponse(error);
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const denied = requireAdmin(request);
  if (denied) return denied;
  if (!ensureProjectCenterSchema()) return schemaNotReadyResponse();
  const projectId = projectIdFromParam((await params).projectId);
  if (!projectId) return Response.json({ error: "项目ID无效" }, { status: 400 });
  try {
    return Response.json(createProjectRecord(projectId, adminPrincipalFromRequest(request)!, await request.json()), {
      status: 201,
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    return recordErrorResponse(error);
  }
}
