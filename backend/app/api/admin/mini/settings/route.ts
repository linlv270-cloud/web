import { requireSuperAdmin } from "../../../../../lib/auth";
import { apiError } from "../../../../../lib/http";
import { updateMiniProgramSettings } from "../../../../../lib/mini-program";

export async function PATCH(request: Request) {
  try {
    const denied = requireSuperAdmin(request);
    if (denied) return denied;
    return Response.json({ settings: updateMiniProgramSettings(await request.json()) });
  } catch (error) {
    return apiError(error);
  }
}

