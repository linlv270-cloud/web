import { NextRequest } from "next/server";
import { all, run } from "../../../../lib/database";
import { apiError } from "../../../../lib/http";
import { adminPrincipalFromRequest, requireAdmin } from "../../../../lib/auth";
import { assetUrl } from "../../../../lib/storage";

export async function GET(request: NextRequest) {
  try {
    const denied = requireAdmin(request);
    if (denied) return denied;

    const events = all<any>(
      `SELECT e.*,
        (SELECT COUNT(*) FROM event_registrations WHERE event_id = e.id AND status IN ('pending','approved')) as registered_count
       FROM tde_events e
       ORDER BY e.created_at DESC`,
    );

    const result = events.map((e) => ({
      ...e,
      coverUrl: e.cover_key ? assetUrl(e.cover_key) : "",
      categoryTags: JSON.parse(e.category_tags || "[]"),
      registeredCount: e.registered_count || 0,
    }));

    return Response.json({ events: result });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const denied = requireAdmin(request);
    if (denied) return denied;

    const data = await request.json();
    const reference = "TDE" + Date.now().toString(36).toUpperCase();
    const admin = adminPrincipalFromRequest(request);

    run(
      `INSERT INTO tde_events (reference, title, short_intro, description, province, city, district, address,
        start_date, end_date, business_hours, registration_deadline, category_tags, max_participants, status, organizer, created_by_admin_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      reference,
      data.title || "",
      data.short_intro || "",
      data.description || "",
      data.province || "",
      data.city || "",
      data.district || "",
      data.address || "",
      data.start_date || "",
      data.end_date || "",
      data.business_hours || "",
      data.registration_deadline || "",
      JSON.stringify(data.category_tags || []),
      data.max_participants || 0,
      data.status || "draft",
      data.organizer || "TDE官方",
      admin?.id || null,
    );

    return Response.json({ success: true, reference });
  } catch (error) {
    return apiError(error);
  }
}
