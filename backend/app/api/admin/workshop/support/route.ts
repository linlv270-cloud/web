import { adminPrincipalFromRequest, requireSuperAdmin } from "../../../../../lib/auth";
import { apiError } from "../../../../../lib/http";
import { updateSupportTicket } from "../../../../../lib/mini-program";

export async function PATCH(request: Request) {
  try {
    const denied = requireSuperAdmin(request);
    if (denied) return denied;
    const data = await request.json();
    const principal = adminPrincipalFromRequest(request)!;
    return Response.json({ ticket: updateSupportTicket(Number(data.id), data.status, principal.label) });
  } catch (error) {
    return apiError(error);
  }
}
