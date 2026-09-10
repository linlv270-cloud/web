import { apiError } from "../../../../../lib/http";
import { one, run } from "../../../../../lib/database";
import { rateLimit } from "../../../../../lib/security";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const latitude = Number(url.searchParams.get("latitude"));
    const longitude = Number(url.searchParams.get("longitude"));
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180)
      throw new Error("定位信息无效");
    const coordinateKey = `${latitude.toFixed(2)},${longitude.toFixed(2)}`;
    const cached = one<{ province: string; city: string; district: string }>(
      "SELECT province, city, district FROM location_reverse_cache WHERE coordinate_key = ? AND expires_at > ?",
      coordinateKey,
      new Date().toISOString(),
    );
    if (cached) {
      return Response.json({ location: cached }, {
        headers: { "cache-control": "private, max-age=2592000" },
      });
    }
    const limited = rateLimit(request, "mini-location", 30, 10 * 60000);
    if (limited) return limited;
    const key = process.env.TENCENT_MAP_KEY || "";
    if (!key) throw new Error("城区定位尚未配置，请手动选择");
    const endpoint = new URL("https://apis.map.qq.com/ws/geocoder/v1/");
    endpoint.searchParams.set("location", `${latitude},${longitude}`);
    endpoint.searchParams.set("key", key);
    endpoint.searchParams.set("get_poi", "0");
    const response = await fetch(endpoint, { signal: AbortSignal.timeout(8000) });
    const data = await response.json() as {
      status?: number;
      message?: string;
      result?: { address_component?: { province?: string; city?: string; district?: string } };
    };
    const component = data.result?.address_component;
    if (!response.ok || data.status !== 0 || !component?.city) throw new Error(data.message || "暂时无法识别所在城区");
    const location = {
      province: component.province || "",
      city: component.city || component.province || "",
      district: component.district || "",
    };
    run(
      `INSERT INTO location_reverse_cache(coordinate_key, province, city, district, expires_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(coordinate_key) DO UPDATE SET province = excluded.province, city = excluded.city,
       district = excluded.district, expires_at = excluded.expires_at, updated_at = CURRENT_TIMESTAMP`,
      coordinateKey,
      location.province,
      location.city,
      location.district,
      new Date(Date.now() + 90 * 86400000).toISOString(),
    );
    return Response.json({ location }, { headers: { "cache-control": "private, max-age=2592000" } });
  } catch (error) {
    return apiError(error);
  }
}
