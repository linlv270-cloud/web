import { apiError } from "../../../../../lib/http";
import { createBoundCreatorSession, miniPrincipalFromRequest, requireMiniActor } from "../../../../../lib/mini-auth";
import { getMiniCreatorHome } from "../../../../../lib/mini-program";

export async function POST(request: Request) {
  try {
    const denied = requireMiniActor(request, "consumer");
    if (denied) return denied;
    const result = createBoundCreatorSession(miniPrincipalFromRequest(request)!.actorId);
    return Response.json({ ...result, home: getMiniCreatorHome(result.creatorId) }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return apiError(error);
  }
}
