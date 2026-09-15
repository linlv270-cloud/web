import { NextRequest } from "next/server";
import { one, run } from "../../../../../lib/database";
import { assetUrl } from "../../../../../lib/storage";
import { miniPrincipalFromRequest } from "../../../../../lib/mini-auth";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const eventId = Number(id);

  const event = one<{
    id: number;
    reference: string;
    title: string;
    short_intro: string;
    description: string;
    cover_key: string | null;
    province: string;
    city: string;
    district: string;
    address: string;
    start_date: string;
    end_date: string;
    business_hours: string;
    registration_deadline: string;
    category_tags: string;
    max_participants: number;
    status: string;
    organizer: string;
    view_count: number;
  }>(
    `SELECT id, reference, title, short_intro, description, cover_key,
            province, city, district, address, start_date, end_date, business_hours,
            registration_deadline, category_tags, max_participants, status,
            organizer, view_count
     FROM tde_events
     WHERE id = ? AND status != 'draft'`,
    eventId,
  );
  if (!event) return Response.json({ error: "活动不存在" }, { status: 404 });

  // 增加浏览量
  run("UPDATE tde_events SET view_count = view_count + 1 WHERE id = ?", eventId);

  const registeredCount = one<{ count: number }>(
    "SELECT COUNT(*) as count FROM event_registrations WHERE event_id = ? AND status IN ('pending','approved')",
    eventId,
  )?.count || 0;

  // 检查当前用户是否已报名
  let myRegistration = null;
  const principal = miniPrincipalFromRequest(request);
  if (principal && principal.actorType === "creator") {
    myRegistration = one<any>(
      "SELECT id, status, message, created_at FROM event_registrations WHERE event_id = ? AND creator_id = ?",
      eventId, principal.actorId,
    );
  }

  return Response.json({
    event: {
      id: event.id,
      reference: event.reference,
      title: event.title,
      short_intro: event.short_intro,
      description: event.description,
      province: event.province,
      city: event.city,
      district: event.district,
      address: event.address,
      start_date: event.start_date,
      end_date: event.end_date,
      business_hours: event.business_hours,
      registration_deadline: event.registration_deadline,
      max_participants: event.max_participants,
      status: event.status,
      organizer: event.organizer,
      view_count: event.view_count,
      coverUrl: event.cover_key ? assetUrl(event.cover_key) : "",
      categoryTags: JSON.parse(event.category_tags || "[]"),
      registeredCount,
      remaining: event.max_participants ? Math.max(0, event.max_participants - registeredCount) : null,
    },
    myRegistration,
  });
}
