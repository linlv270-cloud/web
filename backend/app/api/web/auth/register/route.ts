import { creatorApplicationTagCategories, offlineExperienceTypes } from "../../../../../lib/catalog";
import { all, run, transaction } from "../../../../../lib/database";
import { apiError } from "../../../../../lib/http";
import { isValidLocation } from "../../../../../lib/locations";
import { createMiniSession, submitCreatorApplicationSnapshot } from "../../../../../lib/mini-auth";
import { getMiniProgramSettings } from "../../../../../lib/mini-program";
import {
  attachUpload,
  claimTag,
  getCreator,
  registerCreator,
  updateManagedCreatorDetails,
  updateProfile,
} from "../../../../../lib/repository";
import { normalizePhone, rateLimit, validPhone } from "../../../../../lib/security";
import { getObject, assetUrl } from "../../../../../lib/storage";
import { addCreatorReviewSubmission, ensureReviewThread } from "../../../../../lib/review-workflow";

type CustomTagInput = { label?: unknown; category?: unknown };
type BusyPeriodInput = { startDate?: unknown; endDate?: unknown; note?: unknown };

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

export async function POST(request: Request) {
  try {
    const data = await request.json();
    const limited = rateLimit(request, "web-register", 5, 60 * 60000, request.headers.get("x-forwarded-for") || "");
    if (limited) return limited;

    const phone = normalizePhone(String(data.phone || ""));
    const confirmPhone = normalizePhone(String(data.confirmPhone || ""));
    const password = String(data.password || "");
    const confirmPassword = String(data.confirmPassword || "");

    if (!validPhone(phone)) throw new Error("手机号格式不正确");
    if (phone !== confirmPhone) throw new Error("两次输入的手机号不一致");
    if (password.length < 8 || password.length > 72) throw new Error("密码需要为 8 至 72 个字符");
    if (password !== confirmPassword) throw new Error("两次输入的密码不一致");
    if (data.agreed !== true) throw new Error("请先同意用户协议和隐私政策");

    const miniSettings = getMiniProgramSettings();
    const inviteCode = String(data.inviteCode || "").trim().toUpperCase();
    const brandName = String(data.brandName || "").trim();
    const slogan = String(data.slogan || "").trim().slice(0, 7);
    const intro = String(data.intro || "").trim().slice(0, 2000);
    const province = String(data.province || "").trim();
    const city = String(data.city || "").trim();
    const district = String(data.district || "").trim();

    if (!brandName) throw new Error("请填写品牌或工作室名称");
    if (!province || !city || !district) throw new Error("请选择完整的省、市、区");
    if (!isValidLocation(province, city, district)) throw new Error("请选择有效的省、市、区");

    const tagIds: number[] = Array.isArray(data.tagIds)
      ? [...new Set<number>(data.tagIds.map(Number).filter((value: number) => Number.isInteger(value)))]
      : [];
    const customInput = Array.isArray(data.customTags) ? data.customTags as CustomTagInput[] : [];
    if (customInput.length > 48) throw new Error("新增标签数量过多");
    let customTags = customInput.map((custom) => ({
      label: String(custom.label || "").trim(),
      category: String(custom.category || "").trim(),
    }));
    const opportunityTypes = Array.isArray(data.opportunityTypes)
      ? [...new Set<string>(data.opportunityTypes.map((item: unknown) => String(item).trim()).filter(Boolean))]
      : [];
    if (opportunityTypes.some((item) => !offlineExperienceTypes.includes(item as (typeof offlineExperienceTypes)[number])))
      throw new Error("线下体验类型不正确");
    if (!tagIds.length && !customTags.length) throw new Error("请至少选择一个标签");

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
      throw new Error("标签中包含不可用标签");

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
      if (count > 8) throw new Error(`"${tag.category}"最多选择8个标签`);
      counts.set(tag.category, count);
    }
    for (const custom of customTags) {
      if (!creatorApplicationTagCategories.includes(custom.category as (typeof creatorApplicationTagCategories)[number]))
        throw new Error("新增标签分类不正确");
      if (!custom.label || Array.from(custom.label).length > 7) throw new Error("新增标签最多7个字");
      const count = (counts.get(custom.category) || 0) + 1;
      if (count > 8) throw new Error(`"${custom.category}"最多选择8个标签`);
      counts.set(custom.category, count);
    }

    const noBookings = data.noBookings === true;
    const submittedBusyPeriods = normalizeBusyPeriods(data.busyPeriods);
    if (noBookings && submittedBusyPeriods.length)
      throw new Error("活动日期与近期无其他活动安排不能同时选择");
    const busyPeriods = noBookings ? [] : submittedBusyPeriods;

    // 图片验证
    const representativeImageKey = String(data.representativeImageKey || "").trim();
    if (!representativeImageKey) throw new Error("请上传品牌形象图");
    if (!(await getObject(representativeImageKey))) throw new Error("品牌形象图已失效，请重新上传");
    const logoImageKey = String(data.logoImageKey || "").trim();
    if (logoImageKey && !(await getObject(logoImageKey))) throw new Error("Logo图片已失效，请重新上传");
    const productImageKey = String(data.productImageKey || "").trim();
    if (productImageKey && !(await getObject(productImageKey))) throw new Error("产品图已失效，请重新上传");
    const boothImageKey = String(data.boothImageKey || "").trim();
    if (boothImageKey && !(await getObject(boothImageKey))) throw new Error("摊位陈列图已失效，请重新上传");
    const historyImageKey = String(data.historyImageKey || "").trim();
    if (historyImageKey && !(await getObject(historyImageKey))) throw new Error("历史照片已失效，请重新上传");

    const result = transaction(() => {
      // 注册创作者账号（邀请码可选）
      const creatorId = registerCreator(
        phone,
        password,
        inviteCode,
        true, // phoneVerified
        province,
        city,
        "", // wechat
        ["opportunity"],
        opportunityTypes,
        opportunityTypes.length > 0,
        true, // invitationRequired = true，邀请码必填
      );
      updateProfile(creatorId, {
        brandName,
        intro,
        province,
        city,
        district,
        slogan,
        serviceIntents: ["opportunity"],
        opportunityTypes,
        opportunityOptIn: opportunityTypes.length > 0,
      });
      updateManagedCreatorDetails(
        creatorId,
        { tagIds, busyPeriods, noBookings, opportunityTypes, opportunityOptIn: opportunityTypes.length > 0 },
        "TDE本人",
      );
      for (const custom of customTags) claimTag(creatorId, { customLabel: custom.label, category: custom.category });
      if (representativeImageKey) attachUpload(creatorId, "work", representativeImageKey);
      if (productImageKey) attachUpload(creatorId, "work", productImageKey);
      if (boothImageKey) attachUpload(creatorId, "work", boothImageKey);
      if (historyImageKey) attachUpload(creatorId, "work", historyImageKey);

      // 创建关联的 consumer_account（网页版用手机号作为openid）
      const consumerResult = run(
        `INSERT OR IGNORE INTO consumer_accounts(openid, phone, province, city, district) VALUES (?, ?, ?, ?, ?)`,
        `web_${phone}`, phone, province, city, district,
      );
      const consumerRow = all<{ id: number }>("SELECT id FROM consumer_accounts WHERE openid = ?", `web_${phone}`);
      const consumerId = consumerRow[0]?.id || creatorId;

      // 创建申请记录
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
        slogan,
        productImageKey,
        boothImageKey,
        historyImageKey,
        tagIds,
        customTags,
        opportunityTypes,
        busyPeriods,
        noBookings,
        phonePublicAuthorized: true,
      });
      return { creatorId, application };
    });

    const reviewThread = ensureReviewThread({
      entityType: "creator_application",
      entityId: result.application.id,
      creatorId: result.creatorId,
      subject: `TDE出展申请审核｜${brandName}`,
    });
    addCreatorReviewSubmission(
      reviewThread.id,
      result.creatorId,
      "我已提交TheDesignExpo出展申请，请审核。",
    );

    const session = createMiniSession("creator", result.creatorId);
    const creator = getCreator(result.creatorId);

    return Response.json(
      {
        session,
        creator: {
          id: creator?.id,
          phone: creator?.phone,
          brandName: creator?.brandName,
          slogan: creator?.slogan,
          intro: creator?.intro,
          province: creator?.province,
          city: creator?.city,
          district: creator?.district,
          logoImageUrl: result.application.logoImageKey ? assetUrl(result.application.logoImageKey) : "",
        },
        applicationStatus: result.application.status,
      },
      { status: 201, headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}
