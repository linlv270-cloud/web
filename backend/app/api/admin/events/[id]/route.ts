import { NextRequest } from "next/server";
import { all, one, run } from "../../../../../lib/database";
import { apiError } from "../../../../../lib/http";
import { requireAdmin } from "../../../../../lib/auth";
import { assetUrl } from "../../../../../lib/storage";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const denied = requireAdmin(request);
    if (denied) return denied;

    const { id } = await params;
    const event = one<any>("SELECT * FROM tde_events WHERE id = ?", Number(id));
    if (!event) return Response.json({ error: "活动不存在" }, { status: 404 });

    const registrations = all<any>(
      `SELECT er.*, c.brand_name, c.phone, c.slogan, c.logo_key
       FROM event_registrations er
       JOIN creators c ON er.creator_id = c.id
       WHERE er.event_id = ?
       ORDER BY er.created_at DESC`,
      Number(id),
    );
    const registrationIds = registrations.map((registration) => registration.id);
    const actions = registrationIds.length
      ? all<any>(
          `SELECT id, registration_id, action, from_status, to_status, actor_type, actor_id, note, created_at
           FROM event_registration_actions
           WHERE registration_id IN (${registrationIds.map(() => "?").join(",")})
           ORDER BY created_at ASC, id ASC`,
          ...registrationIds,
        )
      : [];
    const actionsByRegistration = new Map<number, any[]>();
    for (const action of actions) {
      const list = actionsByRegistration.get(action.registration_id) || [];
      list.push(action);
      actionsByRegistration.set(action.registration_id, list);
    }

    return Response.json({
      event: {
        ...event,
        coverUrl: event.cover_key ? assetUrl(event.cover_key) : "",
        categoryTags: JSON.parse(event.category_tags || "[]"),
      },
      registrations: registrations.map((r) => ({
        ...r,
        logoUrl: r.logo_key ? assetUrl(r.logo_key) : "",
        operationRecords: actionsByRegistration.get(r.id) || [],
      })),
    });
  } catch (error) {
    return apiError(error);
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const denied = requireAdmin(request);
    if (denied) return denied;

    const { id } = await params;
    const data = await request.json();

    const fields = [];
    const values = [];
    const allowed = ["title", "short_intro", "description", "province", "city", "district", "address", "start_date", "end_date", "business_hours", "registration_deadline", "max_participants", "status", "organizer"];
    allowed.forEach((f) => {
      if (data[f] !== undefined) {
        fields.push(`${f} = ?`);
        values.push(data[f]);
      }
    });
    if (data.category_tags !== undefined) {
      fields.push("category_tags = ?");
      values.push(JSON.stringify(data.category_tags));
    }
    if (fields.length) {
      values.push(Number(id));
      run(`UPDATE tde_events SET ${fields.join(", ")}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, ...values);
    }

    return Response.json({ success: true });
  } catch (error) {
    return apiError(error);
  }
}
