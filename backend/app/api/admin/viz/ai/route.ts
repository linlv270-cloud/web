import { adminPrincipalFromRequest, requireSuperAdmin } from "../../../../../lib/auth";
import { apiError } from "../../../../../lib/http";
import {
  deleteVisualizationAiProvider,
  getVisualizationAiSettings,
  listVisualizationAiProviders,
  listVisualizationAiRuns,
  queueVisualizationAiRun,
  saveVisualizationAiProvider,
  saveVisualizationAiSettings,
} from "../../../../../lib/visualization-planning";

function snapshot() {
  return {
    settings: getVisualizationAiSettings(),
    providers: listVisualizationAiProviders(),
    runs: listVisualizationAiRuns(),
  };
}

export async function GET(request: Request) {
  try {
    const denied = requireSuperAdmin(request);
    if (denied) return denied;
    return Response.json(snapshot());
  } catch (error) {
    return apiError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const denied = requireSuperAdmin(request);
    if (denied) return denied;
    const principal = adminPrincipalFromRequest(request);
    const data = await request.json();
    saveVisualizationAiSettings(data, principal?.label || "超级管理员");
    return Response.json(snapshot());
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const denied = requireSuperAdmin(request);
    if (denied) return denied;
    const principal = adminPrincipalFromRequest(request);
    const data = await request.json();
    if (data.action === "save-provider") saveVisualizationAiProvider(data.provider || {});
    else if (data.action === "delete-provider") deleteVisualizationAiProvider(Number(data.id));
    else if (data.action === "queue") {
      queueVisualizationAiRun("manual", principal?.label || "超级管理员", {
        province: data.province,
        city: data.city,
        date: data.date,
      });
    } else throw new Error("未知操作");
    return Response.json(snapshot());
  } catch (error) {
    return apiError(error);
  }
}
