import { adminCanManageCreator, adminPrincipalFromRequest, requireAdmin } from "../../../../../lib/auth";
import { apiError } from "../../../../../lib/http";
import { saveWorkshopProject } from "../../../../../lib/mini-program";

export async function POST(request: Request) {
  try {
    const denied = requireAdmin(request);
    if (denied) return denied;
    const principal = adminPrincipalFromRequest(request)!;
    const data = await request.json();
    const creatorId = Number(data.creatorId);
    if (!adminCanManageCreator(request, creatorId)) return Response.json({ error: "该账号不能管理此新遇官" }, { status: 403 });
    return Response.json({ project: saveWorkshopProject(creatorId, data, principal) });
  } catch (error) {
    return apiError(error);
  }
}

export const PATCH = POST;
