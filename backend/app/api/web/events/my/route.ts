import { NextRequest } from "next/server";
import { all } from "../../../../../lib/database";
import { apiError } from "../../../../../lib/http";
import { miniPrincipalFromRequest } from "../../../../../lib/mini-auth";
import { assetUrl } from "../../../../../lib/storage";

export async function GET(request: NextRequest) {
  try {
    const principal = miniPrincipalFromRequest(request);
    if (!principal || principal.actorType !== "creator") {
      return Response.json({ error: "请先登录" }, { status: 401 });
    }

    const registrations = all<any>(
      `SELECT er.id as reg_id, er.status as reg_status, er.message, er.created_at as reg_created_at,
              e.id, e.title, e.short_intro, e.cover_key, e.province, e.city, e.district, e.address,
              e.start_date, e.end_date, e.registration_deadline, e.category_tags, e.status as event_status, e.organizer
       FROM event_registrations er
       JOIN tde_events e ON er.event_id = e.id
       WHERE er.creator_id = ?
       ORDER BY er.created_at DESC`,
      principal.actorId,
    );

    const result = registrations.map((r) => ({
      ...r,
      coverUrl: r.cover_key ? assetUrl(r.cover_key) : "",
      categoryTags: JSON.parse(r.category_tags || "[]"),
    }));

    return Response.json({ registrations: result });
  } catch (error) {
    return apiError(error);
  }
}
