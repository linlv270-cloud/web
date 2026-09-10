import { apiError } from "../../../../../lib/http";
import { miniPrincipalFromRequest, requireMiniActor } from "../../../../../lib/mini-auth";
import { recordWorkshopContactClick } from "../../../../../lib/mini-program";
import { rateLimit } from "../../../../../lib/security";

export async function POST(request: Request) {
  try {
    const denied = requireMiniActor(request, "consumer");
    if (denied) return denied;
    const consumerId = miniPrincipalFromRequest(request)!.actorId;
    const limited = rateLimit(request, "mini-workshop-contact", 12, 60 * 60000, String(consumerId));
    if (limited) return limited;
    return Response.json(recordWorkshopContactClick(await request.json(), consumerId), {
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    return apiError(error);
  }
}
