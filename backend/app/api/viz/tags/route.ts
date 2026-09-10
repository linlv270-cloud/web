import { getVisualizationSession } from "../../../../lib/visualization";
import { listTags } from "../../../../lib/repository";

const COOKIE_NAME = "viz_session";

function getTokenFromRequest(request: Request): string {
  const cookie = request.headers.get("cookie") || "";
  const match = cookie.match(new RegExp(`${COOKIE_NAME}=([^;]+)`));
  return match ? match[1] : "";
}

export async function GET(request: Request) {
  try {
    const token = getTokenFromRequest(request);
    const user = token ? getVisualizationSession(token) : null;
    if (!user) {
      return Response.json({ error: "请先登录" }, { status: 401 });
    }

    const tags = listTags(false);
    return Response.json({ tags });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "获取标签失败" }, { status: 500 });
  }
}
