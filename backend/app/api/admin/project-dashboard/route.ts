import { adminPrincipalFromRequest, requireAdmin } from "../../../../lib/auth";
import { ensureProjectCenterSchema, schemaNotReadyResponse } from "../../../../lib/project-center-api";
import { getProjectDashboard } from "../../../../lib/project-dashboard";

export async function GET(request: Request) {
  const denied = requireAdmin(request);
  if (denied) return denied;
  if (!ensureProjectCenterSchema()) return schemaNotReadyResponse();
  return Response.json(getProjectDashboard(adminPrincipalFromRequest(request)!), { headers: { "cache-control": "no-store" } });
}
