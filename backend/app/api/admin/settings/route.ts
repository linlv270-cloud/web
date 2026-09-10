import { adminPrincipalFromRequest, requireSuperAdmin } from "../../../../lib/auth";
import { apiError } from "../../../../lib/http";
import { audit, getPlatformSettings, updatePlatformSettings } from "../../../../lib/repository";

export async function GET(request: Request) {
  const denied = requireSuperAdmin(request);
  return denied || Response.json({ settings: getPlatformSettings() });
}

export async function PATCH(request: Request) {
  try {
    const denied = requireSuperAdmin(request); if (denied) return denied;
    const input = await request.json();
    const settings = updatePlatformSettings(input);
    audit(adminPrincipalFromRequest(request)?.label || "超级管理员", "platform_settings_update", {
      fields: Object.keys(input || {}).sort(),
      contactTextChanged: Object.prototype.hasOwnProperty.call(input || {}, "contactText"),
      inviteContactTextChanged: Object.prototype.hasOwnProperty.call(input || {}, "inviteContactText"),
    });
    return Response.json({ settings });
  } catch (error) { return apiError(error); }
}
