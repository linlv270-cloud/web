import { adminPrincipalFromRequest, requireSuperAdmin } from "../../../../../lib/auth";
import { apiError } from "../../../../../lib/http";
import {
  listVisualizationPlans,
  saveVisualizationPlan,
  setVisualizationPlanStatus,
  type VisualizationPlan,
} from "../../../../../lib/visualization-planning";

export async function GET(request: Request) {
  try {
    const denied = requireSuperAdmin(request);
    if (denied) return denied;
    const url = new URL(request.url);
    return Response.json({
      plans: listVisualizationPlans({
        date: url.searchParams.get("date") || undefined,
        startDate: url.searchParams.get("startDate") || undefined,
        endDate: url.searchParams.get("endDate") || undefined,
        province: url.searchParams.get("province") || undefined,
        city: url.searchParams.get("city") || undefined,
      }),
    });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const denied = requireSuperAdmin(request);
    if (denied) return denied;
    const principal = adminPrincipalFromRequest(request) || { id: null, label: "超级管理员", role: "super" as const };
    const data = await request.json();
    if (data.action === "status") {
      return Response.json({
        plans: setVisualizationPlanStatus(Number(data.id), String(data.status) as VisualizationPlan["status"]),
      });
    }
    return Response.json({ plans: saveVisualizationPlan(data, principal) });
  } catch (error) {
    return apiError(error);
  }
}
