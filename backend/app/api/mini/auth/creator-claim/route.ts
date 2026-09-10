import { apiError } from "../../../../../lib/http";
import { claimManagedCreator, miniPrincipalFromRequest, requireMiniActor } from "../../../../../lib/mini-auth";
import { getMiniCreatorHome } from "../../../../../lib/mini-program";
import { rateLimit } from "../../../../../lib/security";

export async function POST(request: Request) {
  try {
    const denied = requireMiniActor(request, "consumer");
    if (denied) return denied;
    const principal = miniPrincipalFromRequest(request)!;
    const limited = rateLimit(request, "mini-creator-claim", 8, 60 * 60000, String(principal.actorId));
    if (limited) return limited;
    const data = await request.json();
    const result = await claimManagedCreator({
      consumerId: principal.actorId,
      code: String(data.code || ""),
      phoneCode: String(data.phoneCode || ""),
      mockPhone: String(data.mockPhone || ""),
      agreed: data.agreed === true,
    });
    return Response.json(
      { ...result, home: getMiniCreatorHome(result.creatorId) },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}
