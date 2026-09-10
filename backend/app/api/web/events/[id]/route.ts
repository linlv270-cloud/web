import { NextRequest } from "next/server";
import { one, run } from "../../../../../lib/database";
import { assetUrl } from "../../../../../lib/storage";
import { miniPrincipalFromRequest } from "../../../../../lib/mini-auth";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const eventId = Number(id);

  const event = one<any>(
    `SELECT * FROM tde_events WHERE id = ?`,
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
      ...event,
      coverUrl: event.cover_key ? assetUrl(event.cover_key) : "",
      categoryTags: JSON.parse(event.category_tags || "[]"),
      registeredCount,
      remaining: event.max_participants ? Math.max(0, event.max_participants - registeredCount) : null,
    },
    myRegistration,
  });
}
