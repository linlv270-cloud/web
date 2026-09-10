import { apiError } from "../../../../../lib/http";
import { miniPrincipalFromRequest, requireMiniActor } from "../../../../../lib/mini-auth";
import { saveMiniActivity } from "../../../../../lib/mini-program";

export async function POST(request: Request) {
  try {
    const denied = requireMiniActor(request, "creator");
    if (denied) return denied;
    return Response.json(
      { activity: saveMiniActivity(miniPrincipalFromRequest(request)!.actorId, await request.json()) },
      { status: 201 },
    );
  } catch (error) {
    return apiError(error);
  }
}

export const PATCH = POST;

