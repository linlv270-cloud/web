import { adminPrincipalFromRequest, requireAdmin } from "../../../../lib/auth";
import { adminOverview } from "../../../../lib/repository";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const denied = requireAdmin(request);
  if (denied) return denied;
  return Response.json(adminOverview(adminPrincipalFromRequest(request)!), { headers: { "cache-control": "no-store" } });
}
