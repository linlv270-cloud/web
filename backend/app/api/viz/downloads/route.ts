import { apiError } from "../../../../lib/http";
import { getVisualizationSession } from "../../../../lib/visualization";
import { createVisualizationDownload } from "../../../../lib/visualization-downloads";

function tokenFrom(request: Request) {
  const match = (request.headers.get("cookie") || "").match(/(?:^|;\s*)viz_session=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : "";
}

export async function POST(request: Request) {
  try {
    const user = getVisualizationSession(tokenFrom(request));
    if (!user) return Response.json({ error: "请先登录" }, { status: 401 });
    const body = await request.json();
    const id = createVisualizationDownload(user, {
      downloadType: body.downloadType,
      creatorIds: Array.isArray(body.creatorIds) ? body.creatorIds : [],
      fileName: body.fileName,
      planId: body.planId,
    });
    return Response.json({ success: true, id });
  } catch (error) {
    return apiError(error);
  }
}
