import { adminPrincipalFromRequest, requireAdmin } from "../../../../../lib/auth";
import { projectDetailResponse, projectIdFromParam } from "../../../../../lib/project-center-api";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const denied = requireAdmin(request);
  if (denied) return denied;
  const projectId = projectIdFromParam((await params).projectId);
  if (!projectId) return Response.json({ error: "项目ID无效" }, { status: 400 });
  return projectDetailResponse(projectId, adminPrincipalFromRequest(request)!);
}
