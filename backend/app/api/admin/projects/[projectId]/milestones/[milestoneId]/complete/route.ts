import { adminPrincipalFromRequest, requireAdmin } from "../../../../../../../../lib/auth";
import { ensureProjectCenterSchema, projectIdFromParam, schemaNotReadyResponse } from "../../../../../../../../lib/project-center-api";
import { completeMilestone, projectOperationsErrorResponse } from "../../../../../../../../lib/execution-project-operations";

function id(value: string) { const parsed = Number(value); return Number.isInteger(parsed) && parsed > 0 ? parsed : null; }

export async function POST(request: Request, { params }: { params: Promise<{ projectId: string; milestoneId: string }> }) {
  const denied = requireAdmin(request);
  if (denied) return denied;
  if (!ensureProjectCenterSchema()) return schemaNotReadyResponse();
  const values = await params;
  const projectId = projectIdFromParam(values.projectId);
  const milestoneId = id(values.milestoneId);
  if (!projectId || !milestoneId) return Response.json({ error: "参数无效" }, { status: 400 });
  try { return Response.json({ milestone: completeMilestone(projectId, milestoneId, adminPrincipalFromRequest(request)!, await request.json()) }); } catch (error) { return projectOperationsErrorResponse(error); }
}
