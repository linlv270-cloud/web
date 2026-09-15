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
      `SELECT er.id as reg_id, er.event_id, er.status as reg_status, er.message, er.created_at as reg_created_at,
              e.id, e.title, e.short_intro, e.cover_key, e.province, e.city, e.district, e.address,
              e.start_date, e.end_date, e.business_hours, e.registration_deadline, e.category_tags, e.status as event_status, e.organizer
       FROM event_registrations er
       JOIN tde_events e ON er.event_id = e.id
       WHERE er.creator_id = ?
       ORDER BY er.created_at DESC`,
      principal.actorId,
    );

    const result = registrations.map((r) => {
      const actions = all<any>(
        `SELECT id, action, from_status, to_status, actor_type, created_at
         FROM event_registration_actions
         WHERE registration_id = ?
         ORDER BY created_at ASC, id ASC`,
        r.reg_id,
      );
      return {
        ...r,
        coverUrl: r.cover_key ? assetUrl(r.cover_key) : "",
        categoryTags: JSON.parse(r.category_tags || "[]"),
        operationRecords: actions,
      };
    });

    return Response.json({ registrations: result });
  } catch (error) {
    return apiError(error);
  }
}
