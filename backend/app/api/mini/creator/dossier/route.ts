import { apiError } from "../../../../../lib/http";
import { offlineExperienceTypes } from "../../../../../lib/catalog";
import { getCreatorApplication, miniPrincipalFromRequest, requireMiniActor } from "../../../../../lib/mini-auth";
import {
  claimTag,
  getCreator,
  getInbox,
  markInboxRead,
  removeTag,
  submitTags,
  updateManagedCreatorDetails,
  updateProfile,
} from "../../../../../lib/repository";
import { updateCreatorPhonePublicAuthorization } from "../../../../../lib/mini-program";

export async function PATCH(request: Request) {
  try {
    const denied = requireMiniActor(request, "creator");
    if (denied) return denied;
    const creatorId = miniPrincipalFromRequest(request)!.actorId;
    const data = await request.json();
    const application = getCreatorApplication(creatorId);
    if (application && application.status !== "active" && !["readNotice", "schedule"].includes(String(data.action)))
      throw new Error("请在新遇官申请页补充资料并重新提交");
    if (data.action === "profile") {
      if (!Array.isArray(data.opportunityTypes)) throw new Error("线下体验类型不正确");
      const opportunityTypes = [...new Set<string>(
        data.opportunityTypes.map((item: unknown) => String(item).trim()).filter(Boolean),
      )];
      if (opportunityTypes.some((item) => !offlineExperienceTypes.includes(item as (typeof offlineExperienceTypes)[number])))
        throw new Error("线下体验类型不正确");
      return Response.json({ creator: updateProfile(creatorId, { ...data, opportunityTypes }) });
    }
    if (data.action === "replaceTags")
      return Response.json({ creator: updateManagedCreatorDetails(creatorId, { tagIds: data.tagIds }, "新遇官本人") });
    if (data.action === "claimTag") return Response.json({ creator: claimTag(creatorId, data) });
    if (data.action === "removeTag") return Response.json({ creator: removeTag(creatorId, Number(data.tagId)) });
    if (data.action === "submitTags") return Response.json({ creator: submitTags(creatorId) });
    if (data.action === "schedule") {
      const busyPeriods = Array.isArray(data.busyPeriods) ? data.busyPeriods : [];
      const noBookings = data.noBookings === true;
      if (noBookings && busyPeriods.length) throw new Error("活动日期与近期无其他活动安排不能同时选择");
      if (!noBookings && !busyPeriods.length) throw new Error("请选择活动日期或近期无其他活动安排");
      const creator = updateManagedCreatorDetails(creatorId, { busyPeriods, noBookings }, "新遇官本人");
      return Response.json({ creator });
    }
    if (data.action === "contactConsent")
      return Response.json({ contact: updateCreatorPhonePublicAuthorization(creatorId, data.authorized === true) });
    if (data.action === "readNotice") return Response.json({ messages: markInboxRead(creatorId, Number(data.id)) });
    throw new Error("不支持的档案操作");
  } catch (error) {
    return apiError(error);
  }
}

export async function GET(request: Request) {
  const denied = requireMiniActor(request, "creator");
  if (denied) return denied;
  const creatorId = miniPrincipalFromRequest(request)!.actorId;
  const messages = getInbox(creatorId);
  return Response.json({ creator: getCreator(creatorId), messages, unreadCount: messages.filter((item) => !item.readAt).length }, { headers: { "cache-control": "no-store" } });
}
