import { apiError } from "../../../../../lib/http";
import { miniPrincipalFromRequest, requireMiniActor } from "../../../../../lib/mini-auth";
import { getMiniCreatorHome, saveWorkshopProject } from "../../../../../lib/mini-program";

export async function POST(request: Request) {
  try {
    const denied = requireMiniActor(request, "creator");
    if (denied) return denied;
    const creatorId = miniPrincipalFromRequest(request)!.actorId;
    const project = saveWorkshopProject(creatorId, await request.json());
    return Response.json({ project, home: getMiniCreatorHome(creatorId) }, { status: 201, headers: { "cache-control": "no-store" } });
  } catch (error) {
    return apiError(error);
  }
}

export const PATCH = POST;
