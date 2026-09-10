import { apiError } from "../../../../../lib/http";
import { miniPrincipalFromRequest } from "../../../../../lib/mini-auth";
import { createWorkshopDiscovery } from "../../../../../lib/mini-program";
import { rateLimit } from "../../../../../lib/security";

export async function POST(request: Request) {
  try {
    const limited = rateLimit(request, "mini-workshop-discovery", 40, 10 * 60000);
    if (limited) return limited;
    const input = await request.json();
    const principal = miniPrincipalFromRequest(request);
    const consumerId = principal?.actorType === "consumer" ? principal.actorId : null;
    return Response.json(
      { draw: createWorkshopDiscovery(input, consumerId) },
      { status: 201, headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}
