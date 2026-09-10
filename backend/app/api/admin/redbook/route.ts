import { requireSuperAdmin } from "../../../../lib/auth";
import { isUpgradeConfigured } from "../../../../lib/copywriter";
import { apiError } from "../../../../lib/http";
import { getRedbookSettings, updateRedbookSettings } from "../../../../lib/redbook-settings";

export async function GET(request: Request) {
  const denied = requireSuperAdmin(request);
  return denied || Response.json({ settings: getRedbookSettings(), upgradeConfigured: isUpgradeConfigured() });
}

export async function PATCH(request: Request) {
  try {
    const denied = requireSuperAdmin(request);
    if (denied) return denied;
    return Response.json({ settings: updateRedbookSettings(await request.json()), upgradeConfigured: isUpgradeConfigured() });
  } catch (error) {
    return apiError(error);
  }
}
