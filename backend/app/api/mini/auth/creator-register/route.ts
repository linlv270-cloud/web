import { creatorApplicationTagCategories, offlineExperienceTypes } from "../../../../../lib/catalog";
import { all, transaction } from "../../../../../lib/database";
import { apiError } from "../../../../../lib/http";
import { isValidLocation } from "../../../../../lib/locations";
import {
  bindMiniCreator,
  createMiniSession,
  exchangeWechatPhoneCode,
  getConsumerCreatorApplication,
  getMiniAccountRoles,
  miniPrincipalFromRequest,
  requireMiniActor,
  submitCreatorApplicationSnapshot,
} from "../../../../../lib/mini-auth";
import { getMiniCreatorHome, getMiniProgramSettings } from "../../../../../lib/mini-program";
import {
  attachUpload,
  claimTag,
  getCreator,
  registerWechatCreator,
  updateManagedCreatorDetails,
  updateProfile,
} from "../../../../../lib/repository";
import { normalizePhone, rateLimit, validPhone } from "../../../../../lib/security";
import { assetUrl, deleteObject, getObject } from "../../../../../lib/storage";
import { addCreatorReviewSubmission, ensureReviewThread } from "../../../../../lib/review-workflow";
import { checkTextContent, checkImageContent } from "../../../../../lib/wechat-mini";

type CustomTagInput = { label?: unknown; category?: unknown };
type BusyPeriodInput = { startDate?: unknown; endDate?: unknown; note?: unknown };

function objectKey(url: string) {
  return url.startsWith("/api/assets/")
    ? url.slice("/api/assets/".length).split("/").map(decodeURIComponent).join("/")
    : "";
}

function normalizeBusyPeriods(input: unknown) {
  if (!Array.isArray(input)) return [];
  if (input.length > 30) throw new Error("最多可添加30段已安排档期");
  return input.map((value) => {
    const item = value as BusyPeriodInput;
    const startDate = String(item.startDate || "").trim();
    const endDate = String(item.endDate || startDate).trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate) || startDate > endDate)
      throw new Error("活动档期格式不正确");
    return { startDate, endDate, note: String(item.note || "已有活动").trim().slice(0, 20) };
  });
}

export async function GET(request: Request) {
  const denied = requireMiniActor(request, "consumer");
  if (denied) return denied;
  const consumerId = miniPrincipalFromRequest(request)!.actorId;
  const application = getConsumerCreatorApplication(consumerId);
  const creator = application ? getCreator(application.creatorId) : null;
  const settings = getMiniProgramSettings();
  const creatorApplicationFields = settings.creatorApplicationFields;
  const representativeImageKey = application?.representativeImageKey || objectKey(creator?.workUrls[0] || "");
  const logoImageKey = application?.logoImageKey || "";
  return Response.json(
    {
      consumerId,
      creatorInvitationsEnabled: settings.creatorInvitationsEnabled,
      creatorApplicationFields,
      application: application
        ? {
            ...application,
            brandName: application.brandName || creator?.brandName || "",
            intro: application.intro || creator?.intro || "",
            province: application.province || creator?.province || "",
            city: application.city || creator?.city || "",
            district: application.district || creator?.district || "",
            tagIds: application.tagIds.length
              ? application.tagIds
              : (creator?.tags || [])
                  .filter((tag) => creatorApplicationTagCategories.includes(tag.category as (typeof creatorApplicationTagCategories)[number]))
                  .map((tag) => tag.id),
            opportunityTypes: application.opportunityTypes.length ? application.opportunityTypes : creator?.opportunityTypes || [],
            busyPeriods: application.busyPeriods.length
              ? application.busyPeriods
              : (creator?.busyPeriods || []).map((period) => ({ startDate: period.startDate, endDate: period.endDate, note: period.note })),
            noBookings: application.noBookings || Boolean(creator?.noBookings),
            representativeImageKey,
            representativeImageUrl: representativeImageKey ? assetUrl(representativeImageKey) : creator?.workUrls[0] || "",
            logoImageKey,
            logoImageUrl: logoImageKey ? assetUrl(logoImageKey) : "",
          }
        : null,
    },
    { headers: { "cache-control": "no-store" } },
  );
}

export async function POST(request: Request) {
  try {
    const denied = requireMiniActor(request, "consumer");
    if (denied) return denied;
    const consumerId = miniPrincipalFromRequest(request)!.actorId;
    const data = await request.json();
    const existingApplication = getConsumerCreatorApplication(consumerId);
    const existingRoles = getMiniAccountRoles(consumerId);
    if (existingRoles.creatorId && !existingApplication)
      throw new Error("当前微信账户已经绑定新遇官档案");
    if (existingApplication?.status === "active")
      throw new Error("新遇官申请已经通过，请在“我的”中修改资料");

    const manualPhone = normalizePhone(String(data.phone || ""));
    const phone = manualPhone || normalizePhone(await exchangeWechatPhoneCode(String(data.phoneCode || ""), String(data.mockPhone || "")));
    const confirmPhone = normalizePhone(String(data.confirmPhone || phone));
    const limited = rateLimit(request, "mini-creator-register", 8, 60 * 60000, String(consumerId));
    if (limited) return limited;
    if (!validPhone(phone)) throw new Error("手机号格式不正确");
    if (phone !== confirmPhone) throw new Error("两次输入的手机号不一致");
    if (existingApplication && phone !== existingApplication.phone)
      throw new Error("已提交申请的手机号不能修改");
    if (data.agreed !== true) throw new Error("请先同意用户协议和隐私政策");

    const miniSettings = getMiniProgramSettings();
    const inviteCode = miniSettings.creatorInvitationsEnabled
      ? String(data.inviteCode || existingApplication?.inviteCode || "").trim().toUpperCase()
      : existingApplication?.inviteCode || "";
    if (miniSettings.creatorInvitationsEnabled && existingApplication && inviteCode !== existingApplication.inviteCode)
      throw new Error("已提交申请的邀请码不能修改");
    const brandName = String(data.brandName || "").trim();
    const creatorApplicationFields = miniSettings.creatorApplicationFields;
    const intro = creatorApplicationFields.intro.enabled
      ? String(data.intro ?? existingApplication?.intro ?? "").trim()
      : existingApplication?.intro || "";
    const province = String(data.province || "").trim();
    const city = String(data.city || "").trim();
    const district = String(data.district || "").trim();
    if (!brandName) throw new Error("请填写品牌或工作室名称");
    if (creatorApplicationFields.intro.enabled && creatorApplicationFields.intro.required && !intro)
      throw new Error(`请填写${creatorApplicationFields.intro.label}`);
    if (!province || !city || !district) throw new Error("请选择完整的省、市、区");
    if (!isValidLocation(province, city, district)) throw new Error("请选择有效的省、市、区");

    const tagIds: number[] = Array.isArray(data.tagIds)
      ? [...new Set<number>(data.tagIds.map(Number).filter((value: number) => Number.isInteger(value)))]
      : [];
    const customInput = creatorApplicationFields.customTags.enabled && Array.isArray(data.customTags)
      ? data.customTags as CustomTagInput[]
      : existingApplication?.customTags || [];
    if (customInput.length > 48) throw new Error("新增标签数量过多");
    let customTags = customInput.map((custom) => ({
      label: String(custom.label || "").trim(),
      category: String(custom.category || "").trim(),
    }));
    const opportunityTypes = creatorApplicationFields.offlineExperience.enabled && Array.isArray(data.opportunityTypes)
      ? [...new Set<string>(data.opportunityTypes.map((item: unknown) => String(item).trim()).filter(Boolean))]
      : existingApplication?.opportunityTypes || [];
    if (opportunityTypes.some((item) => !offlineExperienceTypes.includes(item as (typeof offlineExperienceTypes)[number])))
      throw new Error("线下体验类型不正确");
    if (creatorApplicationFields.offlineExperience.enabled && creatorApplicationFields.offlineExperience.required && !opportunityTypes.length)
      throw new Error(`请选择${creatorApplicationFields.offlineExperience.label}`);
    if (!tagIds.length && !customTags.length) throw new Error("请至少选择一个新遇官标签");
    const selectedTags = tagIds.length
      ? all<{ id: number; category: string; label: string }>(
          `SELECT id, category, label FROM tags WHERE id IN (${tagIds.map(() => "?").join(",")}) AND status = 'active'`,
          ...tagIds,
        )
      : [];
    if (
      selectedTags.length !== tagIds.length ||
      selectedTags.some((tag) => !creatorApplicationTagCategories.includes(tag.category as (typeof creatorApplicationTagCategories)[number]))
    )
      throw new Error("新遇官标签中包含不可用标签");
    const customKeys = new Set<string>();
    customTags = customTags.filter((custom) => {
      const key = `${custom.category}\u0000${custom.label}`;
      if (customKeys.has(key) || selectedTags.some((tag) => tag.category === custom.category && tag.label === custom.label)) return false;
      customKeys.add(key);
      return true;
    });
    const counts = new Map<string, number>();
    for (const tag of selectedTags) {
      const count = (counts.get(tag.category) || 0) + 1;
      if (count > 8) throw new Error(`“${tag.category}”最多选择8个标签`);
      counts.set(tag.category, count);
    }
    for (const custom of customTags) {
      if (!creatorApplicationTagCategories.includes(custom.category as (typeof creatorApplicationTagCategories)[number]))
        throw new Error("新增标签分类不正确");
      if (!custom.label || Array.from(custom.label).length > 7) throw new Error("新增标签最多7个字");
      const count = (counts.get(custom.category) || 0) + 1;
      if (count > 8) throw new Error(`“${custom.category}”最多选择8个标签`);
      counts.set(custom.category, count);
    }
    const noBookings = creatorApplicationFields.busyPeriods.enabled
      ? data.noBookings === true
      : existingApplication?.noBookings || false;
    const submittedBusyPeriods = creatorApplicationFields.busyPeriods.enabled
      ? normalizeBusyPeriods(data.busyPeriods)
      : existingApplication?.busyPeriods || [];
    if (noBookings && submittedBusyPeriods.length)
      throw new Error("活动日期与近期无其他活动安排不能同时选择");
    const busyPeriods = noBookings ? [] : submittedBusyPeriods;
    if (creatorApplicationFields.busyPeriods.enabled && creatorApplicationFields.busyPeriods.required && !noBookings && !busyPeriods.length)
      throw new Error(`请填写${creatorApplicationFields.busyPeriods.label}，或选择近期无其他活动安排`);

    const existingCreator = existingApplication ? getCreator(existingApplication.creatorId) : null;
    const existingImageKey = existingApplication?.representativeImageKey || objectKey(existingCreator?.workUrls[0] || "");
    const representativeImageKey = String(data.representativeImageKey || existingImageKey || "").trim();
    if (!representativeImageKey) throw new Error("请上传申请代表图");
    if (representativeImageKey !== existingImageKey && !representativeImageKey.startsWith(`creator-applications/${consumerId}/representative-`))
      throw new Error("申请代表图归属不正确，请重新上传");
    if (!(await getObject(representativeImageKey))) throw new Error("申请代表图已失效，请重新上传");
    const existingLogoImageKey = existingApplication?.logoImageKey || "";
    const logoImageKey = String(data.logoImageKey || existingLogoImageKey || "").trim();
    if (logoImageKey && logoImageKey !== existingLogoImageKey && !logoImageKey.startsWith(`creator-applications/${consumerId}/logo-`))
      throw new Error("Logo图片归属不正确，请重新上传");
    if (logoImageKey && !(await getObject(logoImageKey))) throw new Error("Logo图片已失效，请重新上传");

    // 图文内容安全筛查（黄赌毒等违规内容检测）
    const textToCheck = [brandName, intro, ...customTags.map((tag) => tag.label)].filter(Boolean).join(" ");
    if (textToCheck && !(await checkTextContent(textToCheck)))
      throw new Error("提交的文字内容包含违规信息，请修改后重新提交");
    const repImage = await getObject(representativeImageKey);
    if (repImage && !(await checkImageContent(repImage.body, repImage.contentType)))
      throw new Error("申请代表图包含违规内容，请更换图片后重新提交");
    if (logoImageKey) {
      const logoImage = await getObject(logoImageKey);
      if (logoImage && !(await checkImageContent(logoImage.body, logoImage.contentType)))
        throw new Error("Logo图片包含违规内容，请更换图片后重新提交");
    }

    const result = transaction(() => {
      const creatorId = existingApplication
        ? existingApplication.creatorId
        : registerWechatCreator(
            phone,
            inviteCode,
            province,
            city,
            ["opportunity"],
            opportunityTypes,
            opportunityTypes.length > 0,
            miniSettings.creatorInvitationsEnabled,
          );
      updateProfile(creatorId, {
        brandName,
        intro,
        province,
        city,
        district,
        serviceIntents: ["opportunity"],
        opportunityTypes,
        opportunityOptIn: opportunityTypes.length > 0,
      });
      updateManagedCreatorDetails(
        creatorId,
        { tagIds, busyPeriods, noBookings, opportunityTypes, opportunityOptIn: opportunityTypes.length > 0 },
        "新遇官本人",
      );
      for (const custom of customTags) claimTag(creatorId, { customLabel: custom.label, category: custom.category });
      attachUpload(creatorId, "work", representativeImageKey);
      bindMiniCreator(consumerId, creatorId, "pending");
      const application = submitCreatorApplicationSnapshot({
        creatorId,
        consumerId,
        inviteCode,
        phone,
        brandName,
        intro,
        province,
        city,
        district,
        representativeImageKey,
        logoImageKey,
        slogan: "",
        productImageKey: "",
        boothImageKey: "",
        historyImageKey: "",
        tagIds,
        customTags,
        opportunityTypes,
        busyPeriods,
        noBookings,
        phonePublicAuthorized: true,
      });
      return { creatorId, application };
    });
    if (existingImageKey && existingImageKey !== representativeImageKey)
      await deleteObject(existingImageKey).catch(() => undefined);
    if (existingLogoImageKey && existingLogoImageKey !== logoImageKey)
      await deleteObject(existingLogoImageKey).catch(() => undefined);

    const reviewThread = ensureReviewThread({
      entityType: "creator_application",
      entityId: result.application.id,
      creatorId: result.creatorId,
      subject: `新遇官申请审核｜${brandName}`,
    });
    addCreatorReviewSubmission(
      reviewThread.id,
      result.creatorId,
      existingApplication ? "我已补充申请资料并重新提交，请审核。" : "我已提交TDE新遇官申请，请审核。",
    );

    return Response.json(
      {
        session: createMiniSession("creator", result.creatorId),
        applicationStatus: result.application.status,
        home: getMiniCreatorHome(result.creatorId),
      },
      { status: existingApplication ? 200 : 201, headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}
