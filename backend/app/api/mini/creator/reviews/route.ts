import { apiError } from "../../../../../lib/http";
import { miniPrincipalFromRequest, requireMiniActor } from "../../../../../lib/mini-auth";
import {
  addCreatorReviewSubmission,
  getCreatorReviewThread,
  listCreatorReviewThreads,
} from "../../../../../lib/review-workflow";

export async function GET(request: Request) {
  try {
    const denied = requireMiniActor(request, "creator");
    if (denied) return denied;
    const creatorId = miniPrincipalFromRequest(request)!.actorId;
    const id = Number(new URL(request.url).searchParams.get("id") || 0);
    return Response.json(
      id ? { thread: getCreatorReviewThread(creatorId, id) } : { threads: listCreatorReviewThreads(creatorId) },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const denied = requireMiniActor(request, "creator");
    if (denied) return denied;
    const creatorId = miniPrincipalFromRequest(request)!.actorId;
    const data = await request.json();
    return Response.json({
      thread: addCreatorReviewSubmission(Number(data.id || 0), creatorId, data.body),
    });
  } catch (error) {
    return apiError(error);
  }
}
