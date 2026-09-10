import { NextRequest } from "next/server";
import { one, run } from "../../../../../../lib/database";
import { apiError } from "../../../../../../lib/http";
import { miniPrincipalFromRequest } from "../../../../../../lib/mini-auth";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const eventId = Number(id);

    const principal = miniPrincipalFromRequest(request);
    if (!principal || principal.actorType !== "creator") {
      return Response.json({ error: "请先登录" }, { status: 401 });
    }
    const creatorId = principal.actorId;

    const data = await request.json();
    const message = String(data.message || "").slice(0, 500);

    const event = one<any>("SELECT * FROM tde_events WHERE id = ?", eventId);
    if (!event) throw new Error("活动不存在");
    if (event.status !== "recruiting") throw new Error("该活动暂不接受报名");

    // 检查报名截止
    if (event.registration_deadline) {
      const deadline = new Date(event.registration_deadline);
      if (new Date() > deadline) throw new Error("报名已截止");
    }

    // 检查是否已满员
    const registered = one<{ count: number }>(
      "SELECT COUNT(*) as count FROM event_registrations WHERE event_id = ? AND status IN ('pending','approved')",
      eventId,
    )?.count || 0;
    if (event.max_participants && registered >= event.max_participants) {
      throw new Error("活动名额已满");
    }

    // 检查是否已报名
    const existing = one<any>(
      "SELECT id, status FROM event_registrations WHERE event_id = ? AND creator_id = ?",
      eventId, creatorId,
    );
    if (existing && existing.status !== "cancelled" && existing.status !== "rejected") {
      throw new Error("你已报名该活动");
    }

    if (existing) {
      run(
        "UPDATE event_registrations SET status = 'pending', message = ?, created_at = CURRENT_TIMESTAMP WHERE id = ?",
        message, existing.id,
      );
    } else {
      run(
        "INSERT INTO event_registrations (event_id, creator_id, message) VALUES (?, ?, ?)",
        eventId, creatorId, message,
      );
    }

    return Response.json({ success: true, message: "报名成功，等待审核" });
  } catch (error) {
    return apiError(error);
  }
}

// 取消报名
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const eventId = Number(id);

    const principal = miniPrincipalFromRequest(request);
    if (!principal || principal.actorType !== "creator") {
      return Response.json({ error: "请先登录" }, { status: 401 });
    }

    run(
      "UPDATE event_registrations SET status = 'cancelled' WHERE event_id = ? AND creator_id = ?",
      eventId, principal.actorId,
    );

    return Response.json({ success: true, message: "已取消报名" });
  } catch (error) {
    return apiError(error);
  }
}
