import { apiError } from "../../../../lib/http";
import { isValidLocation } from "../../../../lib/locations";
import { getVisualizationSession } from "../../../../lib/visualization";
import { listVisualizationPlans } from "../../../../lib/visualization-planning";

const COOKIE_NAME = "viz_session";

function tokenFromRequest(request: Request) {
  const cookie = request.headers.get("cookie") || "";
  return cookie.match(new RegExp(`${COOKIE_NAME}=([^;]+)`))?.[1] || "";
}

export async function GET(request: Request) {
  try {
    const token = tokenFromRequest(request);
    const user = token ? getVisualizationSession(token) : null;
    if (!user) return Response.json({ error: "请先登录" }, { status: 401 });
    const url = new URL(request.url);
    const date = url.searchParams.get("date") || "";
    const startDate = url.searchParams.get("startDate") || "";
    const endDate = url.searchParams.get("endDate") || "";
    let province = url.searchParams.get("province") || "";
    let city = url.searchParams.get("city") || "";
    if (user.accessScope === "city") {
      province = user.province;
      city = user.city;
    } else if (user.accessScope === "province") {
      province = user.province;
      city = "";
    } else if (city && (!province || !isValidLocation(province, city))) {
      throw new Error("请选择有效的省市");
    }
    return Response.json({
      plans: listVisualizationPlans({
        date: date || undefined,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        province: province || undefined,
        city: city || undefined,
        publishedOnly: true,
      }),
    });
  } catch (error) {
    return apiError(error);
  }
}
