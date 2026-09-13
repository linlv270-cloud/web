import { all } from "../../../../lib/database";
import { assetUrl } from "../../../../lib/storage";
import { getVisualizationSession } from "../../../../lib/visualization";

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
    if (!user) return Response.json({ error: "请先登录" }, { status: 401 });

    const clauses = ["ca.status = 'active'", "ca.public_authorized = 1", "c.suspended = 0"];
    const values: string[] = [];
    if (user.accessScope !== "all") {
      clauses.push("c.province = ?");
      values.push(user.province);
    }
    if (user.accessScope === "city") {
      clauses.push("c.city = ?");
      values.push(user.city);
    }
    const creators = all<{ creator_id: number; brand_name: string; logo_image_key: string }>(
      `SELECT ca.creator_id, COALESCE(NULLIF(c.brand_name, ''), ca.brand_name) AS brand_name,
              COALESCE(NULLIF(c.logo_key, ''), ca.logo_image_key) AS logo_image_key
       FROM creator_applications ca
       JOIN creators c ON c.id = ca.creator_id
       WHERE ${clauses.join(" AND ")}
       ORDER BY COALESCE(c.updated_at, ca.reviewed_at, ca.updated_at) DESC, ca.creator_id DESC`,
      ...values,
    ).map((creator) => ({
      id: creator.creator_id,
      brandName: creator.brand_name,
      logoUrl: assetUrl(creator.logo_image_key),
    }));
    return Response.json({ creators }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "读取主理人标识失败" }, { status: 500 });
  }
}
