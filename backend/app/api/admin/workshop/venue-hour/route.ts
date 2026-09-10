import { requireSuperAdmin } from "../../../../../lib/auth";
import { apiError } from "../../../../../lib/http";
import { saveVenueHour } from "../../../../../lib/mini-program";

export async function POST(request: Request) {
  try {
    const denied = requireSuperAdmin(request);
    if (denied) return denied;
    return Response.json({ venueHour: saveVenueHour(await request.json()) });
  } catch (error) {
    return apiError(error);
  }
}

export const PATCH = POST;
