import { NextRequest } from "next/server";
import { all, one } from "../../../../lib/database";
import { assetUrl } from "../../../../lib/storage";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const province = searchParams.get("province") || "";
  const city = searchParams.get("city") || "";
  const tag = searchParams.get("tag") || "";
  const month = searchParams.get("month") || ""; // format: YYYY-MM
  const status = searchParams.get("status") || "recruiting";

  let where = "WHERE status != 'draft'";
  const params: any[] = [];

  if (province) {
    where += " AND province = ?";
    params.push(province);
  }
  if (city) {
    where += " AND city = ?";
    params.push(city);
  }
  if (status && status !== "all") {
    where += " AND status = ?";
    params.push(status);
  }
  if (month) {
    where += " AND (substr(start_date,1,7) = ? OR substr(end_date,1,7) = ?)";
    params.push(month, month);
  }

  const events = all<any>(
    `SELECT id, reference, title, short_intro, cover_key, province, city, district, address,
      start_date, end_date, business_hours, registration_deadline, category_tags, max_participants, status, organizer,
      (SELECT COUNT(*) FROM event_registrations WHERE event_id = tde_events.id AND status IN ('pending','approved')) as registered_count
     FROM tde_events ${where}
     ORDER BY start_date ASC`,
    ...params,
  );

  const result = events.map((e) => ({
    id: e.id,
    reference: e.reference,
    title: e.title,
    short_intro: e.short_intro,
    province: e.province,
    city: e.city,
    district: e.district,
    address: e.address,
    start_date: e.start_date,
    end_date: e.end_date,
    business_hours: e.business_hours,
    registration_deadline: e.registration_deadline,
    category_tags: e.category_tags,
    max_participants: e.max_participants,
    status: e.status,
    organizer: e.organizer,
    coverUrl: e.cover_key ? assetUrl(e.cover_key) : "",
    categoryTags: JSON.parse(e.category_tags || "[]"),
    registeredCount: e.registered_count || 0,
    remaining: e.max_participants ? Math.max(0, e.max_participants - (e.registered_count || 0)) : null,
  }));

  // 如果有标签筛选，在内存中过滤
  const filtered = tag ? result.filter((e) => e.categoryTags.includes(tag)) : result;

  return Response.json({ events: filtered });
}
