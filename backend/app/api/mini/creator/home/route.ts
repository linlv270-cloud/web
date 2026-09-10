import { miniPrincipalFromRequest, requireMiniActor } from "../../../../../lib/mini-auth";
import { getMiniCreatorHome } from "../../../../../lib/mini-program";

export async function GET(request: Request) {
  const denied = requireMiniActor(request, "creator");
  if (denied) return denied;
  return Response.json(
    { home: getMiniCreatorHome(miniPrincipalFromRequest(request)!.actorId) },
    { headers: { "cache-control": "no-store" } },
  );
}

