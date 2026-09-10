import { adminPrincipalFromRequest, requireAdmin } from "../../../../../lib/auth";
import { miniAdminOverview } from "../../../../../lib/mini-program";

export async function GET(request: Request) {
  const denied = requireAdmin(request);
  if (denied) return denied;
  return Response.json(miniAdminOverview(adminPrincipalFromRequest(request)!), { headers: { "cache-control": "no-store" } });
}

