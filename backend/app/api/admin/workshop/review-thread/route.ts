import { adminPrincipalFromRequest, requireAdmin } from "../../../../../lib/auth";
import { apiError } from "../../../../../lib/http";
import { addAdminReviewReply, markAdminReviewThreadRead } from "../../../../../lib/review-workflow";

export async function PATCH(request: Request) {
  try {
    const denied = requireAdmin(request);
    if (denied) return denied;
    const principal = adminPrincipalFromRequest(request)!;
    const data = await request.json();
    const id = Number(data.id || 0);
    return Response.json({
      thread: data.action === "read"
        ? markAdminReviewThreadRead(id, principal)
        : addAdminReviewReply(id, principal, data.body),
    });
  } catch (error) {
    return apiError(error);
  }
}
