import { requireAdmin } from "../../../../../lib/auth";
import { apiError } from "../../../../../lib/http";
import { saveKitGuide } from "../../../../../lib/mini-program";

export async function POST(request: Request) {
  try {
    const denied = requireAdmin(request);
    if (denied) return denied;
    return Response.json({ guide: saveKitGuide(await request.json()) });
  } catch (error) {
    return apiError(error);
  }
}

export const PATCH = POST;
