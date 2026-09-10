import { creatorIdFromRequest } from "../../../lib/auth";
import { apiError } from "../../../lib/http";
import { getCreator, removeWork, updateProfile } from "../../../lib/repository";

export async function GET(request: Request) {
  const creatorId = creatorIdFromRequest(request);
  return creatorId
    ? Response.json({ creator: getCreator(creatorId) })
    : Response.json({ error: "请先登录" }, { status: 401 });
}

export async function PATCH(request: Request) {
  try {
    const creatorId = creatorIdFromRequest(request);
    if (!creatorId) return Response.json({ error: "请先登录" }, { status: 401 });
    return Response.json({ creator: updateProfile(creatorId, await request.json()) });
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const creatorId = creatorIdFromRequest(request);
    if (!creatorId) return Response.json({ error: "请先登录" }, { status: 401 });
    const data = await request.json();
    return Response.json({ creator: removeWork(creatorId, String(data.url || "")) });
  } catch (error) {
    return apiError(error);
  }
}
