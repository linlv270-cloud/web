import { requireSuperAdmin } from "../../../../../lib/auth";
import { apiError } from "../../../../../lib/http";
import { saveWorkshopKit } from "../../../../../lib/mini-program";

export async function POST(request: Request) {
  try {
    const denied = requireSuperAdmin(request);
    if (denied) return denied;
    return Response.json({ kit: saveWorkshopKit(await request.json()) });
  } catch (error) {
    return apiError(error);
  }
}

export const PATCH = POST;
