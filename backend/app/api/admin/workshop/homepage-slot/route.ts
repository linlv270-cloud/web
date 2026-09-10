import { adminPrincipalFromRequest, requireSuperAdmin } from "../../../../../lib/auth";
import { apiError } from "../../../../../lib/http";
import { saveHomepageSlot } from "../../../../../lib/mini-program";

export async function POST(request: Request) {
  try {
    const denied = requireSuperAdmin(request);
    if (denied) return denied;
    const principal = adminPrincipalFromRequest(request)!;
    return Response.json({ slot: saveHomepageSlot(await request.json(), principal.label) });
  } catch (error) {
    return apiError(error);
  }
}

export const PATCH = POST;
