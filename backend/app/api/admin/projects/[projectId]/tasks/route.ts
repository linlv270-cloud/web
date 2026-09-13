import { adminPrincipalFromRequest, requireAdmin } from "../../../../../../lib/auth";
import { listExecutionProjectTasks } from "../../../../../../lib/execution-projects";
import { canReadProjectTasks, ensureProjectCenterSchema, projectIdFromParam, schemaNotReadyResponse } from "../../../../../../lib/project-center-api";
import { createTask, workflowErrorResponse } from "../../../../../../lib/execution-project-workflow";

function number(value: string | null) {
  const parsed = Number(value || 0);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const denied = requireAdmin(request);
  if (denied) return denied;
  const projectId = projectIdFromParam((await params).projectId);
  if (!projectId) return Response.json({ error: "项目ID无效" }, { status: 400 });
  const principal = adminPrincipalFromRequest(request)!;
  const result = canReadProjectTasks(projectId, principal);
  if (!result.schemaReady) return schemaNotReadyResponse();
  if (!result.access) return Response.json({ error: "项目不存在" }, { status: 404 });
  const url = new URL(request.url);
  const parsedPage = number(url.searchParams.get("page")) || 1;
  const parsedPageSize = Math.min(number(url.searchParams.get("pageSize")) || 20, 100);
  return Response.json({
    ...listExecutionProjectTasks(projectId, result.access, {
      phaseId: number(url.searchParams.get("phaseId")),
      status: url.searchParams.get("status") || undefined,
      ownerId: number(url.searchParams.get("ownerId")),
      approverId: number(url.searchParams.get("approverId")),
      overdue: url.searchParams.get("overdue") === "1",
      critical: url.searchParams.get("critical") === "1",
      scope: url.searchParams.get("scope") === "mine" || url.searchParams.get("scope") === "review" ? url.searchParams.get("scope") as "mine" | "review" : undefined,
      page: parsedPage,
      pageSize: parsedPageSize,
    }),
  }, { headers: { "cache-control": "no-store" } });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const denied = requireAdmin(request);
  if (denied) return denied;
  if (!ensureProjectCenterSchema()) return schemaNotReadyResponse();
  const projectId = projectIdFromParam((await params).projectId);
  if (!projectId) return Response.json({ error: "项目ID无效" }, { status: 400 });
  try {
    return Response.json({
      task: createTask(projectId, adminPrincipalFromRequest(request)!, await request.json()),
    }, { status: 201, headers: { "cache-control": "no-store" } });
  } catch (error) {
    return workflowErrorResponse(error);
  }
}
