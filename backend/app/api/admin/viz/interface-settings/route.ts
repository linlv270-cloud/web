import { requireSuperAdmin } from "../../../../../lib/auth";
import { apiError } from "../../../../../lib/http";
import { getVizInterfaceSettings, setVizInterfaceSettings } from "../../../../../lib/visualization";

export async function GET(request: Request) {
  try {
    const denied = requireSuperAdmin(request);
    if (denied) return denied;
    return Response.json({ settings: getVizInterfaceSettings() });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const denied = requireSuperAdmin(request);
    if (denied) return denied;
    return Response.json({ settings: setVizInterfaceSettings(await request.json()) });
  } catch (error) {
    return apiError(error);
  }
}
