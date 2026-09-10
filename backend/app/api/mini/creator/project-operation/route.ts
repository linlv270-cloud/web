import { apiError } from "../../../../../lib/http";
import { miniPrincipalFromRequest, requireMiniActor } from "../../../../../lib/mini-auth";
import {
  listProjectOperationRequests,
  submitProjectOperationRequest,
  withdrawProjectOperationRequest,
} from "../../../../../lib/mini-program";

export async function GET(request: Request) {
  const denied = requireMiniActor(request, "creator");
  if (denied) return denied;
  const creatorId = miniPrincipalFromRequest(request)!.actorId;
  return Response.json(
    { requests: listProjectOperationRequests(creatorId) },
    { headers: { "cache-control": "no-store" } },
  );
}

export async function POST(request: Request) {
  try {
    const denied = requireMiniActor(request, "creator");
    if (denied) return denied;
    const creatorId = miniPrincipalFromRequest(request)!.actorId;
    const data = await request.json();
    if (data.action === "withdraw")
      return Response.json({ request: withdrawProjectOperationRequest(creatorId, Number(data.id || 0)) });
    return Response.json(
      { request: submitProjectOperationRequest(creatorId, data) },
      { status: 201, headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}
