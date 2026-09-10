import { creatorApplicationTagCategories, offlineExperienceTypes } from "../../../../lib/catalog";
import { all, one, run, transaction } from "../../../../lib/database";
import { apiError } from "../../../../lib/http";
import { getCreatorApplication, miniPrincipalFromRequest, submitCreatorApplicationSnapshot } from "../../../../lib/mini-auth";
import {
  claimTag,
  getCreator,
  getPlatformSettings,
  removeTag,
  updateManagedCreatorDetails,
  updateCreatorImages,
  updateProfile,
} from "../../../../lib/repository";
import { assetUrl, getObject } from "../../../../lib/storage";
import { ensureReviewThread, addCreatorReviewSubmission } from "../../../../lib/review-workflow";
import { creatorSectionUpdates, legalConsentsForCreator, markCreatorSection } from "../../../../lib/legal";
import { isValidLocation } from "../../../../lib/locations";

function requireCreator(request: Request) {
  const principal = miniPrincipalFromRequest(request);
  if (!principal || principal.actorType !== "creator")
    return Response.json({ error: "请先登录" }, { status: 401, headers: { "cache-control": "no-store" } });
  return null;
}

function preferenceFor(creatorId: number) {
  const row = one<{ unavailable_dates: string }>("SELECT unavailable_dates FROM creator_preferences WHERE creator_id = ?", creatorId);
  let unavailableDates: unknown[] = [];
  try { unavailableDates = row ? JSON.parse(row.unavailable_dates || "[]") : []; } catch { unavailableDates = []; }
  return { unavailableDates: Array.isArray(unavailableDates) ? unavailableDates : [] };
}

function parseStringList(value: string | null | undefined) {
  try {
    const parsed: unknown = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function normalizeAction(action: string, data: Record<string, unknown>) {
  const legacyMap: Record<string, string> = {
    saveProfile: "updateProfile",
    saveBrand: "updateProfile",
    updateBrand: "updateProfile",
    saveLocation: "updateLocation",
    saveImages: "updateImages",
    saveTags: "updateTags",
    saveSchedule: "updateSchedule",
    saveAccount: "updateLocation",
    submitProfile: "submitApplication",
    submitReview: "submitApplication",
    markAllRead: "readInbox",
  };
  if (legacyMap[action]) return legacyMap[action];
  if (action.startsWith("confirm") && action !== "confirmSection") {
    if (!data.section) {
      const raw = action.slice("confirm".length);
      const section = raw ? raw.charAt(0).toLowerCase() + raw.slice(1) : "";
      if (["brand", "images", "tags", "schedule", "account"].includes(section)) data.section = section;
    }
    return "confirmSection";
  }
  return action;
}

export async function GET(request: Request) {
  const denied = requireCreator(request);
  if (denied) return denied;
  const creatorId = miniPrincipalFromRequest(request)!.actorId;

  const creator = getCreator(creatorId);
  const application = getCreatorApplication(creatorId);
  const preference = one<{
    unavailable_dates: string;
    weekly_off: string;
    excluded_venue_tags: string;
    footfall_threshold: number;
    excluded_audience_tags: string;
    updated_at: string;
  }>("SELECT unavailable_dates, weekly_off, excluded_venue_tags, footfall_threshold, excluded_audience_tags, updated_at FROM creator_preferences WHERE creator_id = ?", creatorId);
  const busyPeriods = all<{ id: number; start_date: string; end_date: string; note: string }>(
    "SELECT id, start_date, end_date, note FROM busy_periods WHERE creator_id = ? ORDER BY start_date",
    creatorId,
  );
  const inbox = all<{ id: number; subject: string; body: string; href: string; read_at: string | null; created_at: string }>(
    "SELECT id, subject, body, href, read_at, created_at FROM inbox_messages WHERE recipient_id = ? ORDER BY created_at DESC LIMIT 50",
    creatorId,
  );
  const unreadCount = Number(
    (one<{ count: number }>("SELECT COUNT(*) as count FROM inbox_messages WHERE recipient_id = ? AND read_at IS NULL", creatorId)?.count) || 0,
  );
  const settings = getPlatformSettings();
  const inviteSharingText = settings.inviteSharing.description.replace(/奇灯/g, "TDE");

  return Response.json(
    {
      inviteSharingText,
      creator: creator
        ? {
            id: creator.id,
            phone: creator.phone,
            registeredWithCode: creator.registeredWithCode,
            inviteCode: creator.inviteCode,
            brandName: creator.brandName,
            slogan: creator.slogan,
            intro: creator.intro,
            province: creator.province,
            city: creator.city,
            district: creator.district,
            logoKey: creator.logoKey,
            logoUrl: creator.logoKey ? assetUrl(creator.logoKey) : "",
            logoImageKey: creator.logoKey || "",
            logoImageUrl: creator.logoKey ? assetUrl(creator.logoKey) : "",
            representativeImageKey: creator.representativeImageKey || "",
            representativeImageUrl: creator.representativeImageUrl || "",
            workUrls: creator.workUrls,
            productImageKey: creator.productImageKey,
            productImageUrl: creator.productImageKey ? assetUrl(creator.productImageKey) : "",
            boothImageKey: creator.boothImageKey,
            boothImageUrl: creator.boothImageKey ? assetUrl(creator.boothImageKey) : "",
            historyImageKey: creator.historyImageKey,
            historyImageUrl: creator.historyImageKey ? assetUrl(creator.historyImageKey) : "",
            noBookings: creator.noBookings,
            opportunityTypes: creator.opportunityTypes,
            precisionInviteGoals: creator.precisionInviteGoals,
            precisionInviteScenes: creator.precisionInviteScenes,
            xiaohongshuFollowers: creator.xiaohongshuFollowers,
            xiaohongshuUrl: creator.xiaohongshuUrl,
            douyinFollowers: creator.douyinFollowers,
            douyinUrl: creator.douyinUrl,
            tags: creator.tags.filter((t) => creatorApplicationTagCategories.includes(t.category as any)),
            updatedAt: creator.updatedAt,
          }
        : null,
      application: application
        ? {
            id: application.id,
            status: application.status,
            brandName: application.brandName,
            slogan: application.slogan,
            intro: application.intro,
            province: application.province,
            city: application.city,
            district: application.district,
            representativeImageKey: application.representativeImageKey,
            representativeImageUrl: application.representativeImageKey ? assetUrl(application.representativeImageKey) : "",
            logoImageKey: application.logoImageKey,
            logoImageUrl: application.logoImageKey ? assetUrl(application.logoImageKey) : "",
            productImageKey: application.productImageKey,
            productImageUrl: application.productImageKey ? assetUrl(application.productImageKey) : "",
            boothImageKey: application.boothImageKey,
            boothImageUrl: application.boothImageKey ? assetUrl(application.boothImageKey) : "",
            historyImageKey: application.historyImageKey,
            historyImageUrl: application.historyImageKey ? assetUrl(application.historyImageKey) : "",
            tagIds: application.tagIds,
            customTags: application.customTags,
            opportunityTypes: application.opportunityTypes,
            busyPeriods: application.busyPeriods,
            noBookings: application.noBookings,
            reviewNote: application.reviewNote,
            submittedAt: application.submittedAt,
          }
        : null,
      busyPeriods: busyPeriods.map((p) => ({ id: p.id, startDate: p.start_date, endDate: p.end_date, note: p.note })),
      preferences: preference
        ? {
            unavailableDates: parseStringList(preference.unavailable_dates),
            weeklyOff: parseStringList(preference.weekly_off),
            excludedVenueTags: parseStringList(preference.excluded_venue_tags),
            footfallThreshold: preference.footfall_threshold || 0,
            excludedAudienceTags: parseStringList(preference.excluded_audience_tags),
            saved: true,
            updatedAt: preference.updated_at,
          }
        : { unavailableDates: [], weeklyOff: [], excludedVenueTags: [], footfallThreshold: 0, excludedAudienceTags: [], saved: false, updatedAt: null },
      inbox,
      unreadCount,
      sectionUpdatedAt: creatorSectionUpdates(creatorId),
      legalConsents: legalConsentsForCreator(creatorId),
    },
    { headers: { "cache-control": "no-store" } },
  );
}

export async function POST(request: Request) {
  try {
    const denied = requireCreator(request);
    if (denied) return denied;
    const creatorId = miniPrincipalFromRequest(request)!.actorId;
    const rawData: unknown = await request.json();
    if (!rawData || typeof rawData !== "object" || Array.isArray(rawData))
      throw new Error("请求格式不正确");
    const data = rawData as Record<string, unknown>;
    const action = normalizeAction(String(data.action || ""), data);

    if (action === "updateProfile") {
      const brandName = String(data.brandName || "").trim();
      const slogan = String(data.slogan || "").trim().slice(0, 7);
      const intro = String(data.intro || "").trim().slice(0, 2000);
      if (!brandName) throw new Error("请填写品牌名称");
      updateProfile(creatorId, { brandName, slogan, intro });
      markCreatorSection(creatorId, "brand");
      return Response.json({ success: true });
    }

    if (action === "updateLocation") {
      const province = String(data.province || "").trim();
      const city = String(data.city || "").trim();
      const district = String(data.district || "").trim();
      if (!province || !city || !district || !isValidLocation(province, city, district))
        throw new Error("请选择有效的省、市、区");
      updateProfile(creatorId, { province, city, district });
      markCreatorSection(creatorId, "account");
      return Response.json({ success: true });
    }

    if (action === "updateImages") {
      const keys = ["representativeImageKey", "logoImageKey", "productImageKey", "boothImageKey", "historyImageKey"] as const;
      const input = Object.fromEntries(keys.filter((key) => data[key] !== undefined).map((key) => [key, String(data[key] || "").trim()])) as Record<string, string>;
      for (const key of Object.values(input).filter(Boolean)) {
        if (!key.startsWith(`web-creators/${creatorId}/`)) throw new Error("不能使用其他账号上传的图片");
        if (!(await getObject(key))) throw new Error("图片已失效，请重新上传");
      }
      updateCreatorImages(creatorId, input);
      markCreatorSection(creatorId, "images");
      return Response.json({ success: true });
    }

    if (action === "updateOpportunityTypes") {
      const opportunityTypes = Array.isArray(data.opportunityTypes)
        ? [...new Set<string>(data.opportunityTypes.map((item: unknown) => String(item).trim()).filter(Boolean))]
        : [];
      if (opportunityTypes.some((item) => !offlineExperienceTypes.includes(item as (typeof offlineExperienceTypes)[number])))
        throw new Error("线下体验类型不正确");
      updateProfile(creatorId, {
        opportunityTypes,
        opportunityOptIn: opportunityTypes.length > 0,
        serviceIntents: ["writer", "opportunity"],
      });
      markCreatorSection(creatorId, "tags");
      return Response.json({ success: true });
    }

    if (action === "updatePrecisionInvite") {
      updateProfile(creatorId, {
        precisionInviteGoals: data.precisionInviteGoals,
        precisionInviteScenes: data.precisionInviteScenes,
      });
      markCreatorSection(creatorId, "tags");
      return Response.json({ success: true, creator: getCreator(creatorId) });
    }

    if (action === "updateTags") {
      const tagIds = Array.isArray(data.tagIds)
        ? [...new Set(data.tagIds.map(Number).filter((value: number) => Number.isInteger(value) && value > 0))]
        : [];
      const opportunityTypes = Array.isArray(data.opportunityTypes)
        ? [...new Set<string>(data.opportunityTypes.map((item: unknown) => String(item).trim()).filter(Boolean))]
        : [];
      if (opportunityTypes.some((item) => !offlineExperienceTypes.includes(item as (typeof offlineExperienceTypes)[number])))
        throw new Error("线下体验类型不正确");

      const selected = tagIds.length
        ? all<{ id: number; category: string; status: string }>(
            `SELECT id, category, status FROM tags WHERE id IN (${tagIds.map(() => "?").join(",")})`,
            ...tagIds,
          )
        : [];
      if (selected.length !== tagIds.length || selected.some((tag) => tag.status !== "active" || !creatorApplicationTagCategories.includes(tag.category as any)))
        throw new Error("包含不可用标签");

      const categoryCounts = new Map<string, number>();
      for (const tag of selected) {
        const count = (categoryCounts.get(tag.category) || 0) + 1;
        if (count > 8) throw new Error(`“${tag.category}”最多选择8个标签`);
        categoryCounts.set(tag.category, count);
      }

      const customTags = Array.isArray(data.customTags) ? data.customTags.slice(0, 40) : [];
      const structuredFields = ["precisionInviteGoals", "precisionInviteScenes", "xiaohongshuFollowers", "xiaohongshuUrl", "douyinFollowers", "douyinUrl"];
      const profileInput: Record<string, unknown> = {
        opportunityTypes,
        opportunityOptIn: opportunityTypes.length > 0,
        serviceIntents: ["writer", "opportunity"],
      };
      for (const field of structuredFields) {
        if (Object.prototype.hasOwnProperty.call(data, field)) profileInput[field] = data[field];
      }
      transaction(() => {
        run("DELETE FROM creator_tags WHERE creator_id = ? AND tag_id IN (SELECT id FROM tags WHERE status = 'active')", creatorId);
        for (const tag of selected) {
          run("INSERT INTO creator_tags(creator_id, tag_id, source) VALUES (?, ?, 'creator')", creatorId, tag.id);
        }
        updateProfile(creatorId, profileInput);
        for (const item of customTags) {
          if (!item || typeof item !== "object") continue;
          const custom = item as { category?: unknown; label?: unknown };
          const label = String(custom.label || "").trim();
          const category = String(custom.category || "").trim();
          if (label) claimTag(creatorId, { category, customLabel: label });
        }
      });
      markCreatorSection(creatorId, "tags");
      return Response.json({ success: true, creator: getCreator(creatorId) });
    }

    if (action === "submitApplication") {
      const creator = getCreator(creatorId);
      if (!creator) throw new Error("用户不存在");
      if (!creator.brandName) throw new Error("请先填写品牌名称");
      if (!creator.province || !creator.city || !creator.district) throw new Error("请先完善所在地区");
      const representativeImageKey = one<{ work_keys: string }>("SELECT work_keys FROM creators WHERE id = ?", creatorId);
      const workKeys = representativeImageKey ? JSON.parse(representativeImageKey.work_keys || "[]") : [];
      if (!workKeys[0]) throw new Error("请先上传品牌形象图");
      if (!creator.tags.length) throw new Error("请至少选择一个标签");
      if (!one("SELECT id FROM creator_preferences WHERE creator_id = ?", creatorId))
        throw new Error("请先在首页保存档期与邀约意愿");
      const customTags = creator.tags
        .filter((tag) => tag.status === "pending")
        .map((tag) => ({ category: tag.category, label: tag.label }));
      const busy = creator.noBookings ? [] : (creator.busyPeriods || []).map((item) => ({ startDate: item.startDate, endDate: item.endDate, note: item.note || "已有活动" }));
      const unavailable = preferenceFor(creatorId);
      for (const date of unavailable.unavailableDates) {
        const normalized = String(date).replace(/^(\d{4})-(\d{1,2})-(\d{1,2})$/, (_, y, m, d) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
        if (/^\d{4}-\d{2}-\d{2}$/.test(normalized) && !busy.some((item) => item.startDate === normalized && item.endDate === normalized)) {
          busy.push({ startDate: normalized, endDate: normalized, note: "首页已标记不可约" });
        }
      }
      const consumer = one<{ id: number }>("SELECT id FROM consumer_accounts WHERE openid = ?", `web_${creator.phone}`);
      if (!consumer) throw new Error("账号资料尚未初始化，请重新登录");
      const snapshot = submitCreatorApplicationSnapshot({
        creatorId,
        consumerId: consumer.id,
        inviteCode: creator.registeredWithCode,
        phone: creator.phone || "",
        brandName: creator.brandName,
        intro: creator.intro,
        province: creator.province,
        city: creator.city,
        district: creator.district,
        representativeImageKey: workKeys[0],
        logoImageKey: creator.logoKey || "",
        slogan: creator.slogan,
        productImageKey: creator.productImageKey || "",
        boothImageKey: creator.boothImageKey || "",
        historyImageKey: creator.historyImageKey || "",
        tagIds: creator.tags.filter((tag) => tag.status === "active").map((tag) => tag.id),
        customTags,
        opportunityTypes: creator.opportunityTypes,
        busyPeriods: busy,
        noBookings: busy.length === 0,
        phonePublicAuthorized: false,
      });
      const thread = ensureReviewThread({ entityType: "creator_application", entityId: snapshot.id, creatorId, subject: `TDE出展申请审核｜${creator.brandName}` });
      addCreatorReviewSubmission(thread.id, creatorId, "我已提交TheDesignExpo出展申请，请审核。");
      return Response.json({ success: true, applicationStatus: snapshot.status });
    }

    if (action === "updateSchedule") {
      const noBookings = data.noBookings === true;
      const busyPeriods = Array.isArray(data.busyPeriods) ? data.busyPeriods : [];
      if (noBookings && busyPeriods.length) throw new Error("不能同时选择");
      transaction(() => {
        run("DELETE FROM busy_periods WHERE creator_id = ?", creatorId);
        if (!noBookings) {
          for (const p of busyPeriods) {
            run(
              "INSERT INTO busy_periods(creator_id, start_date, end_date, note) VALUES (?, ?, ?, ?)",
              creatorId, String(p.startDate), String(p.endDate || p.startDate), String(p.note || "已有活动").slice(0, 20),
            );
          }
        }
        run("UPDATE creators SET no_bookings = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", noBookings ? 1 : 0, creatorId);
      });
      markCreatorSection(creatorId, "schedule");
      return Response.json({ success: true });
    }

    if (action === "addTag") {
      const tagId = Number(data.tagId);
      if (!tagId) throw new Error("标签ID无效");
      const tag = one<{ id: number; category: string; status: string }>("SELECT id, category, status FROM tags WHERE id = ?", tagId);
      if (!tag || tag.status !== "active") throw new Error("标签不可用");
      const count = Number(
        (one<{ count: number }>(
          `SELECT COUNT(*) as count FROM creator_tags ct JOIN tags t ON t.id = ct.tag_id WHERE ct.creator_id = ? AND t.category = ?`,
          creatorId, tag.category,
        )?.count) || 0,
      );
      if (count >= 8) throw new Error("该分类最多8个标签");
      run("INSERT OR IGNORE INTO creator_tags(creator_id, tag_id, source) VALUES (?, ?, 'creator')", creatorId, tagId);
      markCreatorSection(creatorId, "tags");
      return Response.json({ success: true });
    }

    if (action === "removeTag") {
      const tagId = Number(data.tagId);
      removeTag(creatorId, tagId);
      markCreatorSection(creatorId, "tags");
      return Response.json({ success: true });
    }

    if (action === "addCustomTag") {
      const label = String(data.label || "").trim();
      const category = String(data.category || "").trim();
      if (!label || Array.from(label).length > 7) throw new Error("标签最多7个字");
      if (!creatorApplicationTagCategories.includes(category as any)) throw new Error("分类不正确");
      claimTag(creatorId, { customLabel: label, category });
      markCreatorSection(creatorId, "tags");
      return Response.json({ success: true });
    }

    if (action === "confirmSection") {
      const section = String(data.section || "");
      if (!["brand", "images", "tags", "schedule", "account"].includes(section))
        throw new Error("资料板块无效");
      markCreatorSection(creatorId, section);
      return Response.json({ success: true });
    }

    if (action === "readInbox") {
      const id = Number(data.id);
      if (id) {
        run("UPDATE inbox_messages SET read_at = CURRENT_TIMESTAMP WHERE id = ? AND recipient_id = ?", id, creatorId);
      } else {
        run("UPDATE inbox_messages SET read_at = CURRENT_TIMESTAMP WHERE recipient_id = ? AND read_at IS NULL", creatorId);
      }
      return Response.json({ success: true });
    }

    return Response.json(
      { error: "当前页面版本与服务不一致，请刷新页面后重试", code: "UNSUPPORTED_ACTION" },
      { status: 400, headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}
