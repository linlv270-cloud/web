import { adminCanManageCreator, adminPrincipalFromRequest, requireAdmin } from "../../../../../lib/auth";
import { apiError } from "../../../../../lib/http";
import { saveMiniActivity } from "../../../../../lib/mini-program";

export async function PATCH(request: Request) {
  try {
    const denied = requireAdmin(request);
    if (denied) return denied;
    const data = await request.json();
    const creatorId = Number(data.creatorId);
    if (!adminCanManageCreator(request, creatorId)) return Response.json({ error: "该账号不能管理此新遇官" }, { status: 403 });
    return Response.json({ activity: saveMiniActivity(creatorId, data, adminPrincipalFromRequest(request)!) });
  } catch (error) {
    return apiError(error);
  }
}

export const POST = PATCH;
