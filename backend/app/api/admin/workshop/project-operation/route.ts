import { adminPrincipalFromRequest, requireAdmin } from "../../../../../lib/auth";
import { apiError } from "../../../../../lib/http";
import { reviewProjectOperationRequest } from "../../../../../lib/mini-program";

export async function PATCH(request: Request) {
  try {
    const denied = requireAdmin(request);
    if (denied) return denied;
    const data = await request.json();
    return Response.json({
      request: reviewProjectOperationRequest(
        Number(data.id || 0),
        data.status,
        data.reviewNote,
        adminPrincipalFromRequest(request)!,
      ),
    });
  } catch (error) {
    return apiError(error);
  }
}
