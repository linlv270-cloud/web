import { adminCanManageCreator, adminPrincipalFromRequest, requireAdmin } from "../../../../lib/auth";
import { apiError } from "../../../../lib/http";
import { listPlatformNotifications, sendPlatformMessage } from "../../../../lib/repository";
import { deliverPlatformNotificationToWecom } from "../../../../lib/wecom-notifications";

export async function GET(request: Request) {
  const denied = requireAdmin(request);
  const principal = adminPrincipalFromRequest(request);
  return denied || Response.json({ notifications: listPlatformNotifications(principal || undefined) });
}

export async function POST(request: Request) {
  try {
    const denied = requireAdmin(request);
    if (denied) return denied;
    const principal = adminPrincipalFromRequest(request)!;
    const data = await request.json();
    const creatorIds = Array.isArray(data.creatorIds)
      ? [...new Set(data.creatorIds.map((value: unknown) => Number(value)).filter(Number.isInteger))] as number[]
      : [];
    if (creatorIds.some((creatorId) => !adminCanManageCreator(request, creatorId)))
      return Response.json({ error: "接收名单包含该账号不能管理的新遇官" }, { status: 403 });
    const created = sendPlatformMessage(creatorIds, data.subject, data.body, {
      source: data.source,
      filterSnapshot: data.filterSnapshot,
      sender: principal.label,
      createdByAdminId: principal.id,
    });
    const wecom = await deliverPlatformNotificationToWecom(created.id);
    const notification = listPlatformNotifications(principal).find((item) => item.id === created.id)!;
    return Response.json({ sent: notification.sentCount, wecom, notification });
  }
  catch (error) { return apiError(error); }
}

export async function PATCH(request: Request) {
  try {
    const denied = requireAdmin(request);
    if (denied) return denied;
    const principal = adminPrincipalFromRequest(request)!;
    const data = await request.json();
    const campaignId = Number(data.campaignId || 0);
    const allowed = listPlatformNotifications(principal).some((item) => item.id === campaignId);
    if (!allowed) return Response.json({ error: "该账号不能重试这条通知" }, { status: 403 });
    const wecom = await deliverPlatformNotificationToWecom(campaignId);
    const notification = listPlatformNotifications(principal).find((item) => item.id === campaignId)!;
    return Response.json({ wecom, notification });
  } catch (error) {
    return apiError(error);
  }
}
