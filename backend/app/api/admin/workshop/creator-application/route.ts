import { adminCanManageCreator, adminPrincipalFromRequest, requireAdmin } from "../../../../../lib/auth";
import { apiError } from "../../../../../lib/http";
import { restoreCreatorToVisitor, reviewCreatorApplication } from "../../../../../lib/mini-program";

export async function PATCH(request: Request) {
  try {
    const denied = requireAdmin(request);
    if (denied) return denied;
    const data = await request.json();
    const creatorId = Number(data.creatorId || 0);
    if (!adminCanManageCreator(request, creatorId)) return Response.json({ error: "该账号不能审核此新遇官" }, { status: 403 });
    if (data.action === "restore_visitor")
      return Response.json({ application: restoreCreatorToVisitor(creatorId, adminPrincipalFromRequest(request)!) });
    return Response.json({ application: reviewCreatorApplication(creatorId, data.status, data.reviewNote, adminPrincipalFromRequest(request)!) });
  } catch (error) {
    return apiError(error);
  }
}
