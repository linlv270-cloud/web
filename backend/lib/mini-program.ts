import crypto from "node:crypto";
import { all, getDb, newReference, one, run, transaction } from "./database";
import { assetUrl } from "./storage";
import { cleanText, contentSafety, validPhone } from "./security";
import { creatorApplicationTagCategories, projectOperationTags, projectPlatformTags, projectSceneTags } from "./catalog";
import { getCreator, getInbox } from "./repository";
import { isValidLocation } from "./locations";
import {
  addCreatorReviewSubmission,
  addReviewStatusMessage,
  ensureReviewThread,
  listAdminReviewThreads,
  listCreatorReviewThreads,
} from "./review-workflow";
import type { AdminPrincipal, CreatorProfile, Tag } from "./types";
import type {
  ConsultationMessage,
  ConsultationStatus,
  ConsultationThread,
  CreatorApplicationAdminItem,
  DrawResult,
  HomepageBanner,
  HomepageSlot,
  KitGuide,
  MiniActivity,
  MiniActivityStatus,
  MiniActorType,
  MiniCreatorHome,
  MiniPrincipal,
  MiniCreatorApplicationFieldKey,
  MiniCreatorApplicationFieldRule,
  MiniProgramSettings,
  ProjectOperationDraft,
  ProjectSchedule,
  ProjectOperationRequest,
  PublishedVenueKit,
  SupportTicket,
  VenueHour,
  VenueKit,
  VenueRule,
  WorkshopKit,
  WorkshopProject,
  WorkshopProjectDetail,
  WorkshopProjectStatus,
  WorkshopVenue,
} from "./mini-program-types";

export const defaultMiniCreatorApplicationFields: Record<MiniCreatorApplicationFieldKey, MiniCreatorApplicationFieldRule> = {
  brandName: { enabled: true, required: true, label: "品牌 / 工作室名称", hint: "填写对外展示的品牌或工作室名称" },
  location: { enabled: true, required: true, label: "常驻城市", hint: "选择省、市、区" },
  representativeImage: { enabled: true, required: true, label: "申请代表图", hint: "上传一张不超过20MB的图片" },
  intro: { enabled: true, required: false, label: "完整介绍", hint: "介绍你的创作、技能和体验方向" },
  tags: { enabled: true, required: true, label: "新遇官标签", hint: "每类最多 8 个，全部分类至少选择 1 个" },
  customTags: { enabled: true, required: false, label: "新增标签", hint: "没有合适标签时可新增，最多 7 个字" },
  offlineExperience: { enabled: true, required: false, label: "是否有线下体验", hint: "可多选，也可以暂不选择" },
  busyPeriods: { enabled: true, required: true, label: "已经安排的活动档期", hint: "填写你已安排的其他活动日期，避免我们在这些日期打扰你" },
};

function normalizeMiniCreatorApplicationFields(input: unknown) {
  const source = input && typeof input === "object" ? input as Record<string, unknown> : {};
  const systemRequired = new Set<MiniCreatorApplicationFieldKey>(["brandName", "location", "representativeImage", "tags", "busyPeriods"]);
  return Object.fromEntries(
    (Object.keys(defaultMiniCreatorApplicationFields) as MiniCreatorApplicationFieldKey[]).map((key) => {
      const defaults = defaultMiniCreatorApplicationFields[key];
      const raw = source[key] && typeof source[key] === "object" ? source[key] as Record<string, unknown> : {};
      const enabled = systemRequired.has(key) || (raw.enabled === undefined ? defaults.enabled : raw.enabled !== false);
      const storedLabel = cleanText(raw.label ?? defaults.label, 30) || defaults.label;
      const storedHint = cleanText(raw.hint ?? defaults.hint, 80) || defaults.hint;
      return [key, {
        enabled,
        required: systemRequired.has(key) || (enabled && (raw.required === undefined ? defaults.required : raw.required === true)),
        label: key === "brandName" && storedLabel.includes("产品名称")
          ? defaults.label
          : key === "representativeImage" && ["代表图片", "代表照片", "代表照"].includes(storedLabel)
            ? defaults.label
            : storedLabel,
        hint: key === "representativeImage" && /4\s*:\s*5/.test(storedHint)
          ? defaults.hint
          : key === "busyPeriods" && storedHint === "选中你已经参加其他活动的日期"
            ? defaults.hint
            : storedHint,
      }];
    }),
  ) as Record<MiniCreatorApplicationFieldKey, MiniCreatorApplicationFieldRule>;
}

type ActivityRow = {
  id: number;
  reference: string;
  creator_id: number;
  creator_name: string;
  user_name: string;
  creator_intro: string;
  creator_profile_intro: string;
  fallback_work_keys: string;
  title: string;
  short_intro: string;
  description: string;
  image_key: string | null;
  province: string;
  city: string;
  district: string;
  address: string;
  start_date: string;
  end_date: string;
  no_plan: number;
  accepts_qideng_during_activity: number;
  status: MiniActivityStatus;
  view_count: number;
  consultation_count: number;
  created_at: string;
  updated_at: string;
};

type ThreadRow = {
  id: number;
  reference: string;
  kind: ConsultationThread["kind"];
  consumer_id: number;
  consumer_name: string;
  creator_id: number | null;
  creator_name: string | null;
  activity_id: number | null;
  activity_title: string | null;
  workshop_project_id: number | null;
  workshop_project_title: string | null;
  status: ConsultationStatus;
  subject: string;
  reply_timeout_minutes: number;
  creator_unread_count: number;
  consumer_unread_count: number;
  escalated_at: string | null;
  last_message_at: string;
  created_at: string;
  updated_at: string;
};

type VenueRow = {
  id: number;
  reference: string;
  name: string;
  kind: WorkshopVenue["kind"];
  province: string;
  city: string;
  district: string;
  business_area: string;
  address: string;
  route_hint: string;
  latitude: number | null;
  longitude: number | null;
  cover_key: string | null;
  status: WorkshopVenue["status"];
  sort_order: number;
  created_at: string;
  updated_at: string;
};

type KitRow = {
  id: number;
  reference: string;
  title: string;
  subtitle: string;
  description: string;
  cover_key: string | null;
  gallery_keys: string;
  price_cents: number;
  age_range: string;
  duration_minutes: number;
  difficulty: WorkshopKit["difficulty"];
  mess_level: WorkshopKit["messLevel"];
  guidance_type: WorkshopKit["guidanceType"];
  safety_notes: string;
  status: WorkshopKit["status"];
  sort_order: number;
  created_at: string;
  updated_at: string;
};

type ProjectRow = {
  id: number;
  reference: string;
  creator_id: number;
  creator_name: string;
  user_name: string;
  one_liner: string;
  title: string;
  description: string;
  cover_key: string | null;
  province: string;
  city: string;
  district: string;
  address_hint: string;
  start_date: string;
  end_date: string;
  no_plan: number;
  min_people: number;
  max_people: number;
  price_cents: number;
  duration_minutes: number;
  primary_category_tag_id: number | null;
  primary_category_label: string | null;
  age_range: string;
  difficulty: WorkshopProject["difficulty"];
  safety_notes: string;
  operation_draft: string;
  selected_for_display: number;
  status: WorkshopProjectStatus;
  review_note: string;
  sort_order: number;
  view_count: number;
  consultation_count: number;
  published_at: string | null;
  representative_image_key: string;
  fallback_work_keys: string;
  created_at: string;
  updated_at: string;
};

type OperationRequestRow = {
  id: number;
  project_id: number;
  project_title: string;
  max_people: number;
  creator_id: number;
  creator_name: string;
  request_type: ProjectOperationRequest["requestType"];
  rule_acknowledged: number;
  reason: string;
  quantity_note: string;
  starts_at: string | null;
  ends_at: string | null;
  status: ProjectOperationRequest["status"];
  review_note: string;
  reviewed_by: string;
  reviewed_at: string | null;
  review_thread_id: number | null;
  created_at: string;
  updated_at: string;
};

type BannerRow = {
  id: number;
  title: string;
  subtitle: string;
  image_key: string | null;
  link_type: HomepageBanner["linkType"];
  link_value: string;
  city: string;
  enabled: number;
  sort_order: number;
  starts_at: string | null;
  ends_at: string | null;
  created_at: string;
  updated_at: string;
};

type SlotRow = {
  id: number;
  slot_key: HomepageSlot["slotKey"];
  content_type: HomepageSlot["contentType"];
  content_id: number;
  title_override: string;
  enabled: number;
  sort_order: number;
  starts_at: string | null;
  ends_at: string | null;
  created_by_creator_id: number | null;
  reviewed_by_admin: string;
  review_status: HomepageSlot["reviewStatus"];
  created_at: string;
  updated_at: string;
};

type VenueHourRow = {
  id: number;
  venue_id: number;
  weekday: number | null;
  date_override: string;
  open_time: string;
  close_time: string;
  closed: number;
  note: string;
  created_at: string;
  updated_at: string;
};

type VenueKitRow = {
  venue_id: number;
  venue_name: string;
  kit_id: number;
  kit_title: string;
  stock: number;
  available: number;
  points_reward: number;
  updated_at: string;
};

type KitGuideRow = {
  id: number;
  kit_id: number;
  step_order: number;
  title: string;
  body: string;
  media_key: string | null;
  video_url: string;
  safety_level: KitGuide["safetyLevel"];
  created_at: string;
  updated_at: string;
};

type VenueRuleRow = {
  id: number;
  venue_id: number;
  step_order: number;
  title: string;
  body: string;
  link_url: string;
  created_at: string;
  updated_at: string;
};

type SupportTicketRow = {
  id: number;
  reference: string;
  consumer_id: number | null;
  venue_id: number | null;
  venue_name: string | null;
  kit_id: number | null;
  kit_title: string | null;
  subject: string;
  body: string;
  status: SupportTicket["status"];
  handled_by: string;
  created_at: string;
  updated_at: string;
};

function activityQuery(where = "", order = "a.sort_order DESC, a.updated_at DESC") {
  return `SELECT a.*, c.brand_name AS creator_name, c.user_name, c.booth_description AS creator_intro,
    c.intro AS creator_profile_intro, c.work_keys AS fallback_work_keys
    FROM activities a JOIN creators c ON c.id = a.creator_id
    ${where} ORDER BY ${order}`;
}

function activityTags(activityId: number) {
  return all<Tag>(
    `SELECT t.id, t.label, t.category, t.status, 'platform' AS source
     FROM tags t JOIN activity_tags at ON at.tag_id = t.id
     WHERE at.activity_id = ? AND t.status IN ('active', 'pending')
     ORDER BY t.category, t.label`,
    activityId,
  );
}

function mapActivity(row: ActivityRow): MiniActivity {
  return {
    id: row.id,
    reference: row.reference,
    creatorId: row.creator_id,
    creatorName: row.creator_name || row.user_name || "TDE新遇官",
    creatorIntro: row.creator_intro || row.creator_profile_intro || "",
    title: row.title,
    shortIntro: row.short_intro,
    description: row.description,
    imageUrl: row.image_key ? assetUrl(row.image_key)! : `/api/mini/activities/${row.id}/image`,
    province: row.province,
    city: row.city,
    district: row.district,
    address: row.address,
    startDate: row.start_date,
    endDate: row.end_date,
    noPlan: Boolean(row.no_plan),
    acceptsQidengDuringActivity: Boolean(row.accepts_qideng_during_activity),
    status: row.status,
    tags: activityTags(row.id),
    viewCount: row.view_count,
    consultationCount: row.consultation_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function getMiniProgramSettings(): MiniProgramSettings {
  const row = one<{
    enabled: number;
    creator_invitations_enabled: number;
    default_activity_limit: number;
    default_reply_timeout_minutes: number;
    opening_copy: string;
    slogan: string;
    draw_button: string;
    contact_copy: string;
    hero_image_key: string | null;
    loading_image_key: string | null;
    reveal_image_key: string | null;
    creator_application_fields: string;
    updated_at: string;
  }>("SELECT * FROM mini_program_settings WHERE id = 1")!;
  let storedApplicationFields: unknown = {};
  try { storedApplicationFields = JSON.parse(row.creator_application_fields || "{}"); } catch { storedApplicationFields = {}; }
  return {
    enabled: Boolean(row.enabled),
    creatorInvitationsEnabled: Boolean(row.creator_invitations_enabled),
    defaultActivityLimit: row.default_activity_limit,
    defaultReplyTimeoutMinutes: row.default_reply_timeout_minutes,
    openingCopy: row.opening_copy,
    slogan: row.slogan,
    drawButton: row.draw_button,
    contactCopy: row.contact_copy,
    heroImageUrl: assetUrl(row.hero_image_key),
    loadingImageUrl: assetUrl(row.loading_image_key),
    revealImageUrl: assetUrl(row.reveal_image_key),
    creatorApplicationFields: normalizeMiniCreatorApplicationFields(storedApplicationFields),
    updatedAt: row.updated_at,
  };
}

export function updateMiniProgramSettings(input: Record<string, unknown>) {
  const current = getMiniProgramSettings();
  const activityLimit = Math.max(1, Math.min(20, Number(input.defaultActivityLimit ?? current.defaultActivityLimit) || 1));
  const timeout = Math.max(10, Math.min(10080, Number(input.defaultReplyTimeoutMinutes ?? current.defaultReplyTimeoutMinutes) || 120));
  const openingCopy = cleanText(input.openingCopy ?? current.openingCopy, 80);
  const slogan = cleanText(input.slogan ?? current.slogan, 40);
  const drawButton = cleanText(input.drawButton ?? current.drawButton, 12);
  const contactCopy = cleanText(input.contactCopy ?? current.contactCopy, 300);
  const creatorApplicationFields = normalizeMiniCreatorApplicationFields(input.creatorApplicationFields ?? current.creatorApplicationFields);
  const safety = contentSafety(
    openingCopy,
    slogan,
    drawButton,
    contactCopy,
    ...Object.values(creatorApplicationFields).flatMap((field) => [field.label, field.hint]),
  );
  if (safety) throw new Error(safety);
  run(
    `UPDATE mini_program_settings SET enabled = ?, creator_invitations_enabled = ?, default_activity_limit = ?, default_reply_timeout_minutes = ?,
     opening_copy = ?, slogan = ?, draw_button = ?, contact_copy = ?, creator_application_fields = ?, updated_at = CURRENT_TIMESTAMP WHERE id = 1`,
    input.enabled === false ? 0 : 1,
    input.creatorInvitationsEnabled === true ? 1 : 0,
    activityLimit,
    timeout,
    openingCopy,
    slogan,
    drawButton,
    contactCopy,
    JSON.stringify(creatorApplicationFields),
  );
  return getMiniProgramSettings();
}

export function setMiniProgramVisual(kind: "hero" | "loading" | "reveal", key: string) {
  const column = `${kind}_image_key`;
  run(`UPDATE mini_program_settings SET ${column} = ?, updated_at = CURRENT_TIMESTAMP WHERE id = 1`, key);
  return getMiniProgramSettings();
}

export function listMiniActivities(options: { creatorId?: number; includeAll?: boolean } = {}) {
  const clauses: string[] = [];
  const values: Array<string | number> = [];
  if (options.creatorId) {
    clauses.push("a.creator_id = ?");
    values.push(options.creatorId);
  }
  if (!options.includeAll) clauses.push("a.status = 'published' AND a.no_plan = 0 AND c.suspended = 0 AND (NOT EXISTS (SELECT 1 FROM creator_applications ca WHERE ca.creator_id = a.creator_id) OR EXISTS (SELECT 1 FROM creator_applications ca WHERE ca.creator_id = a.creator_id AND ca.status = 'active'))");
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  return all<ActivityRow>(activityQuery(where), ...values).map(mapActivity);
}

export function getMiniActivity(id: number, includePrivate = false) {
  const where = includePrivate
    ? "WHERE a.id = ?"
    : "WHERE a.id = ? AND a.status = 'published' AND a.no_plan = 0 AND c.suspended = 0 AND (NOT EXISTS (SELECT 1 FROM creator_applications ca WHERE ca.creator_id = a.creator_id) OR EXISTS (SELECT 1 FROM creator_applications ca WHERE ca.creator_id = a.creator_id AND ca.status = 'active'))";
  const row = one<ActivityRow>(activityQuery(where), id);
  return row ? mapActivity(row) : null;
}

function validDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

function currentShanghaiDate() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value || "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function normalizeProjectSchedules(input: unknown) {
  if (!Array.isArray(input)) return null;
  if (input.length > 90) throw new Error("每个体验最多添加90个可体验日期");
  const seen = new Set<string>();
  return input.map((value) => {
    const item = value && typeof value === "object" ? value as Record<string, unknown> : {};
    const availableDate = cleanText(item.availableDate, 10);
    const startTime = cleanText(item.startTime, 5);
    const endTime = cleanText(item.endTime, 5);
    const note = cleanText(item.note, 120);
    if (!validDate(availableDate)) throw new Error("体验日期格式不正确");
    if ((startTime || endTime) && (!/^\d{2}:\d{2}$/.test(startTime) || !/^\d{2}:\d{2}$/.test(endTime) || startTime >= endTime))
      throw new Error("体验时间格式不正确");
    const key = `${availableDate}|${startTime}|${endTime}`;
    if (seen.has(key)) throw new Error("体验日期不能重复");
    seen.add(key);
    return { availableDate, startTime, endTime, note };
  });
}

export function saveMiniActivity(creatorId: number, input: Record<string, unknown>, principal?: AdminPrincipal) {
  const creator = getCreator(creatorId);
  if (!creator) throw new Error("TDE新遇官不存在");
  if (principal?.role === "subadmin" && creator.managerAdminId !== principal.id) throw new Error("该账号不能管理此新遇官");
  const settings = getMiniProgramSettings();
  const id = Number(input.id || 0);
  const current = id ? getMiniActivity(id, true) : null;
  if (id && (!current || current.creatorId !== creatorId)) throw new Error("活动不存在或不能修改");
  const activeCount = Number(one<{ count: number }>(
    "SELECT COUNT(*) AS count FROM activities WHERE creator_id = ? AND status != 'archived' AND id != ?",
    creatorId,
    id,
  )?.count || 0);
  const limit = creator.activityLimit ?? settings.defaultActivityLimit;
  if (!id && activeCount >= limit) throw new Error(`当前最多可提交${limit}个活动`);

  const noPlan = input.noPlan === undefined ? Boolean(current?.noPlan) : input.noPlan === true;
  const title = cleanText(input.title ?? current?.title ?? creator.brandName, 50);
  const shortIntro = cleanText(input.shortIntro ?? current?.shortIntro, 100);
  const description = cleanText(input.description ?? current?.description, 1000);
  const province = cleanText(input.province ?? current?.province ?? creator.province, 20);
  const city = cleanText(input.city ?? current?.city ?? creator.city, 30);
  const district = cleanText(input.district ?? current?.district ?? creator.district, 30);
  const address = cleanText(input.address ?? current?.address, 100);
  const startDate = noPlan ? "" : cleanText(input.startDate ?? current?.startDate, 10);
  const endDate = noPlan ? "" : cleanText(input.endDate ?? current?.endDate ?? startDate, 10);
  const acceptsQidengDuringActivity = input.acceptsQidengDuringActivity === undefined
    ? Boolean(current?.acceptsQidengDuringActivity)
    : input.acceptsQidengDuringActivity === true;
  if (!noPlan && (!validDate(startDate) || !validDate(endDate) || startDate > endDate))
    throw new Error("请选择正确的活动起止日期");
  if (!noPlan && (!title || !shortIntro || !city)) throw new Error("请完成活动名称、简短介绍和城市");
  if (province && city && !isValidLocation(province, city, district))
    throw new Error("请选择有效的省、市、区");
  const safety = contentSafety(title, shortIntro, description, address);
  if (safety) throw new Error(safety);
  const desiredStatus = cleanText(input.status ?? current?.status ?? "published", 20) as MiniActivityStatus;
  const application = one<{ status: string }>("SELECT status FROM creator_applications WHERE creator_id = ?", creatorId);
  const status: MiniActivityStatus = !principal && application && application.status !== "active"
    ? "draft"
    : noPlan
      ? "paused"
      : ["draft", "published", "paused", "archived"].includes(desiredStatus)
      ? desiredStatus
      : "published";
  const tagIds = Array.isArray(input.tagIds)
    ? [...new Set(input.tagIds.map(Number).filter(Number.isInteger))].slice(0, 24)
    : creator.tags.map((tag) => tag.id);
  const db = getDb();
  db.exec("BEGIN IMMEDIATE");
  try {
    let activityId = id;
    if (current) {
      db.prepare(
        `UPDATE activities SET title = ?, short_intro = ?, description = ?, province = ?, city = ?, district = ?,
         address = ?, start_date = ?, end_date = ?, no_plan = ?, accepts_qideng_during_activity = ?, status = ?,
         updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      ).run(title, shortIntro, description, province, city, district, address, startDate, endDate, noPlan ? 1 : 0,
        acceptsQidengDuringActivity ? 1 : 0,
        status,
        id,
      );
    } else {
      activityId = Number(db.prepare(
        `INSERT INTO activities(reference, creator_id, title, short_intro, description, province, city, district,
         address, start_date, end_date, no_plan, accepts_qideng_during_activity, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(newReference("QD"), creatorId, title, shortIntro, description, province, city, district, address,
        startDate, endDate, noPlan ? 1 : 0, acceptsQidengDuringActivity ? 1 : 0, status).lastInsertRowid);
    }
    db.prepare("DELETE FROM activity_tags WHERE activity_id = ?").run(activityId);
    const insertTag = db.prepare(
      "INSERT OR IGNORE INTO activity_tags(activity_id, tag_id) SELECT ?, id FROM tags WHERE id = ? AND status IN ('active', 'pending')",
    );
    for (const tagId of tagIds) insertTag.run(activityId, tagId);
    db.prepare("DELETE FROM busy_periods WHERE creator_id = ? AND source = 'event' AND source_id = ?").run(creatorId, activityId);
    if (!noPlan && status === "published" && !acceptsQidengDuringActivity) {
      db.prepare(
        "INSERT INTO busy_periods(creator_id, start_date, end_date, note, source, source_id) VALUES (?, ?, ?, ?, 'event', ?)",
      ).run(creatorId, startDate, endDate, title, activityId);
      db.prepare("UPDATE creators SET no_bookings = 0, schedule_confirmed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(creatorId);
    } else if (noPlan) {
      db.prepare("UPDATE creators SET no_bookings = 1, schedule_confirmed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(creatorId);
    }
    db.exec("COMMIT");
    return getMiniActivity(activityId, true)!;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function setMiniActivityImage(activityId: number, creatorId: number, key: string) {
  const activity = getMiniActivity(activityId, true);
  if (!activity || activity.creatorId !== creatorId) throw new Error("活动不存在或不能修改");
  run("UPDATE activities SET image_key = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", key, activityId);
  return getMiniActivity(activityId, true)!;
}

function intentRange(intent: string, requestedDate: string) {
  const today = new Date();
  const iso = (date: Date) => date.toISOString().slice(0, 10);
  if (intent === "date" && validDate(requestedDate)) return { from: requestedDate, to: requestedDate };
  if (intent === "today") return { from: iso(today), to: iso(today) };
  if (intent === "weekend") {
    const day = today.getDay();
    const saturday = new Date(today);
    saturday.setDate(today.getDate() + ((6 - day + 7) % 7));
    const sunday = new Date(saturday);
    sunday.setDate(saturday.getDate() + 1);
    return { from: iso(saturday), to: iso(sunday) };
  }
  return { from: iso(today), to: "9999-12-31" };
}

export function createDraw(input: Record<string, unknown>, consumerId: number | null = null): DrawResult {
  const settings = getMiniProgramSettings();
  if (!settings.enabled) throw new Error("TDE暂时休息中，请稍后再来");
  const guestId = cleanText(input.guestId, 80);
  if (!guestId) throw new Error("缺少本次浏览标识");
  const city = cleanText(input.city, 30);
  const district = cleanText(input.district, 30);
  const intent = cleanText(input.dateIntent || "any", 20);
  const range = intentRange(intent, cleanText(input.date, 10));
  const candidates = listMiniActivities().filter((activity) => {
    if (city && activity.city !== city) return false;
    if (activity.endDate < range.from || activity.startDate > range.to) return false;
    return true;
  });
  if (!candidates.length) throw new Error("这座城市暂时还没有合适体验，换个日期再试试");
  const districtMatches = district ? candidates.filter((activity) => activity.district === district) : [];
  const pool = districtMatches.length ? districtMatches : candidates;

  // Give every creator one seat in the random pool. Historical counts keep the
  // sequence balanced, while crypto randomness decides between equally seen creators.
  const creatorGroups = new Map<number, MiniActivity[]>();
  for (const item of pool) {
    const group = creatorGroups.get(item.creatorId) || [];
    group.push(item);
    creatorGroups.set(item.creatorId, group);
  }
  const history = all<{ creator_id: number; activity_id: number }>(
    `SELECT a.creator_id, ds.activity_id
     FROM draw_sessions ds JOIN activities a ON a.id = ds.activity_id
     WHERE ds.guest_id = ? ORDER BY ds.id DESC LIMIT 500`,
    guestId,
  );
  const creatorCounts = new Map<number, number>();
  const activityCounts = new Map<number, number>();
  for (const item of history) {
    creatorCounts.set(item.creator_id, (creatorCounts.get(item.creator_id) || 0) + 1);
    activityCounts.set(item.activity_id, (activityCounts.get(item.activity_id) || 0) + 1);
  }
  const lastCreatorId = history[0]?.creator_id;
  const eligibleCreatorIds = [...creatorGroups.keys()];
  const withoutImmediateRepeat = eligibleCreatorIds.length > 1
    ? eligibleCreatorIds.filter((id) => id !== lastCreatorId)
    : eligibleCreatorIds;
  const leastCreatorCount = Math.min(...withoutImmediateRepeat.map((id) => creatorCounts.get(id) || 0));
  const creatorChoices = withoutImmediateRepeat.filter((id) => (creatorCounts.get(id) || 0) === leastCreatorCount);
  const creatorId = creatorChoices[crypto.randomInt(creatorChoices.length)];
  const creatorActivities = creatorGroups.get(creatorId)!;
  const leastActivityCount = Math.min(...creatorActivities.map((item) => activityCounts.get(item.id) || 0));
  const activityChoices = creatorActivities.filter((item) => (activityCounts.get(item.id) || 0) === leastActivityCount);
  const activity = activityChoices[crypto.randomInt(activityChoices.length)];
  const reference = newReference("FL");
  const snapshot = { city, district, dateIntent: intent, date: cleanText(input.date, 10), range };
  run(
    `INSERT INTO draw_sessions(reference, guest_id, consumer_id, filter_snapshot, activity_id)
     VALUES (?, ?, ?, ?, ?)`,
    reference,
    guestId,
    consumerId,
    JSON.stringify(snapshot),
    activity.id,
  );
  return { reference, activity, createdAt: new Date().toISOString() };
}

export function revealDraw(reference: string, guestId: string) {
  const row = one<{ activity_id: number; created_at: string }>(
    "SELECT activity_id, created_at FROM draw_sessions WHERE reference = ? AND guest_id = ?",
    cleanText(reference, 32),
    cleanText(guestId, 80),
  );
  if (!row) throw new Error("这次体验推荐已经找不到了，请重新选择一次");
  const activity = getMiniActivity(row.activity_id);
  if (!activity) throw new Error("这个体验刚刚有了变化，请重新选择一次");
  run("UPDATE draw_sessions SET revealed_at = COALESCE(revealed_at, CURRENT_TIMESTAMP) WHERE reference = ?", reference);
  return { reference, activity, createdAt: row.created_at } satisfies DrawResult;
}

export function recordMiniActivityView(id: number) {
  run("UPDATE activities SET view_count = view_count + 1 WHERE id = ? AND status = 'published'", id);
}

export function recordWorkshopProjectView(id: number) {
  run("UPDATE workshop_projects SET view_count = view_count + 1 WHERE id = ? AND status = 'published'", id);
}

function threadMessages(threadId: number): ConsultationMessage[] {
  return all<{ id: number; sender_type: ConsultationMessage["senderType"]; body: string; created_at: string }>(
    "SELECT id, sender_type, body, created_at FROM consultation_messages WHERE thread_id = ? ORDER BY id",
    threadId,
  ).map((item) => ({ id: item.id, senderType: item.sender_type, body: item.body, createdAt: item.created_at }));
}

function threadOverdue(row: ThreadRow) {
  if (row.status !== "waiting") return false;
  return Date.now() - Date.parse(`${row.last_message_at.replace(" ", "T")}Z`) > row.reply_timeout_minutes * 60000;
}

function mapThread(row: ThreadRow, includeMessages = false): ConsultationThread {
  return {
    id: row.id,
    reference: row.reference,
    kind: row.kind,
    consumerId: row.consumer_id,
    consumerName: row.consumer_name || "微信用户",
    creatorId: row.creator_id,
    creatorName: row.creator_name || "TDE官方客服",
    activityId: row.activity_id,
    workshopProjectId: row.workshop_project_id,
    activityTitle: row.workshop_project_title || row.activity_title || "",
    status: row.status,
    subject: row.subject,
    replyTimeoutMinutes: row.reply_timeout_minutes,
    creatorUnreadCount: row.creator_unread_count,
    consumerUnreadCount: row.consumer_unread_count,
    overdue: threadOverdue(row),
    lastMessageAt: row.last_message_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    messages: includeMessages ? threadMessages(row.id) : undefined,
  };
}

function threadQuery(where: string) {
  return `SELECT t.*, ca.nickname AS consumer_name, c.brand_name AS creator_name,
    a.title AS activity_title, p.one_liner AS workshop_project_title
    FROM consultation_threads t
    JOIN consumer_accounts ca ON ca.id = t.consumer_id
    LEFT JOIN creators c ON c.id = t.creator_id
    LEFT JOIN activities a ON a.id = t.activity_id
    LEFT JOIN workshop_projects p ON p.id = t.workshop_project_id
    ${where}`;
}

export function createConsultation(consumerId: number, input: Record<string, unknown>) {
  if (input.kind !== "official") throw new Error("体验请在体验详情联系新遇官");
  const kind = "official" as const;
  const activityId = null;
  const workshopProjectId = null;
  const existing = one<ThreadRow>(
    threadQuery(
      "WHERE t.consumer_id = ? AND t.kind = ? AND COALESCE(t.activity_id, 0) = ? AND COALESCE(t.workshop_project_id, 0) = ? AND t.status IN ('open', 'waiting') ORDER BY t.id DESC LIMIT 1",
    ),
    consumerId,
    kind,
    activityId || 0,
    workshopProjectId || 0,
  );
  if (existing) return mapThread(existing, true);
  const settings = getMiniProgramSettings();
  const timeout = settings.defaultReplyTimeoutMinutes;
  const subject = cleanText(input.subject || "咨询TDE官方客服", 80);
  const result = run(
    `INSERT INTO consultation_threads(reference, kind, consumer_id, creator_id, activity_id, workshop_project_id, status, subject, reply_timeout_minutes)
     VALUES (?, ?, ?, ?, ?, ?, 'open', ?, ?)`,
    newReference("ZX"), kind, consumerId, null, activityId, workshopProjectId, subject, timeout,
  );
  const threadId = Number(result.lastInsertRowid);
  const firstMessage = cleanText(input.message, 1000);
  if (firstMessage) sendConsultationMessage({ actorType: "consumer", actorId: consumerId }, threadId, firstMessage);
  return getConsultation({ actorType: "consumer", actorId: consumerId }, threadId)!;
}

function canAccessThread(principal: MiniPrincipal, row: ThreadRow) {
  return principal.actorType === "consumer" && row.consumer_id === principal.actorId && row.kind === "official";
}

export function getConsultation(principal: MiniPrincipal, id: number) {
  const row = one<ThreadRow>(threadQuery("WHERE t.id = ?"), id);
  if (!row || !canAccessThread(principal, row)) return null;
  return mapThread(row, true);
}

export function listConsultations(principal: MiniPrincipal) {
  const where = "WHERE t.consumer_id = ? AND t.kind = 'official' ORDER BY t.updated_at DESC";
  return all<ThreadRow>(threadQuery(where), principal.actorId).map((row) => mapThread(row));
}

export function sendConsultationMessage(principal: MiniPrincipal, threadId: number, bodyInput: unknown) {
  const row = one<ThreadRow>(threadQuery("WHERE t.id = ?"), threadId);
  if (!row || !canAccessThread(principal, row)) throw new Error("咨询不存在或不能回复");
  if (row.status === "closed") throw new Error("这次咨询已经关闭");
  const body = cleanText(bodyInput, 1000);
  if (!body) throw new Error("请输入要发送的文字");
  const safety = contentSafety(body);
  if (safety) throw new Error(safety);
  const sender = principal.actorType;
  run(
    "INSERT INTO consultation_messages(thread_id, sender_type, sender_id, body) VALUES (?, ?, ?, ?)",
    threadId,
    sender,
    principal.actorId,
    body,
  );
  if (sender === "consumer") {
    run(
      `UPDATE consultation_threads SET status = 'waiting', creator_unread_count = creator_unread_count + 1,
       last_message_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      threadId,
    );
  } else {
    run(
      `UPDATE consultation_threads SET status = 'open', consumer_unread_count = consumer_unread_count + 1,
       escalated_at = NULL, last_message_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      threadId,
    );
  }
  return getConsultation(principal, threadId)!;
}

export function markConsultationRead(principal: MiniPrincipal, threadId: number) {
  const row = one<ThreadRow>(threadQuery("WHERE t.id = ?"), threadId);
  if (!row || !canAccessThread(principal, row)) throw new Error("咨询不存在");
  const column = principal.actorType === "consumer" ? "consumer_unread_count" : "creator_unread_count";
  run(`UPDATE consultation_threads SET ${column} = 0 WHERE id = ?`, threadId);
  return getConsultation(principal, threadId)!;
}

export function setConsultationStatus(principal: MiniPrincipal, threadId: number, status: ConsultationStatus) {
  const row = one<ThreadRow>(threadQuery("WHERE t.id = ?"), threadId);
  if (!row || !canAccessThread(principal, row)) throw new Error("咨询不存在");
  if (!["open", "resolved", "closed"].includes(status)) throw new Error("咨询状态不正确");
  run(
    `UPDATE consultation_threads SET status = ?, closed_at = CASE WHEN ? = 'closed' THEN CURRENT_TIMESTAMP ELSE NULL END,
     updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    status,
    status,
    threadId,
  );
  return getConsultation(principal, threadId)!;
}

export function getMiniCreatorHome(creatorId: number): MiniCreatorHome {
  const creator = getCreator(creatorId);
  if (!creator) throw new Error("TDE新遇官不存在");
  const settings = getMiniProgramSettings();
  const replyUnreadCount = 0;
  const noticeUnreadCount = getInbox(creatorId).filter((item) => !item.readAt).length;
  const reviewThreads = listCreatorReviewThreads(creatorId);
  const reviewUnreadCount = reviewThreads.reduce((total, thread) => total + thread.creatorUnreadCount, 0);
  const binding = one<{ status: "pending" | "active" | "rejected" }>(
    "SELECT status FROM creator_wechat_bindings WHERE creator_id = ?",
    creatorId,
  );
  const application = one<{
    status: "pending" | "needs_changes" | "active" | "rejected";
    review_note: string;
    submitted_at: string;
    phone: string;
    phone_public_authorized: number;
    phone_consent_at: string | null;
  }>("SELECT status, review_note, submitted_at, phone, phone_public_authorized, phone_consent_at FROM creator_applications WHERE creator_id = ?", creatorId);
  const creatorForHome = !settings.creatorInvitationsEnabled || (application && application.status !== "active")
    ? { ...creator, inviteCode: "" }
    : creator;
  return {
    creator: creatorForHome,
    approvedProjectTagIds: [...approvedCreatorProjectTagIds(creatorId)],
    activities: listMiniActivities({ creatorId, includeAll: true }),
    projects: listWorkshopProjects(undefined, true).filter((project) => project.creatorId === creatorId),
    applicationStatus: application?.status || binding?.status || "legacy",
    applicationReviewNote: application?.review_note || "",
    applicationSubmittedAt: application?.submitted_at || "",
    contactPhoneMasked: maskedPhone(application?.phone || ""),
    phonePublicAuthorized: Boolean(application?.phone_public_authorized),
    phoneConsentAt: application?.phone_consent_at || null,
    contactChannels: [],
    replyUnreadCount,
    noticeUnreadCount,
    reviewUnreadCount,
    reviewThreads,
    operationRequests: listProjectOperationRequests(creatorId),
    activityLimit: creator.activityLimit ?? settings.defaultActivityLimit,
    replyTimeoutMinutes: creator.replyTimeoutMinutes ?? settings.defaultReplyTimeoutMinutes,
  };
}

export function updateCreatorPhonePublicAuthorization(creatorId: number, authorized: boolean) {
  const application = one<{ status: string; phone: string }>(
    "SELECT status, phone FROM creator_applications WHERE creator_id = ?",
    creatorId,
  );
  if (!application) throw new Error("新遇官申请不存在");
  if (application.status !== "active") throw new Error("请先完成新遇官申请审核");
  if (authorized && !validPhone(application.phone)) throw new Error("注册手机号无效，请联系管理员处理");
  run(
    `UPDATE creator_applications SET phone_public_authorized = ?,
     phone_consent_at = CASE WHEN ? = 1 THEN CURRENT_TIMESTAMP ELSE NULL END,
     updated_at = CURRENT_TIMESTAMP WHERE creator_id = ?`,
    authorized ? 1 : 0,
    authorized ? 1 : 0,
    creatorId,
  );
  const consent = one<{ phone_consent_at: string | null }>(
    "SELECT phone_consent_at FROM creator_applications WHERE creator_id = ?",
    creatorId,
  );
  return {
    phonePublicAuthorized: authorized,
    phoneConsentAt: consent?.phone_consent_at || null,
    contactPhoneMasked: maskedPhone(application.phone),
  };
}

export function setCreatorMiniLimits(creatorId: number, input: Record<string, unknown>) {
  if (!getCreator(creatorId)) throw new Error("TDE新遇官不存在");
  const activityLimit = input.activityLimit === null || input.activityLimit === ""
    ? null
    : Math.max(1, Math.min(20, Number(input.activityLimit) || 1));
  const replyTimeout = input.replyTimeoutMinutes === null || input.replyTimeoutMinutes === ""
    ? null
    : Math.max(10, Math.min(10080, Number(input.replyTimeoutMinutes) || 120));
  run(
    "UPDATE creators SET activity_limit = ?, reply_timeout_minutes = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
    activityLimit,
    replyTimeout,
    creatorId,
  );
  run("UPDATE consultation_threads SET reply_timeout_minutes = ? WHERE creator_id = ? AND status IN ('open', 'waiting')", replyTimeout ?? getMiniProgramSettings().defaultReplyTimeoutMinutes, creatorId);
  return getMiniCreatorHome(creatorId);
}

export function listAdminConsultations(principal: AdminPrincipal) {
  const where = principal.role === "subadmin"
    ? "WHERE c.manager_admin_id = ? OR (t.kind = 'official' AND 0) ORDER BY t.updated_at DESC"
    : "ORDER BY t.updated_at DESC";
  const values = principal.role === "subadmin" ? [principal.id || 0] : [];
  return all<ThreadRow>(threadQuery(where), ...values).map((row) => mapThread(row, true));
}

export function adminReplyConsultation(principal: AdminPrincipal, threadId: number, bodyInput: unknown) {
  if (principal.role !== "super") throw new Error("只有超级管理员可以代表官方客服回复");
  const row = one<ThreadRow>(threadQuery("WHERE t.id = ?"), threadId);
  if (!row) throw new Error("咨询不存在");
  if (row.kind !== "official") throw new Error("官方客服只能回复平台官方咨询");
  const body = cleanText(bodyInput, 1000);
  if (!body) throw new Error("请输入回复内容");
  const safety = contentSafety(body);
  if (safety) throw new Error(safety);
  run(
    "INSERT INTO consultation_messages(thread_id, sender_type, sender_id, body) VALUES (?, 'admin', NULL, ?)",
    threadId,
    body,
  );
  run(
    `UPDATE consultation_threads SET status = 'open', consumer_unread_count = consumer_unread_count + 1,
     last_message_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    threadId,
  );
  const updated = one<ThreadRow>(threadQuery("WHERE t.id = ?"), threadId)!;
  return mapThread(updated, true);
}

export function miniAdminOverview(principal: AdminPrincipal) {
  const creatorIds = principal.role === "subadmin"
    ? all<{ id: number }>("SELECT id FROM creators WHERE manager_admin_id = ?", principal.id || 0).map((item) => item.id)
    : null;
  const activities = listMiniActivities({ includeAll: true }).filter((activity) => !creatorIds || creatorIds.includes(activity.creatorId));
  const consultations = listAdminConsultations(principal);
  return {
    settings: getMiniProgramSettings(),
    activities,
    consultations,
    metrics: {
      activities: activities.filter((item) => item.status !== "archived").length,
      publishedActivities: activities.filter((item) => item.status === "published").length,
      consultations: consultations.length,
      overdueConsultations: consultations.filter((item) => item.overdue).length,
      consumers: principal.role === "super" ? Number(one<{ count: number }>("SELECT COUNT(*) AS count FROM consumer_accounts")?.count || 0) : 0,
      draws: principal.role === "super" ? Number(one<{ count: number }>("SELECT COUNT(*) AS count FROM draw_sessions")?.count || 0) : 0,
    },
  };
}

function parseJsonArray(value: string | null) {
  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function parseJsonObject(value: string | null) {
  try {
    const parsed = JSON.parse(value || "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function approvedCreatorProjectTagIds(creatorId: number) {
  const application = one<{ status: string; tag_ids: string; custom_tags: string }>(
    "SELECT status, tag_ids, custom_tags FROM creator_applications WHERE creator_id = ?",
    creatorId,
  );
  const activeTags = all<{ id: number; category: string; label: string }>(
    `SELECT t.id, t.category, t.label FROM creator_tags ct JOIN tags t ON t.id = ct.tag_id
     WHERE ct.creator_id = ? AND t.status = 'active'
       AND t.category IN ('我的作品', '我的客群', '我的风格', '现场体验')`,
    creatorId,
  );
  if (!application) return new Set(activeTags.map((tag) => tag.id));
  if (application.status !== "active") return new Set<number>();
  const selectedIds = new Set(
    parseJsonArray(application.tag_ids).map(Number).filter((id) => Number.isInteger(id)),
  );
  const customKeys = new Set(
    parseJsonArray(application.custom_tags)
      .filter((item) => item && typeof item === "object")
      .map((item) => `${String(item.category || "")}\u0000${String(item.label || "")}`),
  );
  return new Set(activeTags
    .filter((tag) => selectedIds.has(tag.id) || customKeys.has(`${tag.category}\u0000${tag.label}`))
    .map((tag) => tag.id));
}

function normalizeProjectOperationDraft(value: unknown): ProjectOperationDraft {
  const source = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  return {
    requestFirstLaunch: source.requestFirstLaunch === true,
    firstLaunchReason: cleanText(source.firstLaunchReason, 300),
    firstLaunchAcknowledged: source.firstLaunchAcknowledged === true,
    requestLimited: source.requestLimited === true,
    limitedReason: cleanText(source.limitedReason, 300),
    limitedAcknowledged: source.limitedAcknowledged === true,
  };
}

function maskedPhone(phone: string) {
  return validPhone(phone) ? `${phone.slice(0, 3)}****${phone.slice(-4)}` : "";
}

function mapVenue(row: VenueRow): WorkshopVenue {
  return {
    id: row.id,
    reference: row.reference,
    name: row.name,
    kind: row.kind,
    province: row.province,
    city: row.city,
    district: row.district,
    businessArea: row.business_area,
    address: row.address,
    routeHint: row.route_hint,
    latitude: row.latitude,
    longitude: row.longitude,
    coverUrl: assetUrl(row.cover_key),
    status: row.status,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapVenueHour(row: VenueHourRow): VenueHour {
  return {
    id: row.id,
    venueId: row.venue_id,
    weekday: row.weekday,
    dateOverride: row.date_override,
    openTime: row.open_time,
    closeTime: row.close_time,
    closed: Boolean(row.closed),
    note: row.note,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapKit(row: KitRow): WorkshopKit {
  return {
    id: row.id,
    reference: row.reference,
    title: row.title,
    subtitle: row.subtitle,
    description: row.description,
    coverUrl: assetUrl(row.cover_key),
    galleryUrls: parseJsonArray(row.gallery_keys).map((key) => assetUrl(String(key))).filter(Boolean) as string[],
    priceCents: row.price_cents,
    ageRange: row.age_range,
    durationMinutes: row.duration_minutes,
    difficulty: row.difficulty,
    messLevel: row.mess_level,
    guidanceType: row.guidance_type,
    safetyNotes: row.safety_notes,
    tags: kitTags(row.id),
    status: row.status,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function kitTags(kitId: number) {
  return all<Tag>(
    `SELECT t.id, t.label, t.category, t.status, 'platform' AS source
     FROM tags t JOIN kit_tags kt ON kt.tag_id = t.id
     WHERE kt.kit_id = ? AND t.status IN ('active', 'pending')
     ORDER BY kt.tag_type, t.label`,
    kitId,
  );
}

function mapVenueKit(row: VenueKitRow): VenueKit {
  return {
    venueId: row.venue_id,
    venueName: row.venue_name,
    kitId: row.kit_id,
    kitTitle: row.kit_title,
    available: Boolean(row.available),
    updatedAt: row.updated_at,
  };
}

function projectSchedules(projectId: number) {
  return all<{
    id: number;
    project_id: number;
    available_date: string;
    start_time: string;
    end_time: string;
    status: "open" | "full" | "closed";
    note: string;
    created_at: string;
    updated_at: string;
  }>(
    "SELECT * FROM project_schedules WHERE project_id = ? ORDER BY available_date, start_time, id",
    projectId,
  ).map((item): ProjectSchedule => ({
    id: item.id,
    projectId: item.project_id,
    availableDate: item.available_date,
    startTime: item.start_time,
    endTime: item.end_time,
    status: item.status === "open" ? "open" : "closed",
    note: item.note,
    createdAt: item.created_at,
    updatedAt: item.updated_at,
  }));
}

function projectTags(projectId: number) {
  return all<Tag>(
    `SELECT t.id, t.label, t.category, t.status, 'platform' AS source
     FROM tags t JOIN project_tags pt ON pt.tag_id = t.id
     WHERE pt.project_id = ? AND t.status IN ('active', 'pending')
     ORDER BY pt.tag_type, t.category, t.label`,
    projectId,
  );
}

function mapProject(row: ProjectRow): WorkshopProject {
  const representativeKey = row.representative_image_key || String(parseJsonArray(row.fallback_work_keys)[0] || "");
  const coverKey = row.cover_key || representativeKey;
  return {
    id: row.id,
    reference: row.reference,
    creatorId: row.creator_id,
    creatorName: row.creator_name || row.user_name || "TDE新遇官",
    oneLiner: row.one_liner,
    title: row.title,
    description: row.description,
    coverUrl: assetUrl(coverKey),
    coverSource: row.cover_key ? "project" : representativeKey ? "representative" : "none",
    province: row.province,
    city: row.city,
    district: row.district,
    addressHint: row.address_hint,
    startDate: row.start_date,
    endDate: row.end_date,
    noPlan: Boolean(row.no_plan),
    minPeople: row.min_people,
    maxPeople: row.max_people,
    priceCents: row.price_cents,
    durationMinutes: row.duration_minutes,
    primaryCategoryTagId: row.primary_category_tag_id,
    primaryCategoryLabel: row.primary_category_label || "",
    ageRange: row.age_range,
    difficulty: row.difficulty,
    safetyNotes: row.safety_notes,
    operationDraft: normalizeProjectOperationDraft(parseJsonObject(row.operation_draft)),
    selectedForDisplay: Boolean(row.selected_for_display),
    status: row.status,
    reviewNote: row.review_note,
    sortOrder: row.sort_order,
    viewCount: row.view_count,
    consultationCount: row.consultation_count,
    publishedAt: row.published_at,
    schedules: projectSchedules(row.id),
    tags: projectTags(row.id),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function projectQuery(where = "", order = "p.sort_order DESC, p.updated_at DESC") {
  return `SELECT p.*, c.brand_name AS creator_name, c.user_name, primary_tag.label AS primary_category_label,
    COALESCE(a.representative_image_key, '') AS representative_image_key, c.work_keys AS fallback_work_keys
    FROM workshop_projects p
    JOIN creators c ON c.id = p.creator_id
    LEFT JOIN creator_applications a ON a.creator_id = p.creator_id
    LEFT JOIN tags primary_tag ON primary_tag.id = p.primary_category_tag_id
    ${where} ORDER BY ${order}`;
}

function mapBanner(row: BannerRow): HomepageBanner {
  return {
    id: row.id,
    title: row.title,
    subtitle: row.subtitle,
    imageUrl: assetUrl(row.image_key),
    linkType: row.link_type,
    linkValue: row.link_value,
    city: row.city,
    enabled: Boolean(row.enabled),
    sortOrder: row.sort_order,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapSlot(row: SlotRow): HomepageSlot {
  return {
    id: row.id,
    slotKey: row.slot_key,
    contentType: row.content_type,
    contentId: row.content_id,
    titleOverride: row.title_override,
    enabled: Boolean(row.enabled),
    sortOrder: row.sort_order,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    createdByCreatorId: row.created_by_creator_id,
    reviewedByAdmin: row.reviewed_by_admin,
    reviewStatus: row.review_status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function listWorkshopVenues(includeAll = true) {
  const where = includeAll ? "" : "WHERE status = 'published'";
  return all<VenueRow>(`SELECT * FROM venues ${where} ORDER BY sort_order DESC, updated_at DESC`).map(mapVenue);
}

export function listVenueHours(venueId?: number) {
  const where = venueId ? "WHERE venue_id = ?" : "";
  const values = venueId ? [venueId] : [];
  return all<VenueHourRow>(
    `SELECT * FROM venue_hours ${where} ORDER BY venue_id, COALESCE(NULLIF(date_override, ''), '9999-99-99'), weekday, open_time`,
    ...values,
  ).map(mapVenueHour);
}

export function saveWorkshopVenue(input: Record<string, unknown>) {
  const id = Number(input.id || 0);
  const current = id ? one<VenueRow>("SELECT * FROM venues WHERE id = ?", id) : null;
  if (id && !current) throw new Error("体验点不存在");
  const kind = ["store", "popup", "partner", "event"].includes(String(input.kind || current?.kind))
    ? String(input.kind || current?.kind) as WorkshopVenue["kind"]
    : "popup";
  const status = ["draft", "published", "paused", "archived"].includes(String(input.status || current?.status))
    ? String(input.status || current?.status) as WorkshopVenue["status"]
    : "draft";
  const name = cleanText(input.name ?? current?.name, 60);
  const province = cleanText(input.province ?? current?.province, 20);
  const city = cleanText(input.city ?? current?.city, 30);
  const district = cleanText(input.district ?? current?.district, 30);
  const businessArea = cleanText(input.businessArea ?? current?.business_area, 40);
  const address = cleanText(input.address ?? current?.address, 120);
  const routeHint = cleanText(input.routeHint ?? current?.route_hint, 200);
  if (!name) throw new Error("请填写体验点名称");
  if (province && city && !isValidLocation(province, city, district)) throw new Error("请选择有效的省、市、区");
  const safety = contentSafety(name, businessArea, address, routeHint);
  if (safety) throw new Error(safety);
  const latitude = input.latitude === "" || input.latitude === null ? null : Number(input.latitude ?? current?.latitude ?? null);
  const longitude = input.longitude === "" || input.longitude === null ? null : Number(input.longitude ?? current?.longitude ?? null);
  const sortOrder = Number(input.sortOrder ?? current?.sort_order ?? 0) || 0;
  if (current) {
    run(
      `UPDATE venues SET name = ?, kind = ?, province = ?, city = ?, district = ?, business_area = ?,
       address = ?, route_hint = ?, latitude = ?, longitude = ?, status = ?, sort_order = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      name, kind, province, city, district, businessArea, address, routeHint, latitude, longitude, status, sortOrder, id,
    );
  } else {
    run(
      `INSERT INTO venues(reference, name, kind, province, city, district, business_area, address, route_hint, latitude, longitude, status, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      newReference("VD"), name, kind, province, city, district, businessArea, address, routeHint, latitude, longitude, status, sortOrder,
    );
  }
  return listWorkshopVenues().find((item) => item.id === (id || Number(one<{ id: number }>("SELECT last_insert_rowid() AS id")?.id)))!;
}

export function setWorkshopVenueCover(venueId: number, key: string) {
  if (!one("SELECT id FROM venues WHERE id = ?", venueId)) throw new Error("体验点不存在");
  run("UPDATE venues SET cover_key = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", key, venueId);
  return listWorkshopVenues().find((item) => item.id === venueId)!;
}

export function listWorkshopKits(includeAll = true) {
  const where = includeAll ? "" : "WHERE status = 'published'";
  return all<KitRow>(`SELECT * FROM kits ${where} ORDER BY sort_order DESC, updated_at DESC`).map(mapKit);
}

function mapKitGuide(row: KitGuideRow): KitGuide {
  return {
    id: row.id,
    kitId: row.kit_id,
    stepOrder: row.step_order,
    title: row.title,
    body: row.body,
    mediaUrl: assetUrl(row.media_key),
    videoUrl: row.video_url,
    safetyLevel: row.safety_level,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function listKitGuides(kitId?: number) {
  const where = kitId ? "WHERE kit_id = ?" : "";
  return all<KitGuideRow>(
    `SELECT * FROM kit_guides ${where} ORDER BY kit_id, step_order, id`,
    ...(kitId ? [kitId] : []),
  ).map(mapKitGuide);
}

export function saveKitGuide(input: Record<string, unknown>) {
  const id = Number(input.id || 0);
  const current = id ? one<KitGuideRow>("SELECT * FROM kit_guides WHERE id = ?", id) : null;
  if (id && !current) throw new Error("教程步骤不存在");
  const kitId = Number(input.kitId ?? current?.kit_id ?? 0);
  if (!one("SELECT id FROM kits WHERE id = ?", kitId)) throw new Error("材料包不存在");
  const stepOrder = Math.max(1, Math.min(99, Math.round(Number(input.stepOrder ?? current?.step_order ?? 1) || 1)));
  const title = cleanText(input.title ?? current?.title, 60);
  const body = cleanText(input.body ?? current?.body, 600);
  const videoUrl = cleanText(input.videoUrl ?? current?.video_url, 500);
  const safetyLevel = ["normal", "notice", "warning"].includes(String(input.safetyLevel ?? current?.safety_level))
    ? String(input.safetyLevel ?? current?.safety_level) as KitGuide["safetyLevel"]
    : "normal";
  if (!title || !body) throw new Error("请填写步骤标题和操作说明");
  const safety = contentSafety(title, body, videoUrl);
  if (safety) throw new Error(safety);
  if (current) {
    run(
      `UPDATE kit_guides SET kit_id = ?, step_order = ?, title = ?, body = ?, video_url = ?,
       safety_level = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      kitId, stepOrder, title, body, videoUrl, safetyLevel, id,
    );
  } else {
    run(
      `INSERT INTO kit_guides(kit_id, step_order, title, body, video_url, safety_level)
       VALUES (?, ?, ?, ?, ?, ?)`,
      kitId, stepOrder, title, body, videoUrl, safetyLevel,
    );
  }
  const savedId = id || Number(one<{ id: number }>("SELECT last_insert_rowid() AS id")?.id || 0);
  return listKitGuides(kitId).find((item) => item.id === savedId)!;
}

function mapVenueRule(row: VenueRuleRow): VenueRule {
  return {
    id: row.id,
    venueId: row.venue_id,
    stepOrder: row.step_order,
    title: row.title,
    body: row.body,
    linkUrl: row.link_url,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function listVenueRules(venueId?: number) {
  const where = venueId ? "WHERE venue_id = ?" : "";
  return all<VenueRuleRow>(
    `SELECT * FROM venue_rules ${where} ORDER BY venue_id, step_order, id`,
    ...(venueId ? [venueId] : []),
  ).map(mapVenueRule);
}

export function saveVenueRule(input: Record<string, unknown>) {
  const id = Number(input.id || 0);
  const current = id ? one<VenueRuleRow>("SELECT * FROM venue_rules WHERE id = ?", id) : null;
  if (id && !current) throw new Error("店内规范不存在");
  const venueId = Number(input.venueId ?? current?.venue_id ?? 0);
  if (!one("SELECT id FROM venues WHERE id = ?", venueId)) throw new Error("体验点不存在");
  const stepOrder = Math.max(1, Math.min(99, Math.round(Number(input.stepOrder ?? current?.step_order ?? 1) || 1)));
  const title = cleanText(input.title ?? current?.title, 60);
  const body = cleanText(input.body ?? current?.body, 600);
  const linkUrl = cleanText(input.linkUrl ?? current?.link_url, 500);
  if (!title || !body) throw new Error("请填写规范标题和内容");
  if (linkUrl && !/^https?:\/\//i.test(linkUrl)) throw new Error("请填写有效的规范链接");
  const safety = contentSafety(title, body, linkUrl);
  if (safety) throw new Error(safety);
  if (current) {
    run(
      `UPDATE venue_rules SET venue_id = ?, step_order = ?, title = ?, body = ?, link_url = ?,
       updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      venueId, stepOrder, title, body, linkUrl, id,
    );
  } else {
    run(
      `INSERT INTO venue_rules(venue_id, step_order, title, body, link_url) VALUES (?, ?, ?, ?, ?)`,
      venueId, stepOrder, title, body, linkUrl,
    );
  }
  const savedId = id || Number(one<{ id: number }>("SELECT last_insert_rowid() AS id")?.id || 0);
  return listVenueRules(venueId).find((item) => item.id === savedId)!;
}

function mapSupportTicket(row: SupportTicketRow): SupportTicket {
  return {
    id: row.id,
    reference: row.reference,
    consumerId: row.consumer_id,
    venueId: row.venue_id,
    venueName: row.venue_name || "",
    kitId: row.kit_id,
    kitTitle: row.kit_title || "",
    subject: row.subject,
    body: row.body,
    status: row.status,
    handledBy: row.handled_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function listSupportTickets(limit = 100) {
  return all<SupportTicketRow>(
    `SELECT s.*, v.name AS venue_name, k.title AS kit_title
     FROM support_tickets s
     LEFT JOIN venues v ON v.id = s.venue_id
     LEFT JOIN kits k ON k.id = s.kit_id
     ORDER BY CASE s.status WHEN 'open' THEN 0 WHEN 'processing' THEN 1 ELSE 2 END, s.created_at DESC
     LIMIT ?`,
    Math.max(1, Math.min(500, limit)),
  ).map(mapSupportTicket);
}

export function createSupportTicket(consumerId: number, input: Record<string, unknown>) {
  if (!one("SELECT id FROM consumer_accounts WHERE id = ?", consumerId)) throw new Error("用户不存在");
  const venueId = Number(input.venueId || 0) || null;
  const kitId = Number(input.kitId || 0) || null;
  if (venueId && !one("SELECT id FROM venues WHERE id = ?", venueId)) throw new Error("体验点不存在");
  if (kitId && !one("SELECT id FROM kits WHERE id = ?", kitId)) throw new Error("材料包不存在");
  const allowedSubjects = ["教程看不懂", "材料缺失", "安全问题", "其他问题"];
  const subject = allowedSubjects.includes(String(input.subject)) ? String(input.subject) : "其他问题";
  const body = cleanText(input.body || subject, 500);
  const safety = contentSafety(subject, body);
  if (safety) throw new Error(safety);
  const id = Number(run(
    `INSERT INTO support_tickets(reference, consumer_id, venue_id, kit_id, subject, body)
     VALUES (?, ?, ?, ?, ?, ?)`,
    newReference("WT"), consumerId, venueId, kitId, subject, body,
  ).lastInsertRowid);
  return listSupportTickets(500).find((item) => item.id === id)!;
}

export function updateSupportTicket(id: number, statusInput: unknown, handledByInput: unknown) {
  const status = ["open", "processing", "resolved", "closed"].includes(String(statusInput))
    ? String(statusInput) as SupportTicket["status"]
    : "open";
  const handledBy = cleanText(handledByInput, 80);
  const result = run(
    "UPDATE support_tickets SET status = ?, handled_by = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
    status, handledBy, id,
  );
  if (!result.changes) throw new Error("问题反馈不存在");
  return listSupportTickets(500).find((item) => item.id === id)!;
}

export function listVenueKits(venueId?: number) {
  const where = venueId ? "WHERE vk.venue_id = ?" : "";
  const values = venueId ? [venueId] : [];
  return all<VenueKitRow>(
    `SELECT vk.*, v.name AS venue_name, k.title AS kit_title
     FROM venue_kits vk
     JOIN venues v ON v.id = vk.venue_id
     JOIN kits k ON k.id = vk.kit_id
     ${where}
     ORDER BY v.sort_order DESC, v.updated_at DESC, k.sort_order DESC, k.updated_at DESC`,
    ...values,
  ).map(mapVenueKit);
}

export function saveWorkshopKit(input: Record<string, unknown>) {
  const id = Number(input.id || 0);
  const current = id ? one<KitRow>("SELECT * FROM kits WHERE id = ?", id) : null;
  if (id && !current) throw new Error("材料包不存在");
  const status = ["draft", "published", "paused", "archived"].includes(String(input.status || current?.status))
    ? String(input.status || current?.status) as WorkshopKit["status"]
    : "draft";
  const difficulty = ["easy", "medium", "hard"].includes(String(input.difficulty || current?.difficulty))
    ? String(input.difficulty || current?.difficulty) as WorkshopKit["difficulty"]
    : "easy";
  const messLevel = ["low", "medium", "high"].includes(String(input.messLevel || current?.mess_level))
    ? String(input.messLevel || current?.mess_level) as WorkshopKit["messLevel"]
    : "low";
  const guidanceType = ["self", "staff", "video", "creator"].includes(String(input.guidanceType || current?.guidance_type))
    ? String(input.guidanceType || current?.guidance_type) as WorkshopKit["guidanceType"]
    : "self";
  const title = cleanText(input.title ?? current?.title, 80);
  const subtitle = cleanText(input.subtitle ?? current?.subtitle, 100);
  const description = cleanText(input.description ?? current?.description, 1000);
  const ageRange = cleanText(input.ageRange ?? current?.age_range, 40);
  const safetyNotes = cleanText(input.safetyNotes ?? current?.safety_notes, 500);
  if (!title) throw new Error("请填写材料包名称");
  const safety = contentSafety(title, subtitle, description, ageRange, safetyNotes);
  if (safety) throw new Error(safety);
  const priceCents = Math.max(0, Math.round(Number(input.priceCents ?? current?.price_cents ?? 0) || 0));
  const durationMinutes = Math.max(0, Math.round(Number(input.durationMinutes ?? current?.duration_minutes ?? 0) || 0));
  const sortOrder = Number(input.sortOrder ?? current?.sort_order ?? 0) || 0;
  const db = getDb();
  db.exec("BEGIN IMMEDIATE");
  try {
  let kitId = id;
  if (current) {
    run(
      `UPDATE kits SET title = ?, subtitle = ?, description = ?, price_cents = ?, age_range = ?, duration_minutes = ?,
       difficulty = ?, mess_level = ?, guidance_type = ?, safety_notes = ?, status = ?, sort_order = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      title, subtitle, description, priceCents, ageRange, durationMinutes, difficulty, messLevel, guidanceType, safetyNotes, status, sortOrder, id,
    );
  } else {
    kitId = Number(db.prepare(
      `INSERT INTO kits(reference, title, subtitle, description, price_cents, age_range, duration_minutes,
       difficulty, mess_level, guidance_type, safety_notes, status, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      newReference("KB"), title, subtitle, description, priceCents, ageRange, durationMinutes,
      difficulty, messLevel, guidanceType, safetyNotes, status, sortOrder,
    ).lastInsertRowid);
  }
  if (Array.isArray(input.tagIds)) {
    const tagIds = [...new Set<number>(input.tagIds.map(Number).filter((value: number) => Number.isInteger(value)))];
    db.prepare("DELETE FROM kit_tags WHERE kit_id = ?").run(kitId);
    const tags = tagIds.length
      ? all<{ id: number; label: string }>(`SELECT id, label FROM tags WHERE id IN (${tagIds.map(() => "?").join(",")}) AND status = 'active'`, ...tagIds)
      : [];
    const insert = db.prepare("INSERT OR IGNORE INTO kit_tags(kit_id, tag_id, tag_type) VALUES (?, ?, ?)");
    for (const tag of tags) {
      const type = projectSceneTags.includes(tag.label as (typeof projectSceneTags)[number]) ? "scene"
        : projectPlatformTags.includes(tag.label as (typeof projectPlatformTags)[number]) ? "platform" : "operation";
      insert.run(kitId, tag.id, type);
    }
  }
  db.exec("COMMIT");
  return listWorkshopKits().find((item) => item.id === kitId)!;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function setWorkshopKitCover(kitId: number, key: string) {
  if (!one("SELECT id FROM kits WHERE id = ?", kitId)) throw new Error("材料包不存在");
  run("UPDATE kits SET cover_key = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", key, kitId);
  return listWorkshopKits().find((item) => item.id === kitId)!;
}

export function linkVenueKit(input: Record<string, unknown>) {
  const venueId = Number(input.venueId || 0);
  const kitId = Number(input.kitId || 0);
  if (!one("SELECT id FROM venues WHERE id = ?", venueId)) throw new Error("体验点不存在");
  if (!one("SELECT id FROM kits WHERE id = ?", kitId)) throw new Error("材料包不存在");
  // venue_kits now represents availability only; legacy numeric fields remain for migration compatibility.
  const stock = 1;
  const pointsReward = 0;
  run(
    `INSERT INTO venue_kits(venue_id, kit_id, stock, available, points_reward, updated_at)
     VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(venue_id, kit_id) DO UPDATE SET stock = excluded.stock, available = excluded.available,
     points_reward = excluded.points_reward, updated_at = CURRENT_TIMESTAMP`,
    venueId, kitId, stock, input.available === false ? 0 : 1, pointsReward,
  );
  return { venueId, kitId, available: input.available !== false };
}

export function saveVenueHour(input: Record<string, unknown>) {
  const id = Number(input.id || 0);
  const current = id ? one<VenueHourRow>("SELECT * FROM venue_hours WHERE id = ?", id) : null;
  if (id && !current) throw new Error("营业时间不存在");
  const venueId = Number(input.venueId ?? current?.venue_id ?? 0);
  if (!one("SELECT id FROM venues WHERE id = ?", venueId)) throw new Error("体验点不存在");
  const dateOverride = cleanText(input.dateOverride ?? current?.date_override, 10);
  const weekdayInput = input.weekday ?? current?.weekday;
  const weekday = dateOverride ? null : Math.max(0, Math.min(6, Number(weekdayInput ?? 0)));
  const openTime = cleanText(input.openTime ?? current?.open_time, 5);
  const closeTime = cleanText(input.closeTime ?? current?.close_time, 5);
  const closed = input.closed === undefined ? Boolean(current?.closed) : input.closed === true;
  const note = cleanText(input.note ?? current?.note, 120);
  if (dateOverride && !validDate(dateOverride)) throw new Error("请选择有效日期");
  if (!closed && (!/^\d{2}:\d{2}$/.test(openTime) || !/^\d{2}:\d{2}$/.test(closeTime) || openTime >= closeTime))
    throw new Error("请填写正确的营业时间");
  const safety = contentSafety(note);
  if (safety) throw new Error(safety);
  if (current) {
    run(
      `UPDATE venue_hours SET venue_id = ?, weekday = ?, date_override = ?, open_time = ?, close_time = ?,
       closed = ?, note = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      venueId, weekday, dateOverride, openTime, closeTime, closed ? 1 : 0, note, id,
    );
  } else {
    run(
      `INSERT INTO venue_hours(venue_id, weekday, date_override, open_time, close_time, closed, note)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      venueId, weekday, dateOverride, openTime, closeTime, closed ? 1 : 0, note,
    );
  }
  return listVenueHours(venueId).find((item) => item.id === (id || Number(one<{ id: number }>("SELECT last_insert_rowid() AS id")?.id)))!;
}

export function listWorkshopProjects(principal?: AdminPrincipal, includeAll = true) {
  const clauses: string[] = [];
  const values: Array<string | number> = [];
  if (!includeAll) {
    clauses.push("p.status = 'published'");
    clauses.push("p.selected_for_display = 1");
    // Legacy published projects stay discoverable while their cover and WeCom entry are migrated.
    clauses.push("(NOT EXISTS (SELECT 1 FROM creator_applications ca WHERE ca.creator_id = p.creator_id) OR EXISTS (SELECT 1 FROM creator_applications ca WHERE ca.creator_id = p.creator_id AND ca.status = 'active'))");
  }
  if (principal?.role === "subadmin") {
    clauses.push("c.manager_admin_id = ?");
    values.push(principal.id || 0);
  }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  return all<ProjectRow>(projectQuery(where), ...values).map(mapProject);
}

export function saveWorkshopProject(creatorId: number, input: Record<string, unknown>, principal?: AdminPrincipal) {
  const creator = getCreator(creatorId);
  if (!creator) throw new Error("TDE新遇官不存在");
  if (principal?.role === "subadmin" && creator.managerAdminId !== principal.id) throw new Error("该账号不能管理此新遇官");
  const id = Number(input.id || 0);
  const current = id ? one<ProjectRow>("SELECT p.*, '' AS creator_name, '' AS user_name, NULL AS primary_category_label, '' AS representative_image_key, '[]' AS fallback_work_keys FROM workshop_projects p WHERE id = ?", id) : null;
  if (id && (!current || current.creator_id !== creatorId)) throw new Error("体验不存在或不能修改");
  const requestedStatus = ["draft", "pending", "published", "paused", "archived", "rejected"].includes(String(input.status || current?.status))
    ? String(input.status || current?.status) as WorkshopProjectStatus
    : principal?.role === "super" ? "published" : "pending";
  const schedulesInput = normalizeProjectSchedules(input.schedules);
  const scheduleDates = schedulesInput?.map((item) => item.availableDate).sort() || [];
  const requestedNoPlan = input.noPlan === undefined ? Boolean(current?.no_plan) : input.noPlan === true;
  const noPlan = schedulesInput?.length ? false : requestedNoPlan;
  const oneLiner = cleanText(input.oneLiner ?? current?.one_liner ?? (noPlan ? creator.brandName || "近期体验" : ""), 80);
  const title = cleanText(input.title ?? current?.title ?? oneLiner, 80);
  const description = cleanText(input.description ?? current?.description, 2000);
  const province = cleanText(input.province ?? current?.province ?? creator.province, 20);
  const city = cleanText(input.city ?? current?.city ?? creator.city, 30);
  const district = cleanText(input.district ?? current?.district ?? creator.district, 30);
  const addressHint = cleanText(input.addressHint ?? current?.address_hint, 120);
  const startDate = noPlan ? "" : scheduleDates[0] || cleanText(input.startDate ?? current?.start_date, 10);
  const endDate = noPlan ? "" : scheduleDates.at(-1) || cleanText(input.endDate ?? current?.end_date ?? startDate, 10);
  const reviewNote = cleanText(input.reviewNote ?? current?.review_note, 300);
  const ageRange = cleanText(input.ageRange ?? current?.age_range, 40);
  const difficulty = ["easy", "medium", "hard"].includes(String(input.difficulty ?? current?.difficulty))
    ? String(input.difficulty ?? current?.difficulty) as WorkshopProject["difficulty"]
    : "easy";
  const safetyNotes = cleanText(input.safetyNotes ?? current?.safety_notes, 500);
  const operationDraft = input.operationDraft === undefined
    ? normalizeProjectOperationDraft(parseJsonObject(current?.operation_draft || null))
    : normalizeProjectOperationDraft(input.operationDraft);
  if (!oneLiner || !city) throw new Error("请填写一句话体验和城市");
  if (!noPlan && (!validDate(startDate) || !validDate(endDate) || startDate > endDate))
    throw new Error("请选择正确的活动起止日期");
  if (province && city && !isValidLocation(province, city, district)) throw new Error("请选择有效的省、市、区");
  const safety = contentSafety(oneLiner, title, description, addressHint, ageRange, safetyNotes, reviewNote);
  if (safety) throw new Error(safety);
  const minPeople = Math.max(1, Math.min(99, Math.round(Number(input.minPeople ?? current?.min_people ?? 1) || 1)));
  const maxPeople = Math.max(minPeople, Math.min(99, Math.round(Number(input.maxPeople ?? current?.max_people ?? minPeople) || minPeople)));
  const priceCents = Math.max(0, Math.round(Number(input.priceCents ?? current?.price_cents ?? 0) || 0));
  const durationMinutes = Math.max(0, Math.round(Number(input.durationMinutes ?? current?.duration_minutes ?? 0) || 0));
  const hasSelectedProject = Boolean(one(
    "SELECT id FROM workshop_projects WHERE creator_id = ? AND selected_for_display = 1 AND id != ? LIMIT 1",
    creatorId,
    id,
  ));
  const selectedForDisplay = requestedStatus === "archived"
    ? false
    : input.selectedForDisplay === undefined
      ? current ? Boolean(current.selected_for_display) : !hasSelectedProject
      : input.selectedForDisplay === true;
  const sortOrder = principal ? Number(input.sortOrder ?? current?.sort_order ?? 0) || 0 : current?.sort_order || 0;
  const tagIds = Array.isArray(input.tagIds)
    ? [...new Set(input.tagIds.map(Number).filter(Number.isInteger))].slice(0, 24)
    : [];
  const currentTagIds = current
    ? projectTags(id)
        .filter((tag) => principal?.role === "super" || !["项目运营", "平台运营"].includes(tag.category))
        .map((tag) => tag.id)
        .sort((a, b) => a - b)
    : [];
  const nextTagIds = Array.isArray(input.tagIds) ? [...tagIds].sort((a, b) => a - b) : currentTagIds;
  const majorChanged = !current
    || oneLiner !== current.one_liner || title !== current.title || description !== current.description
    || province !== current.province || city !== current.city || district !== current.district || addressHint !== current.address_hint
    || minPeople !== current.min_people || maxPeople !== current.max_people || priceCents !== current.price_cents
    || durationMinutes !== current.duration_minutes || ageRange !== current.age_range || difficulty !== current.difficulty
    || safetyNotes !== current.safety_notes || currentTagIds.join(",") !== nextTagIds.join(",");
  const application = one<{ status: string }>("SELECT status FROM creator_applications WHERE creator_id = ?", creatorId);
  const status: WorkshopProjectStatus = !principal && application && application.status !== "active"
    ? "draft"
    : principal?.role === "super"
      ? requestedStatus
      : requestedStatus === "archived"
        ? "archived"
        : !principal && current && !majorChanged && ["published", "paused"].includes(current.status)
          ? "published"
          : "pending";
  if (status === "published" && application && application.status !== "active") throw new Error("新遇官申请通过后才能发布体验");
  if (!principal && application?.status === "active" && noPlan)
    throw new Error("请至少填写一个可体验日期后再提交体验");
  const activeCount = Number(one<{ count: number }>(
    "SELECT COUNT(*) AS count FROM workshop_projects WHERE creator_id = ? AND status != 'archived' AND id != ?",
    creatorId,
    id,
  )?.count || 0);
  if (!id && activeCount >= 20) throw new Error("最多保留20个体验");
  const db = getDb();
  db.exec("BEGIN IMMEDIATE");
  try {
    let projectId = id;
    if (selectedForDisplay)
      db.prepare("UPDATE workshop_projects SET selected_for_display = 0 WHERE creator_id = ? AND id != ?").run(creatorId, id);
    if (current) {
      db.prepare(
        `UPDATE workshop_projects SET one_liner = ?, title = ?, description = ?, province = ?, city = ?, district = ?,
         address_hint = ?, start_date = ?, end_date = ?, no_plan = ?, min_people = ?, max_people = ?, price_cents = ?, duration_minutes = ?,
         primary_category_tag_id = ?, age_range = ?, difficulty = ?, safety_notes = ?, operation_draft = ?, selected_for_display = ?, status = ?,
         review_note = ?, sort_order = ?, published_at = CASE WHEN ? = 'published' THEN COALESCE(published_at, CURRENT_TIMESTAMP) ELSE published_at END,
         updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      ).run(oneLiner, title, description, province, city, district, addressHint, startDate, endDate, noPlan ? 1 : 0, minPeople, maxPeople, priceCents,
        durationMinutes, current.primary_category_tag_id, ageRange, difficulty, safetyNotes, JSON.stringify(operationDraft), selectedForDisplay ? 1 : 0, status,
        reviewNote, sortOrder, status, id);
    } else {
      projectId = Number(db.prepare(
        `INSERT INTO workshop_projects(reference, creator_id, one_liner, title, description, province, city, district,
         address_hint, start_date, end_date, no_plan, min_people, max_people, price_cents, duration_minutes,
         primary_category_tag_id, age_range, difficulty, safety_notes, operation_draft, selected_for_display, status, review_note, sort_order, published_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(newReference("PW"), creatorId, oneLiner, title, description, province, city, district, addressHint, startDate, endDate, noPlan ? 1 : 0,
        minPeople, maxPeople, priceCents, durationMinutes, null, ageRange, difficulty, safetyNotes, JSON.stringify(operationDraft),
        selectedForDisplay ? 1 : 0, status, reviewNote, sortOrder, status === "published" ? new Date().toISOString() : null).lastInsertRowid);
    }
    if (Array.isArray(input.tagIds)) {
      const requestedTagRows = tagIds.length
        ? all<{ id: number; label: string; category: string }>(`SELECT id, label, category FROM tags WHERE id IN (${tagIds.map(() => "?").join(",")}) AND status = 'active'`, ...tagIds)
        : [];
      const creatorProjectCategories = ["我的作品", "我的客群", "我的风格", "现场体验"];
      const allowedCategories = [...creatorProjectCategories, "项目场景", "项目运营", "平台运营"];
      if (requestedTagRows.length !== tagIds.length || requestedTagRows.some((tag) => !allowedCategories.includes(tag.category)))
        throw new Error("体验包含不可用标签");
      if (requestedTagRows.some((tag) => tag.category === "项目运营"))
        throw new Error("推荐栏目需要单独申请并由平台审核");
      if (principal?.role !== "super" && requestedTagRows.some((tag) => tag.category === "平台运营"))
        throw new Error("平台精选标签只能由超级管理员设置");
      const approvedTagIds = approvedCreatorProjectTagIds(creatorId);
      if (requestedTagRows.some((tag) => creatorProjectCategories.includes(tag.category) && !approvedTagIds.has(tag.id)))
        throw new Error("体验只能使用该新遇官申请中已经审核通过的标签");
      const protectedOperationIds = current
        ? projectTags(id).filter((tag) => tag.category === "项目运营").map((tag) => tag.id)
        : [];
      const effectiveTagIds = [...new Set([...tagIds, ...protectedOperationIds])];
      const tagRows = effectiveTagIds.length
        ? all<{ id: number; label: string; category: string }>(`SELECT id, label, category FROM tags WHERE id IN (${effectiveTagIds.map(() => "?").join(",")}) AND status = 'active'`, ...effectiveTagIds)
        : [];
      const tagRowsById = new Map(tagRows.map((tag) => [tag.id, tag]));
      const primaryCategoryTagId = effectiveTagIds.find((tagId) => tagRowsById.get(tagId)?.category === "我的作品") || null;
      db.prepare("UPDATE workshop_projects SET primary_category_tag_id = ? WHERE id = ?").run(primaryCategoryTagId, projectId);
      if (principal?.role === "super") db.prepare("DELETE FROM project_tags WHERE project_id = ?").run(projectId);
      else db.prepare("DELETE FROM project_tags WHERE project_id = ? AND tag_id NOT IN (SELECT id FROM tags WHERE category IN ('项目运营', '平台运营'))").run(projectId);
      const insertTag = db.prepare(
        "INSERT OR IGNORE INTO project_tags(project_id, tag_id, tag_type) SELECT ?, id, ? FROM tags WHERE id = ? AND status = 'active'",
      );
      for (const tag of tagRows) {
        const type = tag.category === "项目场景"
          ? "scene"
          : ["项目运营", "平台运营"].includes(tag.category) ? "operation" : "interest";
        insertTag.run(projectId, type, tag.id);
      }
    }
    if (schedulesInput !== null) {
      db.prepare("DELETE FROM project_schedules WHERE project_id = ?").run(projectId);
      const insertSchedule = db.prepare(
        `INSERT INTO project_schedules(project_id, available_date, start_time, end_time, capacity, status, note)
         VALUES (?, ?, ?, ?, 1, 'open', ?)`,
      );
      for (const schedule of schedulesInput)
        insertSchedule.run(projectId, schedule.availableDate, schedule.startTime, schedule.endTime, schedule.note);
    }
    if (status === "published") {
      const project = db.prepare(
        `SELECT p.cover_key, p.start_date, p.end_date, COALESCE(a.representative_image_key, '') AS representative_image_key,
          c.work_keys AS fallback_work_keys
         FROM workshop_projects p JOIN creators c ON c.id = p.creator_id
         LEFT JOIN creator_applications a ON a.creator_id = p.creator_id WHERE p.id = ?`,
      ).get(projectId) as
        | { cover_key: string | null; start_date: string; end_date: string; representative_image_key: string; fallback_work_keys: string }
        | undefined;
      if (!project) throw new Error("体验不存在");
      const representativeKey = project.representative_image_key || String(parseJsonArray(project.fallback_work_keys)[0] || "");
      if (!project.cover_key && !representativeKey) throw new Error("体验发布前必须上传体验项目封面或申请代表图");
      const today = currentShanghaiDate();
      const hasFutureSchedule = Boolean(db.prepare(
        "SELECT id FROM project_schedules WHERE project_id = ? AND status = 'open' AND available_date >= ? LIMIT 1",
      ).get(projectId, today));
      if (!hasFutureSchedule && (!project.end_date || project.end_date < today))
        throw new Error("体验发布前必须至少有一个未来可体验日期");
      const contact = db.prepare(
        `SELECT status, phone, public_authorized, phone_public_authorized
         FROM creator_applications WHERE creator_id = ?`,
      ).get(creatorId) as
        | { status: string; phone: string; public_authorized: number; phone_public_authorized: number }
        | undefined;
      if (!contact || contact.status !== "active" || !contact.public_authorized
        || !contact.phone_public_authorized || !validPhone(contact.phone))
        throw new Error("体验发布前必须由新遇官授权公开注册手机号");
    }
    db.exec("COMMIT");
    const project = listWorkshopProjects(principal).find((item) => item.id === projectId)!;
    if ((!principal && status === "pending" && majorChanged) || (principal && current?.status !== status)) {
      const thread = ensureReviewThread({
        entityType: "project",
        entityId: projectId,
        creatorId,
        subject: `体验审核｜${project.oneLiner}`,
      });
      if (!principal) addCreatorReviewSubmission(thread.id, creatorId, current ? "我已修改体验并重新提交审核。" : "我已提交新的体验，请审核。");
      else {
        const statusLabel = status === "published" ? "已审核通过并发布" : status === "rejected" ? "审核未通过" : status === "paused" ? "已暂停" : status === "archived" ? "已归档" : "状态已更新为待审核";
        addReviewStatusMessage(thread.id, principal, reviewNote ? `${statusLabel}：${reviewNote}` : statusLabel, ["published", "rejected", "archived"].includes(status));
      }
    }
    return project;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function setWorkshopProjectCover(projectId: number, key: string, principal?: AdminPrincipal) {
  const project = one<{ creator_id: number; status: WorkshopProjectStatus }>("SELECT creator_id, status FROM workshop_projects WHERE id = ?", projectId);
  if (!project) throw new Error("体验不存在");
  const creator = getCreator(project.creator_id);
  if (!creator) throw new Error("TDE新遇官不存在");
  if (principal?.role === "subadmin" && creator.managerAdminId !== principal.id) throw new Error("该账号不能管理此新遇官");
  const application = one<{ status: string }>("SELECT status FROM creator_applications WHERE creator_id = ?", project.creator_id);
  const status = principal?.role === "super"
    ? project.status
    : application && application.status !== "active"
      ? "draft"
      : "pending";
  run("UPDATE workshop_projects SET cover_key = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", key, status, projectId);
  return listWorkshopProjects(principal).find((item) => item.id === projectId)!;
}

export function saveProjectSchedule(projectId: number, input: Record<string, unknown>, principal?: AdminPrincipal) {
  const project = one<{ id: number; creator_id: number }>("SELECT id, creator_id FROM workshop_projects WHERE id = ?", projectId);
  if (!project) throw new Error("体验不存在");
  const creator = getCreator(project.creator_id);
  if (!creator) throw new Error("TDE新遇官不存在");
  if (principal?.role === "subadmin" && creator.managerAdminId !== principal.id) throw new Error("该账号不能管理此新遇官");
  const id = Number(input.id || 0);
  const current = id ? one<{
    id: number;
    project_id: number;
    available_date: string;
    start_time: string;
    end_time: string;
    status: "open" | "full" | "closed";
    note: string;
  }>("SELECT * FROM project_schedules WHERE id = ?", id) : null;
  if (id && (!current || current.project_id !== projectId)) throw new Error("体验日期不存在或不能修改");
  const availableDate = cleanText(input.availableDate ?? current?.available_date, 10);
  const startTime = cleanText(input.startTime ?? current?.start_time, 5);
  const endTime = cleanText(input.endTime ?? current?.end_time, 5);
  if (!validDate(availableDate)) throw new Error("请选择有效体验日期");
  if ((startTime || endTime) && (!/^\d{2}:\d{2}$/.test(startTime) || !/^\d{2}:\d{2}$/.test(endTime) || startTime >= endTime))
    throw new Error("请填写正确的体验时间");
  const status = String(input.status ?? current?.status) === "closed" ? "closed" : "open";
  const note = cleanText(input.note ?? current?.note, 120);
  const safety = contentSafety(note);
  if (safety) throw new Error(safety);
  if (current) {
    run(
      `UPDATE project_schedules SET available_date = ?, start_time = ?, end_time = ?, capacity = ?,
       reserved_count = ?, status = ?, note = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      availableDate, startTime, endTime, 1, 0, status, note, id,
    );
  } else {
    run(
      `INSERT INTO project_schedules(project_id, available_date, start_time, end_time, capacity, reserved_count, status, note)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      projectId, availableDate, startTime, endTime, 1, 0, status, note,
    );
  }
  return projectSchedules(projectId).find((item) => item.id === (id || Number(one<{ id: number }>("SELECT last_insert_rowid() AS id")?.id)))!;
}

export function listHomepageBanners(includeAll = true) {
  const where = includeAll ? "" : "WHERE enabled = 1";
  return all<BannerRow>(`SELECT * FROM homepage_banners ${where} ORDER BY sort_order DESC, updated_at DESC`).map(mapBanner);
}

export function saveHomepageBanner(input: Record<string, unknown>) {
  const id = Number(input.id || 0);
  const current = id ? one<BannerRow>("SELECT * FROM homepage_banners WHERE id = ?", id) : null;
  if (id && !current) throw new Error("Banner 不存在");
  const linkType = ["none", "kit", "venue", "project", "topic", "url"].includes(String(input.linkType || current?.link_type))
    ? String(input.linkType || current?.link_type) as HomepageBanner["linkType"]
    : "none";
  const title = cleanText(input.title ?? current?.title, 80);
  const subtitle = cleanText(input.subtitle ?? current?.subtitle, 120);
  const linkValue = cleanText(input.linkValue ?? current?.link_value, 240);
  const city = cleanText(input.city ?? current?.city, 30);
  const safety = contentSafety(title, subtitle, linkValue, city);
  if (safety) throw new Error(safety);
  const sortOrder = Number(input.sortOrder ?? current?.sort_order ?? 0) || 0;
  const startsAt = cleanText(input.startsAt ?? current?.starts_at, 30) || null;
  const endsAt = cleanText(input.endsAt ?? current?.ends_at, 30) || null;
  if (current) {
    run(
      `UPDATE homepage_banners SET title = ?, subtitle = ?, link_type = ?, link_value = ?, city = ?,
       enabled = ?, sort_order = ?, starts_at = ?, ends_at = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      title, subtitle, linkType, linkValue, city, input.enabled === false ? 0 : 1, sortOrder, startsAt, endsAt, id,
    );
  } else {
    run(
      `INSERT INTO homepage_banners(title, subtitle, link_type, link_value, city, enabled, sort_order, starts_at, ends_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      title, subtitle, linkType, linkValue, city, input.enabled === false ? 0 : 1, sortOrder, startsAt, endsAt,
    );
  }
  return listHomepageBanners().find((item) => item.id === (id || Number(one<{ id: number }>("SELECT last_insert_rowid() AS id")?.id)))!;
}

export function setHomepageBannerImage(bannerId: number, key: string) {
  if (!one("SELECT id FROM homepage_banners WHERE id = ?", bannerId)) throw new Error("Banner 不存在");
  run("UPDATE homepage_banners SET image_key = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", key, bannerId);
  return listHomepageBanners().find((item) => item.id === bannerId)!;
}

export function listHomepageSlots(includeAll = true) {
  const where = includeAll ? "" : "WHERE enabled = 1 AND review_status = 'approved'";
  return all<SlotRow>(`SELECT * FROM homepage_slots ${where} ORDER BY slot_key, sort_order DESC, updated_at DESC`).map(mapSlot);
}

function operationRequestQuery(where = "") {
  return `SELECT r.*, p.one_liner AS project_title, p.max_people,
    COALESCE(NULLIF(c.brand_name, ''), NULLIF(c.user_name, ''), 'TDE新遇官') AS creator_name,
    (SELECT id FROM review_threads rt WHERE rt.entity_type = 'operation_request' AND rt.entity_id = r.id) AS review_thread_id
    FROM project_operation_requests r
    JOIN workshop_projects p ON p.id = r.project_id
    JOIN creators c ON c.id = r.creator_id
    ${where}`;
}

function mapOperationRequest(row: OperationRequestRow): ProjectOperationRequest {
  return {
    id: row.id,
    projectId: row.project_id,
    projectTitle: row.project_title,
    maxPeople: row.max_people,
    creatorId: row.creator_id,
    creatorName: row.creator_name,
    requestType: row.request_type,
    ruleAcknowledged: Boolean(row.rule_acknowledged),
    reason: row.reason,
    quantityNote: row.quantity_note,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    status: row.status,
    reviewNote: row.review_note,
    reviewedBy: row.reviewed_by,
    reviewedAt: row.reviewed_at,
    reviewThreadId: row.review_thread_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function operationTagLabel(type: ProjectOperationRequest["requestType"]) {
  return type === "first_launch" ? "首发尝鲜" : "限时限量";
}

function projectScheduleWindow(projectId: number) {
  const dates = one<{ starts_on: string | null; ends_on: string | null }>(
    `SELECT MIN(available_date) AS starts_on, MAX(available_date) AS ends_on
     FROM project_schedules WHERE project_id = ? AND status = 'open'`,
    projectId,
  );
  if (!dates?.starts_on || !dates.ends_on || !validDate(dates.starts_on) || !validDate(dates.ends_on)) return null;
  return {
    startsOn: dates.starts_on,
    endsOn: dates.ends_on,
    startsAt: new Date(`${dates.starts_on}T00:00:00.000+08:00`).toISOString(),
    endsAt: new Date(`${dates.ends_on}T23:59:59.999+08:00`).toISOString(),
  };
}

function expireProjectOperationRequests() {
  const limited = all<{ id: number; project_id: number; status: ProjectOperationRequest["status"]; starts_at: string | null; ends_at: string | null }>(
    `SELECT id, project_id, status, starts_at, ends_at FROM project_operation_requests
     WHERE request_type = 'limited' AND status IN ('pending', 'approved')`,
  );
  for (const item of limited) {
    const window = projectScheduleWindow(item.project_id);
    if (window) {
      if (item.starts_at !== window.startsAt || item.ends_at !== window.endsAt) {
        run(
          "UPDATE project_operation_requests SET starts_at = ?, ends_at = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
          window.startsAt,
          window.endsAt,
          item.id,
        );
      }
    } else {
      if (item.status === "pending" && (item.starts_at || item.ends_at)) {
        run(
          "UPDATE project_operation_requests SET starts_at = NULL, ends_at = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
          item.id,
        );
      } else if (item.status === "approved") {
        run("UPDATE project_operation_requests SET status = 'expired', updated_at = CURRENT_TIMESTAMP WHERE id = ?", item.id);
        run(
          `DELETE FROM project_tags WHERE project_id = ? AND tag_id IN (
            SELECT id FROM tags WHERE category = '项目运营' AND label = '限时限量'
          )`,
          item.project_id,
        );
      }
    }
  }
  const now = new Date().toISOString();
  const expired = all<{ id: number; project_id: number; request_type: ProjectOperationRequest["requestType"] }>(
    `SELECT id, project_id, request_type FROM project_operation_requests
     WHERE status = 'approved' AND ends_at IS NOT NULL AND ends_at < ?`,
    now,
  );
  for (const item of expired) {
    run("UPDATE project_operation_requests SET status = 'expired', updated_at = CURRENT_TIMESTAMP WHERE id = ?", item.id);
    run(
      `DELETE FROM project_tags WHERE project_id = ? AND tag_id IN (
        SELECT id FROM tags WHERE category = '项目运营' AND label = ?
      )`,
      item.project_id,
      operationTagLabel(item.request_type),
    );
  }
}

export function listProjectOperationRequests(creatorId?: number, principal?: AdminPrincipal) {
  expireProjectOperationRequests();
  const clauses: string[] = [];
  const values: Array<string | number> = [];
  if (creatorId) {
    clauses.push("r.creator_id = ?");
    values.push(creatorId);
  }
  if (principal?.role === "subadmin") {
    clauses.push("c.manager_admin_id = ?");
    values.push(principal.id || 0);
  }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  return all<OperationRequestRow>(
    `${operationRequestQuery(where)} ORDER BY r.updated_at DESC, r.id DESC`,
    ...values,
  ).map(mapOperationRequest);
}

export function submitProjectOperationRequest(creatorId: number, input: Record<string, unknown>) {
  const projectId = Number(input.projectId || 0);
  const project = one<{ id: number; creator_id: number; one_liner: string; status: string }>(
    "SELECT id, creator_id, one_liner, status FROM workshop_projects WHERE id = ?",
    projectId,
  );
  if (!project || project.creator_id !== creatorId || project.status === "archived")
    throw new Error("体验不存在或不能申请推荐栏目");
  const requestType = String(input.requestType || "") as ProjectOperationRequest["requestType"];
  if (!['first_launch', 'limited'].includes(requestType)) throw new Error("推荐栏目申请类型不正确");
  if (input.ruleAcknowledged !== true) throw new Error("请先阅读并确认该推荐栏目的申请规则");
  const reason = cleanText(input.reason, 300);
  const safety = contentSafety(reason);
  if (safety) throw new Error(safety);
  if (reason.length < 8) throw new Error("请用至少8个字说明申请理由");
  const existing = one<{ id: number }>(
    `SELECT id FROM project_operation_requests
     WHERE project_id = ? AND request_type = ? AND status IN ('pending', 'approved') LIMIT 1`,
    projectId,
    requestType,
  );
  if (existing) throw new Error("该体验已有待审核或生效中的同类申请");
  let startsAt: string | null = null;
  let endsAt: string | null = null;
  if (requestType === "limited") {
    const window = projectScheduleWindow(projectId);
    if (!window || window.endsOn < currentShanghaiDate()) throw new Error("请先添加未来可体验日期再申请限时限量");
    startsAt = window.startsAt;
    endsAt = window.endsAt;
  }
  const requestId = transaction(() => Number(run(
    `INSERT INTO project_operation_requests(
      project_id, creator_id, request_type, rule_acknowledged, reason, quantity_note, starts_at, ends_at
     ) VALUES (?, ?, ?, 1, ?, ?, ?, ?)`,
    projectId,
    creatorId,
    requestType,
    reason,
    "",
    startsAt,
    endsAt,
  ).lastInsertRowid));
  const thread = ensureReviewThread({
    entityType: "operation_request",
    entityId: requestId,
    creatorId,
    subject: `${operationTagLabel(requestType)}申请｜${project.one_liner}`,
  });
  addCreatorReviewSubmission(thread.id, creatorId, `我已申请“${operationTagLabel(requestType)}”：${reason}`);
  return listProjectOperationRequests(creatorId).find((item) => item.id === requestId)!;
}

export function withdrawProjectOperationRequest(creatorId: number, requestId: number) {
  const item = one<{ creator_id: number; status: string }>("SELECT creator_id, status FROM project_operation_requests WHERE id = ?", requestId);
  if (!item || item.creator_id !== creatorId) throw new Error("推荐栏目申请不存在或不能撤回");
  if (item.status !== "pending") throw new Error("只有待审核申请可以撤回");
  run("UPDATE project_operation_requests SET status = 'withdrawn', updated_at = CURRENT_TIMESTAMP WHERE id = ?", requestId);
  return listProjectOperationRequests(creatorId).find((request) => request.id === requestId)!;
}

export function reviewProjectOperationRequest(
  requestId: number,
  statusInput: unknown,
  reviewNoteInput: unknown,
  principal: AdminPrincipal,
) {
  const current = one<OperationRequestRow>(operationRequestQuery("WHERE r.id = ?"), requestId);
  if (!current) throw new Error("推荐栏目申请不存在");
  if (principal.role === "subadmin") {
    const creator = getCreator(current.creator_id);
    if (!creator || creator.managerAdminId !== principal.id) throw new Error("该账号不能审核此推荐栏目申请");
  }
  const status = String(statusInput || "") as "approved" | "rejected";
  if (!['approved', 'rejected'].includes(status)) throw new Error("推荐栏目审核状态不正确");
  const reviewNote = cleanText(reviewNoteInput, 300);
  if (status === "rejected" && !reviewNote) throw new Error("驳回申请时请填写原因");
  const now = new Date();
  let startsAt = current.starts_at;
  let endsAt = current.ends_at;
  if (status === "approved" && current.request_type === "first_launch") {
    startsAt = now.toISOString();
    endsAt = new Date(now.getTime() + 30 * 86400000).toISOString();
  } else if (status === "approved" && current.request_type === "limited") {
    const window = projectScheduleWindow(current.project_id);
    if (!window || window.endsOn < currentShanghaiDate()) throw new Error("该体验已没有未来可体验日期，不能通过限时限量申请");
    startsAt = window.startsAt;
    endsAt = window.endsAt;
  }
  transaction(() => {
    run(
      `UPDATE project_operation_requests SET status = ?, review_note = ?, reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP,
       starts_at = ?, ends_at = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      status,
      reviewNote,
      principal.label,
      startsAt,
      endsAt,
      requestId,
    );
    const label = operationTagLabel(current.request_type);
    if (status === "approved") {
      run(
        `INSERT OR IGNORE INTO project_tags(project_id, tag_id, tag_type)
         SELECT ?, id, 'operation' FROM tags WHERE category = '项目运营' AND label = ? AND status = 'active'`,
        current.project_id,
        label,
      );
    } else {
      run(
        `DELETE FROM project_tags WHERE project_id = ? AND tag_id IN (
          SELECT id FROM tags WHERE category = '项目运营' AND label = ?
        )`,
        current.project_id,
        label,
      );
    }
  });
  const thread = ensureReviewThread({
    entityType: "operation_request",
    entityId: requestId,
    creatorId: current.creator_id,
    subject: `${operationTagLabel(current.request_type)}申请｜${current.project_title}`,
  });
  const decision = status === "approved" ? "申请已通过" : `申请未通过：${reviewNote}`;
  addReviewStatusMessage(thread.id, principal, decision, true);
  return listProjectOperationRequests(undefined, principal).find((item) => item.id === requestId)!;
}

export function saveHomepageSlot(input: Record<string, unknown>, actorLabel = "admin") {
  const id = Number(input.id || 0);
  const current = id ? one<SlotRow>("SELECT * FROM homepage_slots WHERE id = ?", id) : null;
  if (id && !current) throw new Error("栏目内容不存在");
  const slotKey = ["limited", "new_today", "first_launch", "featured"].includes(String(input.slotKey || current?.slot_key))
    ? String(input.slotKey || current?.slot_key) as HomepageSlot["slotKey"]
    : "new_today";
  const contentType = ["kit", "venue", "project", "topic"].includes(String(input.contentType || current?.content_type))
    ? String(input.contentType || current?.content_type) as HomepageSlot["contentType"]
    : "project";
  const reviewStatus = ["pending", "approved", "rejected"].includes(String(input.reviewStatus || current?.review_status))
    ? String(input.reviewStatus || current?.review_status) as HomepageSlot["reviewStatus"]
    : "approved";
  const contentId = Math.max(0, Math.round(Number(input.contentId ?? current?.content_id ?? 0) || 0));
  const titleOverride = cleanText(input.titleOverride ?? current?.title_override, 80);
  const safety = contentSafety(titleOverride);
  if (safety) throw new Error(safety);
  const sortOrder = Number(input.sortOrder ?? current?.sort_order ?? 0) || 0;
  const startsAt = cleanText(input.startsAt ?? current?.starts_at, 30) || null;
  const endsAt = cleanText(input.endsAt ?? current?.ends_at, 30) || null;
  if (current) {
    run(
      `UPDATE homepage_slots SET slot_key = ?, content_type = ?, content_id = ?, title_override = ?, enabled = ?,
       sort_order = ?, starts_at = ?, ends_at = ?, reviewed_by_admin = ?, review_status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      slotKey, contentType, contentId, titleOverride, input.enabled === false ? 0 : 1, sortOrder, startsAt, endsAt, actorLabel, reviewStatus, id,
    );
  } else {
    run(
      `INSERT INTO homepage_slots(slot_key, content_type, content_id, title_override, enabled, sort_order,
       starts_at, ends_at, reviewed_by_admin, review_status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      slotKey, contentType, contentId, titleOverride, input.enabled === false ? 0 : 1, sortOrder,
      startsAt, endsAt, actorLabel, reviewStatus,
    );
  }
  return listHomepageSlots().find((item) => item.id === (id || Number(one<{ id: number }>("SELECT last_insert_rowid() AS id")?.id)))!;
}

export function workshopAdminOverview(principal: AdminPrincipal) {
  const projects = listWorkshopProjects(principal, true);
  const applicationWhere = principal.role === "subadmin" ? "WHERE c.manager_admin_id = ?" : "";
  const applicationValues = principal.role === "subadmin" ? [principal.id || 0] : [];
  const manageableCreatorIds = all<{ id: number }>(
    principal.role === "subadmin"
      ? "SELECT id FROM creators WHERE manager_admin_id = ? ORDER BY id"
      : "SELECT id FROM creators ORDER BY id",
    ...applicationValues,
  ).map((item) => item.id);
  return {
    venues: listWorkshopVenues(true),
    venueHours: principal.role === "super" ? listVenueHours() : [],
    kits: listWorkshopKits(true),
    kitGuides: listKitGuides(),
    venueRules: listVenueRules(),
    venueKits: principal.role === "super" ? listVenueKits() : [],
    projects,
    homepageBanners: principal.role === "super" ? listHomepageBanners(true) : [],
    homepageSlots: principal.role === "super" ? listHomepageSlots(true) : [],
    operationRequests: listProjectOperationRequests(undefined, principal),
    reviewThreads: listAdminReviewThreads(principal),
    supportTickets: principal.role === "super" ? listSupportTickets() : [],
    approvedProjectTagIdsByCreator: Object.fromEntries(
      manageableCreatorIds.map((creatorId) => [creatorId, [...approvedCreatorProjectTagIds(creatorId)]]),
    ),
    creatorApplications: all<{
      creator_id: number;
      consumer_id: number;
      status: CreatorApplicationAdminItem["status"];
      submitted_at: string;
      reviewed_at: string | null;
      reviewed_by: string;
      review_note: string;
      revision: number;
      brand_name: string;
      intro: string;
      phone: string;
      province: string;
      city: string;
      district: string;
      registered_with_code: string;
      representative_image_key: string;
      logo_image_key: string;
      workspace_enabled: number;
      custom_tags: string;
      opportunity_types: string;
      busy_periods: string;
      no_bookings: number;
      public_authorized: number;
      consent_at: string | null;
      phone_public_authorized: number;
      phone_consent_at: string | null;
      review_thread_id: number | null;
      invited_by_name: string;
      manager_name: string;
    }>(
      `SELECT a.creator_id, a.consumer_id, a.status, a.submitted_at, a.reviewed_at, a.reviewed_by,
       a.review_note, a.revision, a.brand_name, a.intro, a.phone, a.province, a.city, a.district,
       c.registered_with_code, a.representative_image_key, a.logo_image_key, COALESCE(b.workspace_enabled, 1) AS workspace_enabled,
       a.custom_tags, a.opportunity_types,
       a.busy_periods, a.no_bookings, a.public_authorized, a.consent_at,
       a.phone_public_authorized, a.phone_consent_at,
       (SELECT id FROM review_threads rt WHERE rt.entity_type = 'creator_application' AND rt.entity_id = a.id) AS review_thread_id,
       COALESCE(NULLIF(inviter.brand_name, ''), NULLIF(inviter.user_name, ''), '') AS invited_by_name,
       COALESCE(manager.phone, '') AS manager_name
       FROM creator_applications a
       JOIN creators c ON c.id = a.creator_id
       LEFT JOIN creator_wechat_bindings b ON b.creator_id = a.creator_id
       LEFT JOIN creators inviter ON inviter.id = c.invited_by_creator_id
       LEFT JOIN admin_accounts manager ON manager.id = c.manager_admin_id
       ${applicationWhere}
       ORDER BY CASE a.status WHEN 'pending' THEN 0 WHEN 'needs_changes' THEN 1 ELSE 2 END, a.submitted_at DESC`,
      ...applicationValues,
    ).map((item): CreatorApplicationAdminItem => {
      const creator = getCreator(item.creator_id);
      return {
        creatorId: item.creator_id,
        consumerId: item.consumer_id,
        status: item.status,
        submittedAt: item.submitted_at,
        reviewedAt: item.reviewed_at,
        reviewedBy: item.reviewed_by,
        reviewNote: item.review_note,
        revision: item.revision,
        brandName: item.brand_name,
        intro: item.intro,
        phone: item.phone,
        province: item.province,
        city: item.city,
        district: item.district,
        registeredWithCode: item.registered_with_code,
        invitedByName: item.invited_by_name,
        managerName: item.manager_name,
        representativeImageUrl: assetUrl(item.representative_image_key) || creator?.workUrls[0] || null,
        logoImageUrl: assetUrl(item.logo_image_key) || null,
        workspaceEnabled: Boolean(item.workspace_enabled),
        tags: (creator?.tags || []).filter((tag) =>
          creatorApplicationTagCategories.includes(tag.category as (typeof creatorApplicationTagCategories)[number])),
        customTags: parseJsonArray(item.custom_tags) as Array<{ category: string; label: string }>,
        opportunityTypes: (parseJsonArray(item.opportunity_types) as string[]).filter((value) => value !== "同城约见"),
        busyPeriods: parseJsonArray(item.busy_periods) as Array<{ startDate: string; endDate: string; note: string }>,
        noBookings: Boolean(item.no_bookings),
        publicAuthorized: Boolean(item.public_authorized),
        consentAt: item.consent_at,
        phonePublicAuthorized: Boolean(item.phone_public_authorized),
        phoneConsentAt: item.phone_consent_at,
        reviewThreadId: item.review_thread_id,
      };
    }),
    metrics: {
      venues: Number(one<{ count: number }>("SELECT COUNT(*) AS count FROM venues WHERE status != 'archived'")?.count || 0),
      kits: Number(one<{ count: number }>("SELECT COUNT(*) AS count FROM kits WHERE status != 'archived'")?.count || 0),
      projects: projects.filter((item) => item.status !== "archived").length,
      supportTickets: principal.role === "super" ? Number(one<{ count: number }>("SELECT COUNT(*) AS count FROM support_tickets WHERE status IN ('open', 'processing')")?.count || 0) : 0,
    },
  };
}

export function reviewCreatorApplication(
  creatorId: number,
  statusInput: unknown,
  reviewNoteInput: unknown,
  principal: AdminPrincipal,
) {
  const creator = getCreator(creatorId);
  if (!creator) throw new Error("TDE新遇官不存在");
  if (principal.role === "subadmin" && creator.managerAdminId !== principal.id) throw new Error("该账号不能审核此新遇官");
  const application = one<{ phone: string; public_authorized: number; phone_public_authorized: number }>(
    "SELECT phone, public_authorized, phone_public_authorized FROM creator_applications WHERE creator_id = ?",
    creatorId,
  );
  if (!application) throw new Error("TDE新遇官申请不存在");
  const rawStatus = String(statusInput || "");
  if (!["active", "needs_changes", "rejected"].includes(rawStatus)) throw new Error("申请审核状态不正确");
  const status = rawStatus as "active" | "needs_changes" | "rejected";
  const reviewNote = cleanText(reviewNoteInput, 300);
  if (status !== "active" && !reviewNote) throw new Error("请填写审核意见");
  if (status === "active") {
    const fields = getMiniProgramSettings().creatorApplicationFields;
    if (!creator.brandName || !creator.province || !creator.city || !creator.district)
      throw new Error("新遇官需先完善名称和所在地区");
    if (!creator.workUrls.length) throw new Error("新遇官需先上传申请代表图");
    if (!creator.tags.some((tag) => creatorApplicationTagCategories.includes(tag.category as (typeof creatorApplicationTagCategories)[number])))
      throw new Error("新遇官需先选择至少一个新遇官标签");
    if (fields.intro.enabled && fields.intro.required && !creator.intro)
      throw new Error(`新遇官需先填写${fields.intro.label}`);
    if (fields.offlineExperience.enabled && fields.offlineExperience.required && !creator.opportunityTypes.length)
      throw new Error(`新遇官需先选择${fields.offlineExperience.label}`);
    if (fields.busyPeriods.enabled && fields.busyPeriods.required && !creator.noBookings && !(creator.busyPeriods || []).length)
      throw new Error(`新遇官需填写${fields.busyPeriods.label}，或选择近期无其他活动安排`);
    if (!application.public_authorized) throw new Error("新遇官尚未确认公开展示授权");
    if (!application.phone_public_authorized || !validPhone(application.phone))
      throw new Error("新遇官尚未授权公开注册手机号");
  }
  const reviewer = principal.role === "super" ? "超级管理员" : `子管理员#${principal.id || 0}`;
  const subject = status === "active" ? "新遇官申请已通过" : status === "needs_changes" ? "新遇官申请需补充" : "新遇官申请未通过";
  const body = status === "active" ? "你现在可以提交体验并上线展示。" : reviewNote;
  transaction(() => {
    run(
      `UPDATE creator_applications SET status = ?, review_note = ?, reviewed_at = CURRENT_TIMESTAMP,
       reviewed_by = ?, updated_at = CURRENT_TIMESTAMP WHERE creator_id = ?`,
      status,
      reviewNote,
      reviewer,
      creatorId,
    );
    run(
      `UPDATE creator_wechat_bindings SET status = ?, reviewed_at = CURRENT_TIMESTAMP,
       reviewed_by = ?, updated_at = CURRENT_TIMESTAMP WHERE creator_id = ?`,
      status === "active" ? "active" : status === "rejected" ? "rejected" : "pending",
      reviewer,
      creatorId,
    );
    if (status !== "active") {
      run("UPDATE activities SET status = 'paused', updated_at = CURRENT_TIMESTAMP WHERE creator_id = ? AND status = 'published'", creatorId);
      run(
        "UPDATE workshop_projects SET status = 'paused', updated_at = CURRENT_TIMESTAMP WHERE creator_id = ? AND status = 'published'",
        creatorId,
      );
    }
  });
  const applicationRecord = one<{ id: number }>("SELECT id FROM creator_applications WHERE creator_id = ?", creatorId)!;
  const thread = ensureReviewThread({
    entityType: "creator_application",
    entityId: applicationRecord.id,
    creatorId,
    subject: `新遇官申请审核｜${creator.brandName || creator.phone}`,
  });
  addReviewStatusMessage(thread.id, principal, body || subject, status === "active" || status === "rejected");
  return workshopAdminOverview(principal).creatorApplications.find((item) => item.creatorId === creatorId)!;
}

export function restoreCreatorToVisitor(creatorId: number, principal: AdminPrincipal) {
  const creator = getCreator(creatorId);
  if (!creator) throw new Error("TDE新遇官不存在");
  if (principal.role === "subadmin" && creator.managerAdminId !== principal.id) throw new Error("该账号不能管理此新遇官");
  const binding = one<{ workspace_enabled: number }>(
    "SELECT workspace_enabled FROM creator_wechat_bindings WHERE creator_id = ?",
    creatorId,
  );
  if (!binding) throw new Error("该新遇官没有微信绑定关系");
  const actor = principal.role === "super" ? "超级管理员" : `子管理员#${principal.id || 0}`;
  transaction(() => {
    run(
      "UPDATE creator_wechat_bindings SET workspace_enabled = 0, updated_at = CURRENT_TIMESTAMP WHERE creator_id = ?",
      creatorId,
    );
    run("DELETE FROM mini_sessions WHERE actor_type = 'creator' AND actor_id = ?", creatorId);
    run("UPDATE activities SET status = 'paused', updated_at = CURRENT_TIMESTAMP WHERE creator_id = ? AND status = 'published'", creatorId);
    run("UPDATE workshop_projects SET status = 'paused', selected_for_display = 0, updated_at = CURRENT_TIMESTAMP WHERE creator_id = ? AND status = 'published'", creatorId);
    run(
      "INSERT INTO audit_logs(actor, action, detail) VALUES (?, 'creator_restore_visitor', ?)",
      actor,
      JSON.stringify({ creatorId, previousWorkspaceEnabled: Boolean(binding.workspace_enabled) }),
    );
  });
  return workshopAdminOverview(principal).creatorApplications.find((item) => item.creatorId === creatorId)!;
}

function activeWindow(item: { startsAt?: string | null; endsAt?: string | null; starts_at?: string | null; ends_at?: string | null }) {
  const now = new Date().toISOString();
  const startsAt = item.startsAt ?? item.starts_at;
  const endsAt = item.endsAt ?? item.ends_at;
  return (!startsAt || startsAt <= now) && (!endsAt || endsAt >= now);
}

function publishedVenueKits(city = "", businessArea = ""): PublishedVenueKit[] {
  const venues = listWorkshopVenues(false)
    .filter((venue) => (!city || venue.city === city) && (!businessArea || venue.businessArea === businessArea));
  const venueIds = new Set(venues.map((venue) => venue.id));
  const kits = new Map(listWorkshopKits(false).map((kit) => [kit.id, kit]));
  return listVenueKits()
    .filter((item) => venueIds.has(item.venueId) && item.available && kits.has(item.kitId))
    .map((item) => {
      const hours = todayVenueHours(item.venueId);
      const label = openingLabel(hours);
      const now = new Date();
      const hhmm = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
      const openNow = hours.some((hour) => !hour.closed && hour.openTime <= hhmm && hhmm < hour.closeTime);
      return { ...item, venue: venues.find((venue) => venue.id === item.venueId)!, kit: kits.get(item.kitId)!, openingLabel: label, openNow };
    })
    .sort((a, b) => Number(b.openNow) - Number(a.openNow) || b.kit.sortOrder - a.kit.sortOrder || b.updatedAt.localeCompare(a.updatedAt));
}

function detailPath(linkType: HomepageBanner["linkType"], linkValue: string) {
  const id = Number(linkValue || 0);
  if (linkType === "kit" && id) return `/pages/kit-detail/kit-detail?id=${id}`;
  if (linkType === "venue" && id) return `/pages/venue-detail/venue-detail?id=${id}`;
  if (linkType === "project" && id) return `/pages/project-detail/project-detail?id=${id}`;
  if (linkType === "topic" && linkValue) return `/pages/explore/explore?tag=${encodeURIComponent(linkValue)}&mode=self`;
  if (linkType === "url" && linkValue) return linkValue;
  return "";
}

function withResolvedLink<T extends { linkType: HomepageBanner["linkType"]; linkValue: string }>(item: T) {
  return { ...item, path: detailPath(item.linkType, item.linkValue) };
}

function todayVenueHours(venueId: number) {
  const today = new Date();
  const isoDate = today.toISOString().slice(0, 10);
  const weekday = today.getDay();
  const hours = listVenueHours(venueId);
  const override = hours.filter((item) => item.dateOverride === isoDate);
  const regular = hours.filter((item) => !item.dateOverride && item.weekday === weekday);
  return override.length ? override : regular;
}

function openingLabel(hours: VenueHour[]) {
  if (!hours.length) return "营业时间按现场安排";
  if (hours.every((hour) => hour.closed)) return "今日休息";
  return hours
    .filter((hour) => !hour.closed)
    .map((hour) => {
      const note = /^QIDENG_/.test(hour.note) ? "" : hour.note;
      return `${hour.openTime}-${hour.closeTime}${note ? ` · ${note}` : ""}`;
    })
    .join(" / ");
}

export function getWorkshopVenue(id: number) {
  const venue = listWorkshopVenues(false).find((item) => item.id === id) || null;
  if (!venue) return null;
  const venueKits = publishedVenueKits(venue.city, venue.businessArea).filter((item) => item.venueId === venue.id);
  const hours = listVenueHours(venue.id);
  const todayHours = todayVenueHours(venue.id);
  return { venue, hours, todayHours, rules: listVenueRules(venue.id), openingLabel: openingLabel(todayHours), venueKits };
}

export function getWorkshopKit(id: number, venueId = 0) {
  const kit = listWorkshopKits(false).find((item) => item.id === id) || null;
  if (!kit) return null;
  const venueKits = publishedVenueKits().filter((item) => item.kitId === id && (!venueId || item.venueId === venueId));
  if (venueId && !venueKits.length) return null;
  const guides = listKitGuides(id);
  const selectedVenueId = venueKits[0]?.venueId || 0;
  return {
    kit,
    guides,
    venueRules: selectedVenueId ? listVenueRules(selectedVenueId) : [],
    venueKits,
    selectedVenueKit: venueKits[0] || null,
    venueHours: venueKits[0] ? todayVenueHours(venueKits[0].venueId) : [],
    openingLabel: venueKits[0] ? openingLabel(todayVenueHours(venueKits[0].venueId)) : "选择体验点后查看营业时间",
  };
}

export function getWorkshopProject(id: number): WorkshopProject | null {
  return listWorkshopProjects(undefined, false).find((item) => item.id === id) || null;
}

export function getWorkshopProjectDetail(id: number): WorkshopProjectDetail | null {
  const project = getWorkshopProject(id);
  if (!project) return null;
  const creator = getCreator(project.creatorId);
  if (!creator) return null;
  const application = one<{
    status: string;
    phone: string;
    public_authorized: number;
    phone_public_authorized: number;
    logo_image_key: string;
  }>(
    `SELECT status, phone, public_authorized, phone_public_authorized, logo_image_key
     FROM creator_applications WHERE creator_id = ?`,
    project.creatorId,
  );
  const phoneAvailable = Boolean(application
    && application.status === "active"
    && application.public_authorized
    && application.phone_public_authorized
    && validPhone(application.phone));
  return {
    project,
    creatorPublic: {
      id: creator.id,
      name: creator.brandName || creator.userName || project.creatorName,
      intro: creator.intro,
      imageUrl: creator.workUrls[0] || null,
      logoUrl: assetUrl(application?.logo_image_key || "") || null,
      tags: creator.tags.filter(
        (tag) => tag.status === "active" && creatorApplicationTagCategories.includes(tag.category as (typeof creatorApplicationTagCategories)[number]),
      ),
      opportunityTypes: creator.opportunityTypes.filter((value) => value !== "同城约见"),
    },
    contactChannels: [],
    recommendedContact: null,
    phoneContact: phoneAvailable ? { available: true, maskedPhone: maskedPhone(application!.phone) } : null,
  };
}

export function recordWorkshopContactClick(input: Record<string, unknown>, consumerId: number | null = null) {
  const projectId = Number(input.projectId || 0);
  const guestId = cleanText(input.guestId, 80);
  if (!consumerId) throw new Error("请先连接微信后查看联系方式");
  const detail = getWorkshopProjectDetail(projectId);
  if (!detail) throw new Error("体验不存在或已经下线");
  const application = one<{ phone: string; status: string; public_authorized: number; phone_public_authorized: number }>(
    `SELECT phone, status, public_authorized, phone_public_authorized
     FROM creator_applications WHERE creator_id = ?`,
    detail.project.creatorId,
  );
  if (!application || application.status !== "active" || !application.public_authorized
    || !application.phone_public_authorized || !validPhone(application.phone))
    throw new Error("该新遇官暂未开放电话联系");
  transaction(() => {
    run(
      `INSERT INTO phone_contact_view_events(consumer_id, creator_id, project_id, guest_id)
       VALUES (?, ?, ?, ?)`,
      consumerId,
      detail.project.creatorId,
      projectId,
      guestId,
    );
    run(
      "UPDATE workshop_projects SET consultation_count = consultation_count + 1 WHERE id = ?",
      projectId,
    );
  });
  return {
    phone: application.phone,
    maskedPhone: maskedPhone(application.phone),
    reminder: "联系时请说明：您好，我是通过TDE小程序发现您的。",
    recorded: true,
  };
}

export function miniWorkshopHome(input: Record<string, unknown> = {}) {
  expireProjectOperationRequests();
  const city = cleanText(input.city, 30);
  const cities = [...new Set([
    ...listWorkshopVenues(false).map((venue) => venue.city),
    ...listWorkshopProjects(undefined, false).filter((project) => !project.noPlan).map((project) => project.city),
  ].filter(Boolean))].sort((a, b) => a.localeCompare(b, "zh-CN"));
  const banners = listHomepageBanners(false)
    .filter((banner) => (!city || !banner.city || banner.city === city) && activeWindow(banner))
    .slice(0, 5)
    .map(withResolvedLink);
  type ResolvedSlot = HomepageSlot & { path: string };
  const slotKeys: HomepageSlot["slotKey"][] = ["limited", "new_today", "first_launch", "featured"];
  const emptySlots = (): Record<HomepageSlot["slotKey"], ResolvedSlot[]> => ({ limited: [], new_today: [], first_launch: [], featured: [] });
  const publishedKits = publishedVenueKits(city);
  const publishedProjects = miniCompanionPlay({ city, limit: 50 }).projects;
  const kits = new Map(listWorkshopKits(false).map((kit) => [kit.id, kit]));
  const projects = new Map(listWorkshopProjects(undefined, false).map((project) => [project.id, project]));
  const venues = new Map(listWorkshopVenues(false).map((venue) => [venue.id, venue]));
  const contentTitle = (slot: HomepageSlot) => slot.titleOverride
    || (slot.contentType === "kit" ? kits.get(slot.contentId)?.title : "")
    || (slot.contentType === "project" ? projects.get(slot.contentId)?.oneLiner : "")
    || (slot.contentType === "venue" ? venues.get(slot.contentId)?.name : "")
    || "看看这次有什么新体验";
  const manualSlots = listHomepageSlots(false)
    .filter(activeWindow)
    .map((slot) => withResolvedLink({ ...slot, titleOverride: contentTitle(slot), linkType: slot.contentType === "topic" ? "topic" : slot.contentType, linkValue: String(slot.contentId || slot.titleOverride) }))
    .reduce<Record<HomepageSlot["slotKey"], ResolvedSlot[]>>((groups, slot) => {
      groups[slot.slotKey] = [...(groups[slot.slotKey] || []), slot].slice(0, 6);
      return groups;
    }, emptySlots());
  const operationSlots = new Map<string, HomepageSlot["slotKey"]>([
    ["限时限量", "limited"],
    ["今日上新", "new_today"],
    ["首发尝鲜", "first_launch"],
    ["好评精选", "featured"],
  ]);
  const automatic = slotKeys.reduce<Record<HomepageSlot["slotKey"], Array<ResolvedSlot & { priority: number }>>>((groups, key) => {
    groups[key] = [];
    return groups;
  }, { limited: [], new_today: [], first_launch: [], featured: [] });
  const seenKits = new Set<number>();
  for (const item of publishedKits) {
    if (seenKits.has(item.kitId)) continue;
    seenKits.add(item.kitId);
    for (const tag of item.kit.tags) {
      const slotKey = operationSlots.get(tag.label);
      if (!slotKey) continue;
      automatic[slotKey].push({
        id: -(item.kitId * 10 + 1), slotKey, contentType: "kit", contentId: item.kitId,
        titleOverride: item.kit.title, enabled: true, sortOrder: item.kit.sortOrder,
        startsAt: null, endsAt: null, createdByCreatorId: null, reviewedByAdmin: "标签自动归栏",
        reviewStatus: "approved", createdAt: item.kit.createdAt, updatedAt: item.kit.updatedAt,
        path: detailPath("kit", String(item.kitId)), priority: item.openNow ? 1 : 0,
      });
    }
  }
  for (const project of publishedProjects) {
    if (project.publishedAt && Date.now() - new Date(project.publishedAt).getTime() <= 24 * 3600000) {
      automatic.new_today.push({
        id: -(project.id * 10 + 7), slotKey: "new_today", contentType: "project", contentId: project.id,
        titleOverride: project.oneLiner, enabled: true, sortOrder: project.sortOrder,
        startsAt: project.publishedAt, endsAt: null, createdByCreatorId: project.creatorId, reviewedByAdmin: "发布时间自动归栏",
        reviewStatus: "approved", createdAt: project.createdAt, updatedAt: project.updatedAt,
        path: detailPath("project", String(project.id)), priority: 1,
      });
    }
    for (const tag of project.tags) {
      const slotKey = operationSlots.get(tag.label);
      if (!slotKey) continue;
      automatic[slotKey].push({
        id: -(project.id * 10 + 2), slotKey, contentType: "project", contentId: project.id,
        titleOverride: project.oneLiner, enabled: true, sortOrder: project.sortOrder,
        startsAt: null, endsAt: null, createdByCreatorId: project.creatorId, reviewedByAdmin: "标签自动归栏",
        reviewStatus: "approved", createdAt: project.createdAt, updatedAt: project.updatedAt,
        path: detailPath("project", String(project.id)), priority: 0,
      });
    }
  }
  const slots = slotKeys.reduce<Record<HomepageSlot["slotKey"], ResolvedSlot[]>>((groups, key) => {
    const seen = new Set<string>();
    groups[key] = [...manualSlots[key], ...automatic[key].sort((a, b) => b.priority - a.priority || b.sortOrder - a.sortOrder || b.updatedAt.localeCompare(a.updatedAt))]
      .filter((slot) => {
        const identity = `${slot.contentType}:${slot.contentId || slot.titleOverride}`;
        if (seen.has(identity)) return false;
        seen.add(identity);
        return true;
      })
      .slice(0, 6)
      .map((item) => {
        const { priority: _priority, ...slot } = item as ResolvedSlot & { priority?: number };
        return slot;
      });
    return groups;
  }, emptySlots());
  const resolvedSlots = Object.fromEntries(Object.entries(slots).map(([key, items]) => [key, items.map((slot) => ({
    ...slot,
    content: slot.contentType === "kit"
      ? publishedKits.find((item) => item.kitId === slot.contentId) || null
      : slot.contentType === "project"
        ? publishedProjects.find((item) => item.id === slot.contentId) || null
        : slot.contentType === "venue"
          ? venues.get(slot.contentId) || null
          : null,
  }))]));
  return {
    settings: getMiniProgramSettings(),
    cities,
    banners,
    intentEntries: ["带孩子玩", "和朋友玩", "自己放空", "定制礼物"],
    slots: resolvedSlots,
    discoveryCount: publishedKits.length + publishedProjects.length,
    selfPlayPreview: publishedKits.slice(0, 50),
    companionPreview: publishedProjects,
  };
}

export function miniSelfPlay(input: Record<string, unknown> = {}) {
  const city = cleanText(input.city, 30);
  const businessArea = cleanText(input.businessArea, 40);
  const tag = cleanText(input.tag, 20);
  const venueKits = publishedVenueKits(city, businessArea).filter((item) => !tag || item.kit.tags.some((kitTag) => kitTag.label === tag));
  const venueIds = new Set(venueKits.map((item) => item.venueId));
  return {
    venues: listWorkshopVenues(false).filter((venue) => venueIds.has(venue.id)),
    venueHours: listVenueHours().filter((hour) => venueIds.has(hour.venueId)),
    venueKits,
    banners: listHomepageBanners(false).filter((banner) => (!city || !banner.city || banner.city === city) && activeWindow(banner)).slice(0, 5).map(withResolvedLink),
    businessAreas: [...new Set(venueKits.map((item) => item.venue.businessArea).filter(Boolean))],
  };
}

export function miniCompanionPlay(input: Record<string, unknown> = {}) {
  expireProjectOperationRequests();
  const city = cleanText(input.city, 30);
  const district = cleanText(input.district, 30);
  const date = cleanText(input.date, 10);
  const scene = cleanText(input.scene, 20);
  const tag = cleanText(input.tag || input.scene, 20);
  const limit = Math.max(1, Math.min(50, Number(input.limit || 50) || 50));
  const today = currentShanghaiDate();
  const sceneTags = new Set<string>(projectSceneTags);
  const interestCategories = new Set(["我的作品", "我的客群", "我的风格", "现场体验"]);
  let projects = listWorkshopProjects(undefined, false).filter((project) => {
    if (city && project.city !== city) return false;
    if (district && project.district !== district) return false;
    if (project.noPlan) return false;
    const openSchedules = project.schedules.filter((schedule) => schedule.status === "open");
    if (validDate(date)) {
      const dateInRange = Boolean(project.startDate && project.endDate && project.startDate <= date && date <= project.endDate);
      const dateInSchedule = openSchedules.some((schedule) => schedule.availableDate === date);
      if (project.schedules.length ? !dateInSchedule : !dateInRange) return false;
      const creatorBusy = one(
        "SELECT id FROM busy_periods WHERE creator_id = ? AND start_date <= ? AND end_date >= ? LIMIT 1",
        project.creatorId,
        date,
        date,
      );
      if (creatorBusy) return false;
    } else {
      const futureInRange = Boolean(project.endDate && project.endDate >= today);
      const futureSchedule = openSchedules.some((schedule) => schedule.availableDate >= today);
      if (project.schedules.length ? !futureSchedule : !futureInRange) return false;
    }
    if (tag && !project.tags.some((projectTag) => projectTag.label === tag)) return false;
    return true;
  });
  projects = projects.sort((a, b) => b.sortOrder - a.sortOrder || b.updatedAt.localeCompare(a.updatedAt));
  return {
    filters: {
      scenes: [...sceneTags],
      categories: [...new Set(projects.flatMap((project) => project.tags
        .filter((projectTag) => projectTag.category === "我的作品")
        .map((projectTag) => projectTag.label)))],
      interests: [...new Set(projects.flatMap((project) => project.tags
        .filter((projectTag) => interestCategories.has(projectTag.category))
        .map((projectTag) => projectTag.label)))],
      districts: [...new Set(projects.map((project) => project.district).filter(Boolean))],
      dates: [...new Set(projects.flatMap((project) => project.schedules
        .filter((schedule) => schedule.status === "open" && schedule.availableDate >= today)
        .map((schedule) => schedule.availableDate)))].sort(),
    },
    banners: listHomepageBanners(false).filter((banner) => (!city || !banner.city || banner.city === city) && activeWindow(banner)).slice(0, 5).map(withResolvedLink),
    projects: projects.slice(0, limit),
  };
}

export function miniExplore(input: Record<string, unknown> = {}) {
  const mode = ["all", "self", "companion"].includes(String(input.mode)) ? String(input.mode) : "all";
  const selfPlay = miniSelfPlay(input);
  const companion = miniCompanionPlay(input);
  return {
    mode,
    tag: cleanText(input.tag, 20),
    selfPlay: mode === "companion" ? [] : selfPlay.venueKits,
    companion: mode === "self" ? [] : companion.projects,
    filters: {
      businessAreas: selfPlay.businessAreas,
      districts: companion.filters.districts,
      scenes: [...projectSceneTags],
    },
  };
}

type WorkshopDiscoveryCandidate = {
  contentKey: string;
  contentType: "kit" | "project";
  providerKey: string;
  projectId: number | null;
  kitId: number | null;
  venueId: number | null;
  content: PublishedVenueKit | WorkshopProject;
};

function workshopDiscoveryCandidates(city: string): WorkshopDiscoveryCandidate[] {
  const kits = publishedVenueKits(city).map((content) => ({
    contentKey: `kit:${content.kitId}:venue:${content.venueId}`,
    contentType: "kit" as const,
    providerKey: `venue:${content.venueId}`,
    projectId: null,
    kitId: content.kitId,
    venueId: content.venueId,
    content,
  }));
  const projects = miniCompanionPlay({ city, limit: 50 }).projects.map((content) => ({
    contentKey: `project:${content.id}`,
    contentType: "project" as const,
    providerKey: `creator:${content.creatorId}`,
    projectId: content.id,
    kitId: null,
    venueId: null,
    content,
  }));
  return [...kits, ...projects];
}

export function createWorkshopDiscovery(input: Record<string, unknown>, consumerId: number | null = null) {
  const settings = getMiniProgramSettings();
  if (!settings.enabled) throw new Error("TDE暂时休息中，请稍后再来");
  const guestId = cleanText(input.guestId, 80);
  const city = cleanText(input.city, 30);
  if (!guestId) throw new Error("缺少本次浏览标识");
  if (!city) throw new Error("请先选择从哪里出发");
  const candidates = workshopDiscoveryCandidates(city);
  if (!candidates.length) throw new Error("这座城市还没有可以探照的奇遇");

  const history = all<{ provider_key: string; content_key: string }>(
    `SELECT provider_key, content_key FROM workshop_discovery_sessions
     WHERE guest_id = ? AND city = ? ORDER BY id DESC LIMIT 500`,
    guestId,
    city,
  );
  const providerCounts = new Map<string, number>();
  const contentCounts = new Map<string, number>();
  for (const item of history) {
    providerCounts.set(item.provider_key, (providerCounts.get(item.provider_key) || 0) + 1);
    contentCounts.set(item.content_key, (contentCounts.get(item.content_key) || 0) + 1);
  }

  const providerGroups = new Map<string, WorkshopDiscoveryCandidate[]>();
  for (const candidate of candidates) {
    const group = providerGroups.get(candidate.providerKey) || [];
    group.push(candidate);
    providerGroups.set(candidate.providerKey, group);
  }
  const providerKeys = [...providerGroups.keys()];
  const lastProviderKey = history[0]?.provider_key;
  const providerPool = providerKeys.length > 1
    ? providerKeys.filter((key) => key !== lastProviderKey)
    : providerKeys;
  const leastProviderCount = Math.min(...providerPool.map((key) => providerCounts.get(key) || 0));
  const providerChoices = providerPool.filter((key) => (providerCounts.get(key) || 0) === leastProviderCount);
  const providerKey = providerChoices[crypto.randomInt(providerChoices.length)];

  const providerCandidates = providerGroups.get(providerKey)!;
  const lastContentKey = history[0]?.content_key;
  const contentPool = providerCandidates.length > 1
    ? providerCandidates.filter((item) => item.contentKey !== lastContentKey)
    : providerCandidates;
  const leastContentCount = Math.min(...contentPool.map((item) => contentCounts.get(item.contentKey) || 0));
  const contentChoices = contentPool.filter((item) => (contentCounts.get(item.contentKey) || 0) === leastContentCount);
  const selected = contentChoices[crypto.randomInt(contentChoices.length)];
  const reference = newReference("XY");
  run(
    `INSERT INTO workshop_discovery_sessions(
      reference, guest_id, consumer_id, city, provider_key, content_key, content_type,
      workshop_project_id, kit_id, venue_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    reference,
    guestId,
    consumerId,
    city,
    selected.providerKey,
    selected.contentKey,
    selected.contentType,
    selected.projectId,
    selected.kitId,
    selected.venueId,
  );
  return {
    reference,
    city,
    key: selected.contentKey,
    contentType: selected.contentType,
    content: selected.content,
    poolSize: candidates.length,
    createdAt: new Date().toISOString(),
  };
}
