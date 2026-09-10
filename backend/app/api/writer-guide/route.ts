import { creatorIdFromRequest } from "../../../lib/auth";
import { apiError } from "../../../lib/http";
import { markWriterGuideSeen } from "../../../lib/repository";

export async function POST(request: Request) {
  try {
    const creatorId = creatorIdFromRequest(request);
    if (!creatorId) return Response.json({ error: "请先登录" }, { status: 401 });
    return Response.json({ creator: markWriterGuideSeen(creatorId) });
  } catch (error) {
    return apiError(error);
  }
}
