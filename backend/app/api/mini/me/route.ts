import { apiError } from "../../../../lib/http";
import { getMiniAccountRoles, getMiniConsumer, miniPrincipalFromRequest, requireMiniActor, updateMiniConsumer } from "../../../../lib/mini-auth";
import { getMiniCreatorHome } from "../../../../lib/mini-program";

export async function GET(request: Request) {
  const denied = requireMiniActor(request);
  if (denied) return denied;
  const principal = miniPrincipalFromRequest(request)!;
  return Response.json(
    principal.actorType === "consumer"
      ? { actorType: "consumer", consumer: getMiniConsumer(principal.actorId), roles: getMiniAccountRoles(principal.actorId) }
      : { actorType: "creator", home: getMiniCreatorHome(principal.actorId) },
    { headers: { "cache-control": "no-store" } },
  );
}

export async function PATCH(request: Request) {
  try {
    const denied = requireMiniActor(request, "consumer");
    if (denied) return denied;
    const principal = miniPrincipalFromRequest(request)!;
    return Response.json({ consumer: updateMiniConsumer(principal.actorId, await request.json()) });
  } catch (error) {
    return apiError(error);
  }
}
