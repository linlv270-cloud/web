import { NextRequest } from "next/server";
import { all, one, run, transaction } from "../../../../../../../lib/database";
import { apiError } from "../../../../../../../lib/http";
import { adminCanManageCreator, adminPrincipalFromRequest, requireAdmin } from "../../../../../../../lib/auth";
import { getCreator } from "../../../../../../../lib/repository";
import { assetUrl } from "../../../../../../../lib/storage";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; regId: string }> },
) {
  try {
    const denied = requireAdmin(request);
    if (denied) return denied;

    const { id, regId } = await params;
    const registration = one<{ id: number; event_id: number; creator_id: number }>(
      "SELECT id, event_id, creator_id FROM event_registrations WHERE id = ? AND event_id = ?",
      Number(regId),
      Number(id),
    );
    if (!registration) return Response.json({ error: "报名记录不存在" }, { status: 404 });
    if (!adminCanManageCreator(request, registration.creator_id)) {
      return Response.json({ error: "该账号不能查看此主理人资料" }, { status: 403 });
    }

    const creator = getCreator(registration.creator_id);
    if (!creator) return Response.json({ error: "主理人不存在" }, { status: 404 });

    const operationRecords = all<any>(
      `SELECT id, action, from_status, to_status, actor_type, actor_id, note, created_at
       FROM event_registration_actions
       WHERE registration_id = ?
       ORDER BY created_at ASC, id ASC`,
      registration.id,
    );

    return Response.json({
      creator: {
        id: creator.id,
        phone: creator.phone,
        userName: creator.userName,
        brandName: creator.brandName,
        slogan: creator.slogan,
        intro: creator.intro,
        province: creator.province,
        city: creator.city,
        district: creator.district,
        wechat: creator.wechat,
        socialAccount: creator.socialAccount,
        registeredWithCode: creator.registeredWithCode,
        logoUrl: creator.logoKey ? assetUrl(creator.logoKey) : "",
        representativeImageUrl: creator.representativeImageUrl || "",
        tags: creator.tags,
        opportunityTypes: creator.opportunityTypes,
        precisionInviteGoals: creator.precisionInviteGoals,
        precisionInviteScenes: creator.precisionInviteScenes,
        xiaohongshuFollowers: creator.xiaohongshuFollowers,
        xiaohongshuUrl: creator.xiaohongshuUrl,
        douyinFollowers: creator.douyinFollowers,
        douyinUrl: creator.douyinUrl,
      },
      operationRecords,
    });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; regId: string }> },
) {
  try {
    const denied = requireAdmin(request);
    if (denied) return denied;

    const { id, regId } = await params;
    const registration = one<{ id: number; event_id: number; creator_id: number; status: string }>(
      "SELECT id, event_id, creator_id, status FROM event_registrations WHERE id = ? AND event_id = ?",
      Number(regId),
      Number(id),
    );
    if (!registration) return Response.json({ error: "报名记录不存在" }, { status: 404 });
    if (!adminCanManageCreator(request, registration.creator_id)) {
      return Response.json({ error: "该账号不能管理此主理人报名" }, { status: 403 });
    }
    if (registration.status !== "pending") {
      return Response.json({ error: "当前报名状态不可审核" }, { status: 400 });
    }

    const data = await request.json();
    const action = String(data.action || "");
    if (!["approve", "reject"].includes(action)) {
      return Response.json({ error: "无效操作" }, { status: 400 });
    }
    const status = action === "approve" ? "approved" : "rejected";
    const admin = adminPrincipalFromRequest(request);

    transaction(() => {
      run(
        "UPDATE event_registrations SET status = ?, reviewed_at = CURRENT_TIMESTAMP, reviewed_by = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND event_id = ?",
        status,
        String(admin?.id || ""),
        registration.id,
        registration.event_id,
      );
      run(
        `INSERT INTO event_registration_actions
          (registration_id, event_id, creator_id, action, from_status, to_status, actor_type, actor_id, note)
         VALUES (?, ?, ?, 'review', ?, ?, 'admin', ?, ?)`,
        registration.id,
        registration.event_id,
        registration.creator_id,
        registration.status,
        status,
        String(admin?.id || ""),
        action,
      );
    });

    return Response.json({ success: true, status });
  } catch (error) {
    return apiError(error);
  }
}
