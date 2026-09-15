import { adminPrincipalFromRequest, requireAdmin } from "../../../../lib/auth";
import { listMyProjectWork } from "../../../../lib/execution-project-work";

export async function GET(request: Request) {
  const denied = requireAdmin(request);
  if (denied) return denied;
  const url = new URL(request.url);
  return Response.json(listMyProjectWork(adminPrincipalFromRequest(request)!, {
    scope: url.searchParams.get("scope") || "all",
    status: url.searchParams.get("status") || "",
    projectId: Number(url.searchParams.get("projectId") || 0) || undefined,
    limit: Number(url.searchParams.get("limit") || 100),
  }), { headers: { "cache-control": "no-store" } });
}
