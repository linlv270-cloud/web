import crypto from "node:crypto";
import {
  categoryPosterPath,
  cooperationTypes,
  precisionInviteGoals as precisionInviteGoalOptions,
  precisionInviteScenes as precisionInviteSceneOptions,
  projectTagSeeds,
  tagCategoryNames,
  tagSeeds,
} from "./catalog";
import { all, getDb, newReference, one, run, transaction } from "./database";
import {
  allowedContentIcons,
  allowedNavigationIcons,
  defaultFieldRules,
  defaultPlatformSettings,
  defaultUiText,
  defaultWriterUiSettings,
  fieldDefinitions,
} from "./platform-settings";
import { cleanText, contentSafety, hashSecret, validPhone, verifySecret } from "./security";
import { assetUrl } from "./storage";
import { rankTagMatches } from "./tag-search";
import { isValidLocation } from "./locations";
import { getCreatorWecomBinding } from "./wecom-bindings";
import { decryptDesignKey, encryptDesignKey, generateDesignBrief } from "./design-ai";
import type {
  ActivityApplication,
  AdminAccount,
  AdminAccountStatus,
  AdminOverview,
  AdminPrincipal,
  ApplicationStatus,
  BusyPeriod,
  CopyGeneration,
  CopyGenerationStage,
  CopyGenerationStatus,
  CopyMode,
  CopyQuota,
  CreatorRating,
  CreatorProfile,
  DesignApiKey,
  DesignBrief,
  DesignDraft,
  DesignSession,
  DesignSolarTerm,
  DesignTag,
  DesignTagCategory,
  InboxMessage,
  InviteCode,
  PlatformSettings,
  PlatformNotification,
  ServiceIntent,
  Tag,
  TagStatus,
  Theme,
  TrendSettings,
  TrendTerm,
  TrendTermStatus,
  WriterUiSettings,
} from "./types";

type CreatorRow = {
  id: number;
  phone: string;
  password_hash: string;
  password_salt: string;
  password_login_enabled: number;
  invite_code: string;
  registered_with_code: string;
  manager_admin_id: number | null;
  invited_by_creator_id: number | null;
  created_by_admin_id: number | null;
  user_name: string;
  brand_name: string;
  wechat: string;
  intro: string;
  booth_description: string;
  booth_description_confirmed_at: string | null;
  province: string;
  city: string;
  district: string;
  available_cities: string;
  social_account: string;
  logo_key: string | null;
  work_keys: string;
  slogan: string;
  product_image_key: string;
  booth_image_key: string;
  history_image_key: string;
  no_bookings: number;
  schedule_confirmed_at: string | null;
  generation_schedule_confirmed_at: string | null;
  generation_schedule_confirmation_used_at: string | null;
  intro_popup_seen_version: string;
  profile_submitted_at: string | null;
  tags_submitted_at: string | null;
  tags_first_submitted_at: string | null;
  application_limit: number | null;
  free_generation_limit: number;
  upgrade_generation_limit: number;
  free_generation_used: number;
  upgrade_generation_used: number;
  service_intents: string;
  opportunity_types: string;
  opportunity_opt_in: number;
  precision_invite_goals: string;
  precision_invite_scenes: string;
  xiaohongshu_followers: number | null;
  xiaohongshu_url: string;
  douyin_followers: number | null;
  douyin_url: string;
  admin_rating: CreatorRating;
  admin_note: string;
  activity_limit: number | null;
  reply_timeout_minutes: number | null;
  suspended: number;
  created_at: string;
  updated_at: string;
};

type AdminAccountRow = {
  id: number;
  name: string;
  phone: string;
  password_hash: string;
  password_salt: string;
  status: AdminAccountStatus;
  invite_code: string;
  approved_at: string | null;
  approved_by: string;
  created_at: string;
  updated_at: string;
};

type TagRow = { id: number; label: string; category: string; status: TagStatus; source?: Tag["source"] };
type CopyGenerationRow = {
  id: number;
  creator_id: number;
  creator_name?: string;
  brand_name?: string;
  mode: CopyMode;
  status: CopyGenerationStatus;
  stage: CopyGenerationStage;
  attempts: number;
  next_attempt_at: string | null;
  title: string;
  body: string;
  visual_facts: string;
  used_tags: string;
  error: string;
  template_version: string;
  provider: string;
  model: string;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
};
type TrendTermRow = {
  id: number;
  term: string;
  source: string;
  related_tags: string;
  related_categories: string;
  score: number;
  confidence: number;
  risk: number;
  status: TrendTermStatus;
  use_count: number;
  expires_at: string | null;
  last_used_at: string | null;
  created_at: string;
  updated_at: string;
};
type ThemeRow = {
  id: number;
  title: string;
  category: string;
  description: string;
  poster_key: string | null;
  accent: string;
  sort_order: number;
  active: number;
};
type ApplicationRow = {
  id: number;
  reference: string;
  creator_id: number;
  theme_id: number;
  theme_title?: string;
  creator_name?: string;
  brand_name?: string;
  phone?: string;
  province: string;
  city: string;
  start_date: string;
  end_date: string;
  participation: string;
  tag_ids: string;
  note: string;
  has_conflict: number;
  status: ApplicationStatus;
  snapshot: string | null;
  created_at: string;
  updated_at: string;
};

function parseJson<T>(value: string | null | undefined, fallback: T): T {
  try {
    return value ? (JSON.parse(value) as T) : fallback;
  } catch {
    return fallback;
  }
}

function creatorTags(creatorId: number) {
  return all<TagRow>(
    `SELECT t.id, t.label, t.category, t.status, ct.source
     FROM tags t JOIN creator_tags ct ON ct.tag_id = t.id
     WHERE ct.creator_id = ? AND t.status != 'archived'
     ORDER BY t.category, t.label`,
    creatorId,
  ).filter((tag) => tagCategoryNames.includes(tag.category));
}

export function getBusyPeriods(creatorId: number) {
  return all<{
    id: number;
    start_date: string;
    end_date: string;
    note: string;
    source: BusyPeriod["source"];
    source_id: number | null;
  }>(
    "SELECT id, start_date, end_date, note, source, source_id FROM busy_periods WHERE creator_id = ? ORDER BY start_date, end_date",
    creatorId,
  ).map((row) => ({
    id: row.id,
    startDate: row.start_date,
    endDate: row.end_date,
    note: row.note,
    source: row.source,
    sourceId: row.source_id,
  }));
}

function applicationCount(creatorId: number) {
  return Number(
    one<{ count: number }>(
      "SELECT COUNT(*) AS count FROM applications WHERE creator_id = ? AND status != 'draft'",
      creatorId,
    )?.count || 0,
  );
}

function copyQuota(row: CreatorRow): CopyQuota {
  const freeUsed = Number(row.free_generation_used || 0);
  const upgradeUsed = Number(row.upgrade_generation_used || 0);
  const freeLimit = Number(row.free_generation_limit ?? 3);
  const upgradeLimit = Number(row.upgrade_generation_limit ?? 0);
  return {
    freeLimit,
    freeUsed,
    freeRemaining: Math.max(0, freeLimit - freeUsed),
    upgradeLimit,
    upgradeUsed,
    upgradeRemaining: Math.max(0, upgradeLimit - upgradeUsed),
  };
}

function fieldEnabled(settings: PlatformSettings, key: string) {
  return settings.fieldRules[key]?.enabled !== false;
}

function fieldRequired(settings: PlatformSettings, key: string) {
  const rule = settings.fieldRules[key];
  return rule?.enabled !== false && rule?.required === true;
}

function mapCreator(row: CreatorRow, includePrivate = true): CreatorProfile {
  const tags = creatorTags(row.id);
  const workKeys = parseJson<string[]>(row.work_keys, []);
  const periods = getBusyPeriods(row.id);
  const settings = getPlatformSettings();
  const serviceIntents = parseJson<ServiceIntent[]>(row.service_intents, ["writer"]).filter(
    (item): item is ServiceIntent => item === "writer" || item === "opportunity",
  );
  const opportunityTypes = parseJson<string[]>(row.opportunity_types, []).filter((item) =>
    cooperationTypes.includes(item as (typeof cooperationTypes)[number]),
  );
  const precisionInviteGoals = parseJson<string[]>(row.precision_invite_goals, []).filter((item) =>
    precisionInviteGoalOptions.includes(item as (typeof precisionInviteGoalOptions)[number]),
  );
  const precisionInviteScenes = parseJson<string[]>(row.precision_invite_scenes, []).filter((item) =>
    precisionInviteSceneOptions.includes(item as (typeof precisionInviteSceneOptions)[number]),
  );
  const inviter = row.invited_by_creator_id
    ? one<{ id: number; user_name: string; brand_name: string; phone: string }>(
        "SELECT id, user_name, brand_name, phone FROM creators WHERE id = ?",
        row.invited_by_creator_id,
      )
    : one<{ id: number; user_name: string; brand_name: string; phone: string }>(
        "SELECT id, user_name, brand_name, phone FROM creators WHERE invite_code = ?",
        row.registered_with_code,
      );
  const manager = row.manager_admin_id
    ? one<{ id: number; phone: string; invite_code: string }>(
        "SELECT id, phone, invite_code FROM admin_accounts WHERE id = ?",
        row.manager_admin_id,
      )
    : one<{ id: number; phone: string; invite_code: string }>(
        "SELECT id, phone, invite_code FROM admin_accounts WHERE invite_code = ?",
        row.registered_with_code,
      );
  const platformInvite = inviter
    ? null
    : one<{ id: number }>("SELECT id FROM invite_codes WHERE code = ?", row.registered_with_code);
  const profileValues: Record<string, boolean> = {
    "profile.userName": Boolean(row.user_name),
    "profile.brandName": Boolean(row.brand_name),
    "profile.wechat": Boolean(row.wechat),
    "profile.socialAccount": Boolean(row.social_account),
    "profile.logo": Boolean(row.logo_key),
    "profile.workImages": workKeys.length === 1,
    "profile.intro": Boolean(row.intro),
    "profile.province": Boolean(row.province),
    "profile.city": Boolean(row.city),
  };
  const profileFieldKeys = fieldDefinitions
    .filter((definition) => definition.section === "我的")
    .map((definition) => definition.key);
  const enabledProfileFields = profileFieldKeys.filter((key) => fieldEnabled(settings, key));
  const profileRequirementsMet = enabledProfileFields.every(
    (key) => !fieldRequired(settings, key) || profileValues[key],
  );
  const scheduleRequirementsMet =
    !fieldRequired(settings, "schedule.availability") || Boolean(row.no_bookings) || periods.length > 0;
  const requiredTagCategories = Object.keys(settings.fieldRules)
    .filter((key) => key.startsWith("lights.category.") && fieldRequired(settings, key))
    .map((key) => key.slice("lights.category.".length));
  const lightsRequirementsMet =
    (!fieldRequired(settings, "lights.selection") || tags.length > 0) &&
    (!fieldRequired(settings, "lights.boothDescription") || Boolean(row.booth_description)) &&
    requiredTagCategories.every((category) => tags.some((tag) => tag.category === category));
  const dossierValues: Record<string, boolean> = {
    ...profileValues,
    "schedule.availability": Boolean(row.no_bookings) || periods.length > 0,
    "lights.selection": tags.length > 0,
    "opportunity.types": opportunityTypes.length > 0,
  };
  const enabledDossierFields = Object.keys(dossierValues).filter((key) => fieldEnabled(settings, key));
  const profileSubmitted = Boolean(row.profile_submitted_at) && profileRequirementsMet;
  const scheduleSubmitted = Boolean(row.schedule_confirmed_at) && scheduleRequirementsMet;
  const lightsSubmitted = Boolean(row.tags_submitted_at) && lightsRequirementsMet;
  const nextStep = !profileSubmitted
    ? "profile"
    : !scheduleSubmitted
      ? "schedule"
      : !lightsSubmitted
        ? "lights"
        : "complete";
  return {
    id: row.id,
    phone: includePrivate ? row.phone : undefined,
    inviteCode: row.invite_code,
    registeredWithCode: row.registered_with_code,
    invitedByCreatorId: inviter?.id || null,
    invitedByName: inviter
      ? inviter.brand_name || inviter.user_name || inviter.phone
      : platformInvite
        ? "平台邀请码"
        : manager
          ? `子管理员 ${manager.phone}`
        : "来源未知",
    managerAdminId: manager?.id || row.manager_admin_id || null,
    managerName: manager ? manager.phone : "平台直属",
    userName: row.user_name,
    brandName: row.brand_name,
    wechat: includePrivate ? row.wechat : "",
    intro: row.intro,
    boothDescription: row.booth_description,
    boothDescriptionConfirmedAt: row.booth_description_confirmed_at,
    province: row.province,
    city: row.city,
    district: row.district,
    socialAccount: row.social_account,
    logoKey: row.logo_key || "",
    logoUrl: assetUrl(row.logo_key),
    slogan: row.slogan,
    productImageKey: row.product_image_key,
    productImageUrl: assetUrl(row.product_image_key),
    boothImageKey: row.booth_image_key,
    boothImageUrl: assetUrl(row.booth_image_key),
    historyImageKey: row.history_image_key,
    historyImageUrl: assetUrl(row.history_image_key),
    workUrls: workKeys.map(assetUrl).filter(Boolean) as string[],
    representativeImageKey: workKeys[0] || "",
    representativeImageUrl: assetUrl(workKeys[0]),
    tags,
    busyPeriods: includePrivate ? periods : undefined,
    noBookings: Boolean(row.no_bookings),
    scheduleConfirmedAt: row.schedule_confirmed_at,
    profileSubmittedAt: row.profile_submitted_at,
    tagsSubmittedAt: row.tags_submitted_at,
    tagsFirstSubmittedAt: row.tags_first_submitted_at,
    introPopupSeenVersion: row.intro_popup_seen_version || "",
    onboarding: {
      profileSubmitted,
      scheduleSubmitted,
      lightsSubmitted,
      complete: nextStep === "complete",
      nextStep,
    },
    profileCompleteness: enabledDossierFields.length
      ? Math.round((enabledDossierFields.filter((key) => dossierValues[key]).length / enabledDossierFields.length) * 100)
      : 100,
    applicationLimit: row.application_limit,
    applicationCount: applicationCount(row.id),
    copyQuota: copyQuota(row),
    serviceIntents,
    opportunityTypes,
    opportunityOptIn: Boolean(row.opportunity_opt_in),
    precisionInviteGoals,
    precisionInviteScenes,
    xiaohongshuFollowers: row.xiaohongshu_followers == null ? null : Number(row.xiaohongshu_followers),
    xiaohongshuUrl: row.xiaohongshu_url || "",
    douyinFollowers: row.douyin_followers == null ? null : Number(row.douyin_followers),
    douyinUrl: row.douyin_url || "",
    adminRating: row.admin_rating || "",
    adminNote: row.admin_note || "",
    activityLimit: row.activity_limit,
    replyTimeoutMinutes: row.reply_timeout_minutes,
    suspended: Boolean(row.suspended),
    wecomBinding: getCreatorWecomBinding(row.id),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function getCreator(id: number) {
  const row = one<CreatorRow>("SELECT * FROM creators WHERE id = ?", id);
  return row ? mapCreator(row) : null;
}

export function getCreatorByPhone(phone: string) {
  const row = one<CreatorRow>("SELECT * FROM creators WHERE phone = ?", phone);
  return row ? mapCreator(row) : null;
}

function mapCopyGeneration(row: CopyGenerationRow): CopyGeneration {
  const stage = row.status === "completed" ? "completed" : row.status === "failed" ? "failed" : row.stage;
  return {
    id: row.id,
    creatorId: row.creator_id,
    creatorName: row.creator_name,
    brandName: row.brand_name,
    mode: row.mode,
    status: row.status,
    stage,
    attempts: row.attempts,
    title: row.title,
    body: row.body,
    visualFacts: parseJson<string[]>(row.visual_facts, []),
    usedTags: parseJson<string[]>(row.used_tags, []),
    error: row.error,
    templateVersion: row.template_version,
    provider: row.provider,
    model: row.model,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at,
    expiresAt: null,
  };
}

export function listCopyGenerations(creatorId?: number, limit = 200) {
  const where = creatorId ? "WHERE g.creator_id = ?" : "";
  const values = creatorId ? [creatorId, limit] : [limit];
  return all<CopyGenerationRow>(
    `SELECT g.*, c.user_name AS creator_name, c.brand_name
     FROM copy_generations g JOIN creators c ON c.id = g.creator_id
     ${where} ORDER BY g.created_at DESC, g.id DESC LIMIT ?`,
    ...values,
  ).map(mapCopyGeneration);
}

export function listCreatorCopyGenerations(creatorId: number, limit = 30) {
  return all<CopyGenerationRow>(
    `SELECT g.*, c.user_name AS creator_name, c.brand_name
     FROM copy_generations g JOIN creators c ON c.id = g.creator_id
     WHERE g.creator_id = ?
     ORDER BY g.created_at DESC, g.id DESC LIMIT ?`,
    creatorId,
    limit,
  ).map(mapCopyGeneration);
}

export function setCopyGenerationLimit(creatorId: number, mode: CopyMode, value: unknown) {
  if (mode !== "free" && mode !== "upgrade") throw new Error("额度类型不正确");
  if (!getCreator(creatorId)) throw new Error("用户不存在");
  const limit = Number(value);
  if (!Number.isInteger(limit) || limit < 0 || limit > 10000) throw new Error("生成额度不正确");
  const column = mode === "free" ? "free_generation_limit" : "upgrade_generation_limit";
  run(`UPDATE creators SET ${column} = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, limit, creatorId);
  return getCreator(creatorId)!;
}

export function beginCopyGeneration(
  creatorId: number,
  mode: CopyMode,
  snapshot: Record<string, unknown>,
  templateVersion: string,
  provider: string,
  model: string,
) {
  const creator = getCreator(creatorId);
  if (!creator) throw new Error("用户不存在");
  const settings = getPlatformSettings();
  if (fieldRequired(settings, "profile.workImages") && creator.workUrls.length !== 1) throw new Error("请先上传一张代表图片");
  if (fieldRequired(settings, "lights.selection") && !creator.tagsSubmittedAt) throw new Error("请先完成筛选标签");
  if (fieldRequired(settings, "schedule.availability") && !creator.scheduleConfirmedAt) throw new Error("请先完成活动计划");
  if (fieldRequired(settings, "opportunity.types") && !creator.opportunityTypes.length) throw new Error("请先完成合作需求");
  const db = getDb();
  db.exec("BEGIN IMMEDIATE");
  try {
    const row = db.prepare(`SELECT free_generation_limit, upgrade_generation_limit, free_generation_used,
      upgrade_generation_used, generation_schedule_confirmed_at, generation_schedule_confirmation_used_at
      FROM creators WHERE id = ?`).get(creatorId) as {
        free_generation_limit: number;
        upgrade_generation_limit: number;
        free_generation_used: number;
        upgrade_generation_used: number;
        generation_schedule_confirmed_at: string | null;
        generation_schedule_confirmation_used_at: string | null;
      };
    const confirmationFresh = Boolean(db.prepare(
      `SELECT 1 AS valid FROM creators WHERE id = ?
       AND generation_schedule_confirmed_at IS NOT NULL
       AND generation_schedule_confirmation_used_at IS NULL
       AND datetime(generation_schedule_confirmed_at) >= datetime('now', '-10 minutes')`,
    ).get(creatorId));
    if (!confirmationFresh || row.generation_schedule_confirmation_used_at)
      throw new Error("请先确认本次活动计划");
    const limit = mode === "free" ? row.free_generation_limit : row.upgrade_generation_limit;
    const used = mode === "free" ? row.free_generation_used : row.upgrade_generation_used;
    const processing = Number((db.prepare("SELECT COUNT(*) AS count FROM copy_generations WHERE creator_id = ? AND mode = ? AND status = 'processing'").get(creatorId, mode) as { count: number }).count);
    const occupied = used + processing;
    if (occupied >= limit) throw new Error("请联系客服申请使用额度。");
    db.prepare(
      "UPDATE creators SET generation_schedule_confirmation_used_at = CURRENT_TIMESTAMP WHERE id = ?",
    ).run(creatorId);
    const result = db.prepare(
      `INSERT INTO copy_generations(creator_id, mode, status, stage, input_snapshot, template_version, provider, model, updated_at)
       VALUES (?, ?, 'processing', 'queued', ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
    ).run(creatorId, mode, JSON.stringify(snapshot), templateVersion, provider, model);
    db.exec("COMMIT");
    return Number(result.lastInsertRowid);
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function recoverInterruptedCopyGenerations(staleOnly = false) {
  return run(
    `UPDATE copy_generations SET stage = 'queued', error = '', next_attempt_at = CURRENT_TIMESTAMP,
     updated_at = CURRENT_TIMESTAMP WHERE status = 'processing' AND stage NOT IN ('queued', 'retrying')
     ${staleOnly ? "AND datetime(updated_at) <= datetime('now', '-2 minutes')" : ""}`,
  ).changes;
}

export function claimNextCopyGeneration() {
  const db = getDb();
  db.exec("BEGIN IMMEDIATE");
  try {
    const row = db.prepare(
      `SELECT id FROM copy_generations
       WHERE status = 'processing' AND stage IN ('queued', 'retrying')
       AND (next_attempt_at IS NULL OR datetime(next_attempt_at) <= CURRENT_TIMESTAMP)
       ORDER BY created_at, id LIMIT 1`,
    ).get() as { id: number } | undefined;
    if (!row) {
      db.exec("COMMIT");
      return null;
    }
    db.prepare(
      `UPDATE copy_generations SET stage = 'analyzing', attempts = attempts + 1,
       error = '', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'processing'`,
    ).run(row.id);
    db.exec("COMMIT");
    return one<CopyGenerationRow>("SELECT * FROM copy_generations WHERE id = ?", row.id);
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function setCopyGenerationStage(id: number, stage: Extract<CopyGenerationStage, "analyzing" | "writing" | "checking">) {
  run(
    "UPDATE copy_generations SET stage = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'processing'",
    stage,
    id,
  );
}

export function scheduleCopyGenerationRetry(id: number, error: unknown, delaySeconds: number) {
  const message = cleanText(error instanceof Error ? error.message : String(error || "生成失败"), 300);
  const nextAttemptAt = new Date(Date.now() + Math.max(1, delaySeconds) * 1000)
    .toISOString()
    .slice(0, 19)
    .replace("T", " ");
  run(
    `UPDATE copy_generations SET stage = 'retrying', error = ?, next_attempt_at = ?,
     updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'processing'`,
    message,
    nextAttemptAt,
    id,
  );
}

export function completeCopyGeneration(
  id: number,
  titleInput: string,
  bodyInput: string,
  metadata: { visualFacts?: string[]; usedTags?: string[] } = {},
) {
  const title = cleanText(titleInput, 80);
  let body = cleanText(bodyInput, 500);
  if (!title || !body) throw new Error("生成结果不完整");
  const remaining = 500 - title.length;
  if (remaining < 1) throw new Error("生成标题过长");
  body = body.slice(0, remaining);
  const safety = contentSafety(title, body);
  if (safety) throw new Error(safety);
  const db = getDb();
  db.exec("BEGIN IMMEDIATE");
  try {
    const task = db.prepare(
      "SELECT creator_id, mode FROM copy_generations WHERE id = ? AND status = 'processing'",
    ).get(id) as { creator_id: number; mode: CopyMode } | undefined;
    if (!task) {
      db.exec("ROLLBACK");
      return null;
    }
    const updated = db.prepare(
      `UPDATE copy_generations SET status = 'completed', stage = 'completed', title = ?, body = ?,
       visual_facts = ?, used_tags = ?, error = '', updated_at = CURRENT_TIMESTAMP,
       completed_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'processing'`,
    ).run(
      title,
      body,
      JSON.stringify((metadata.visualFacts || []).map((item) => cleanText(item, 80)).filter(Boolean).slice(0, 8)),
      JSON.stringify((metadata.usedTags || []).map((item) => cleanText(item, 20)).filter(Boolean).slice(0, 12)),
      id,
    );
    if (!updated.changes) {
      db.exec("ROLLBACK");
      return null;
    }
    const usageColumn = task.mode === "free" ? "free_generation_used" : "upgrade_generation_used";
    db.prepare(`UPDATE creators SET ${usageColumn} = ${usageColumn} + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(task.creator_id);
    db.prepare(
      `DELETE FROM copy_generations WHERE creator_id = ? AND mode = ? AND id != ? AND status != 'processing'`,
    ).run(task.creator_id, task.mode, id);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  const row = one<CopyGenerationRow>(
    `SELECT g.*, c.user_name AS creator_name, c.brand_name FROM copy_generations g
     JOIN creators c ON c.id = g.creator_id WHERE g.id = ?`,
    id,
  )!;
  return mapCopyGeneration(row);
}

export function copyGenerationDeadlineCandidates(seconds = 5) {
  const safeSeconds = Math.max(1, Math.min(60, Math.floor(seconds)));
  return all<CopyGenerationRow>(
    `SELECT * FROM copy_generations
     WHERE status = 'processing' AND mode = 'upgrade'
     AND datetime(created_at) <= datetime('now', ?)
     ORDER BY created_at, id LIMIT 100`,
    `-${safeSeconds} seconds`,
  );
}

export function isCopyGenerationProcessing(id: number) {
  return Boolean(one("SELECT id FROM copy_generations WHERE id = ? AND status = 'processing'", id));
}

export function failCopyGeneration(id: number, error: unknown) {
  const message = cleanText(error instanceof Error ? error.message : String(error || "生成失败"), 300);
  run(
    `UPDATE copy_generations SET status = 'failed', stage = 'failed', error = ?,
     updated_at = CURRENT_TIMESTAMP, completed_at = CURRENT_TIMESTAMP
     WHERE id = ? AND status = 'processing'`,
    message,
    id,
  );
}

export function getCopyGeneration(id: number) {
  const row = one<CopyGenerationRow>(
    `SELECT g.*, c.user_name AS creator_name, c.brand_name FROM copy_generations g
     JOIN creators c ON c.id = g.creator_id WHERE g.id = ?`,
    id,
  );
  return row ? mapCopyGeneration(row) : null;
}

export function addCopyGenerationInbox(
  creatorId: number,
  generation: CopyGeneration,
  success: boolean,
) {
  const settings = getPlatformSettings().writerUi;
  const mode = generation.mode === "upgrade" ? settings.upgradeTitle : settings.freeTitle;
  const values = { "{模式}": mode, "{标题}": generation.title || "本次文案" };
  const render = (template: string) => Object.entries(values).reduce(
    (result, [key, value]) => result.replaceAll(key, value),
    template,
  );
  run(
    `INSERT INTO inbox_messages(recipient_id, kind, subject, body, href)
     VALUES (?, 'system', ?, ?, '/studio?section=writer')`,
    creatorId,
    success ? settings.completedNotificationSubject : settings.failedNotificationSubject,
    render(success ? settings.completedNotificationBody : settings.failedNotificationBody),
  );
}

export function listTags(includePending = false) {
  const visibleCategories = new Set<string>([
    ...tagCategoryNames,
    ...Object.keys(projectTagSeeds),
  ]);
  return all<TagRow>(
    `SELECT id, label, category, status FROM tags ${includePending ? "" : "WHERE status = 'active'"} ORDER BY id`,
  ).filter((tag) => visibleCategories.has(tag.category));
}

export function listCreatorTags(includePending = false) {
  return listTags(includePending).filter((tag) => tagCategoryNames.includes(tag.category));
}

function mapTrendTerm(row: TrendTermRow): TrendTerm {
  return {
    id: row.id,
    term: row.term,
    source: row.source,
    relatedTags: parseJson<string[]>(row.related_tags, []),
    relatedCategories: parseJson<string[]>(row.related_categories, []),
    score: row.score,
    confidence: row.confidence,
    risk: row.risk,
    status: row.status,
    useCount: row.use_count,
    expiresAt: row.expires_at,
    lastUsedAt: row.last_used_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function getTrendSettings(): TrendSettings {
  const row = one<{
    automatic_update: number;
    update_interval_hours: number;
    weekly_full_update_day: number;
    daily_cleanup_hour: number;
    rotation_batch_size: number;
    base_enabled: number;
    upgrade_enabled: number;
    base_max_terms: number;
    upgrade_max_terms: number;
    last_auto_update_at: string | null;
    last_full_update_at: string | null;
  }>("SELECT * FROM trend_settings WHERE id = 1")!;
  return {
    automaticUpdate: Boolean(row.automatic_update),
    updateIntervalHours: row.update_interval_hours,
    weeklyFullUpdateDay: row.weekly_full_update_day,
    dailyCleanupHour: row.daily_cleanup_hour,
    rotationBatchSize: row.rotation_batch_size,
    baseEnabled: Boolean(row.base_enabled),
    upgradeEnabled: Boolean(row.upgrade_enabled),
    baseMaxTerms: row.base_max_terms,
    upgradeMaxTerms: row.upgrade_max_terms,
    lastAutoUpdateAt: row.last_auto_update_at,
    lastFullUpdateAt: row.last_full_update_at,
  };
}

export function updateTrendSettings(input: Partial<TrendSettings>) {
  const current = getTrendSettings();
  const integer = (value: unknown, fallback: number, min: number, max: number) => {
    const parsed = Number(value);
    return Number.isInteger(parsed) ? Math.max(min, Math.min(max, parsed)) : fallback;
  };
  run(
    `UPDATE trend_settings SET automatic_update = ?, update_interval_hours = ?,
     weekly_full_update_day = ?, daily_cleanup_hour = ?, rotation_batch_size = ?,
     base_enabled = ?, upgrade_enabled = ?, base_max_terms = ?, upgrade_max_terms = ?,
     updated_at = CURRENT_TIMESTAMP WHERE id = 1`,
    input.automaticUpdate ?? current.automaticUpdate ? 1 : 0,
    integer(input.updateIntervalHours, current.updateIntervalHours, 1, 168),
    integer(input.weeklyFullUpdateDay, current.weeklyFullUpdateDay, 0, 6),
    integer(input.dailyCleanupHour, current.dailyCleanupHour, 0, 23),
    integer(input.rotationBatchSize, current.rotationBatchSize, 1, 200),
    input.baseEnabled ?? current.baseEnabled ? 1 : 0,
    input.upgradeEnabled ?? current.upgradeEnabled ? 1 : 0,
    integer(input.baseMaxTerms, current.baseMaxTerms, 0, 3),
    integer(input.upgradeMaxTerms, current.upgradeMaxTerms, 0, 5),
  );
  return getTrendSettings();
}

export function listTrendTerms() {
  run(
    "UPDATE trend_terms SET status = 'expired', updated_at = CURRENT_TIMESTAMP WHERE status = 'enabled' AND expires_at IS NOT NULL AND datetime(expires_at) <= CURRENT_TIMESTAMP",
  );
  return all<TrendTermRow>("SELECT * FROM trend_terms ORDER BY status = 'enabled' DESC, score DESC, updated_at DESC, id DESC").map(mapTrendTerm);
}

export function saveTrendTerm(input: Record<string, unknown>) {
  const id = Number(input.id || 0);
  const term = cleanText(input.term, 30);
  const source = cleanText(input.source, 30) || "管理员录入";
  const status = ["enabled", "pending", "expired", "blacklist"].includes(String(input.status))
    ? String(input.status) as TrendTermStatus
    : "pending";
  const labels = (value: unknown, max: number) => Array.isArray(value)
    ? [...new Set(value.map((item) => cleanText(item, 20)).filter(Boolean))].slice(0, max)
    : [];
  const relatedTags = labels(input.relatedTags, 20);
  const relatedCategories = labels(input.relatedCategories, 10);
  const bounded = (value: unknown, fallback: number) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.max(0, Math.min(100, parsed)) : fallback;
  };
  const expiresAt = cleanText(input.expiresAt, 30) || null;
  if (!term) throw new Error("请填写趋势词");
  const safety = contentSafety(term, source, ...relatedTags);
  if (safety) throw new Error(safety);
  if (id) {
    const updated = run(
      `UPDATE trend_terms SET term = ?, source = ?, related_tags = ?, related_categories = ?,
       score = ?, confidence = ?, risk = ?, status = ?, expires_at = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      term,
      source,
      JSON.stringify(relatedTags),
      JSON.stringify(relatedCategories),
      bounded(input.score, 50),
      bounded(input.confidence, 50),
      bounded(input.risk, 0),
      status,
      expiresAt,
      id,
    );
    if (!updated.changes) throw new Error("趋势词不存在");
  } else {
    run(
      `INSERT INTO trend_terms(term, source, related_tags, related_categories, score, confidence, risk, status, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      term,
      source,
      JSON.stringify(relatedTags),
      JSON.stringify(relatedCategories),
      bounded(input.score, 50),
      bounded(input.confidence, 50),
      bounded(input.risk, 0),
      status,
      expiresAt,
    );
  }
  return listTrendTerms();
}

export function deleteTrendTerm(id: number) {
  if (!run("DELETE FROM trend_terms WHERE id = ?", id).changes) throw new Error("趋势词不存在");
  return listTrendTerms();
}

export function refreshTrendTerms(full = false) {
  const settings = getTrendSettings();
  const rows = all<{ label: string; category: string; uses: number }>(
    `SELECT t.label, t.category, COUNT(ct.creator_id) AS uses
     FROM tags t LEFT JOIN creator_tags ct ON ct.tag_id = t.id
     WHERE t.status = 'active' GROUP BY t.id ORDER BY uses DESC, t.updated_at DESC
     LIMIT ?`,
    settings.rotationBatchSize,
  );
  const expiresAt = new Date(Date.now() + 8 * 86400000).toISOString();
  for (const item of rows) {
    const score = Math.min(95, 45 + item.uses * 5);
    run(
      `INSERT INTO trend_terms(term, source, related_tags, related_categories, score, confidence, risk, status, expires_at)
       VALUES (?, '站内标签热度', ?, ?, ?, ?, 0, 'enabled', ?)
       ON CONFLICT(term) DO UPDATE SET source = '站内标签热度', related_tags = excluded.related_tags,
       related_categories = excluded.related_categories, score = excluded.score,
       confidence = excluded.confidence, status = CASE WHEN trend_terms.status = 'blacklist' THEN 'blacklist' ELSE 'enabled' END,
       expires_at = excluded.expires_at, updated_at = CURRENT_TIMESTAMP`,
      item.label,
      JSON.stringify([item.label]),
      JSON.stringify([item.category]),
      score,
      Math.min(90, 55 + item.uses * 4),
      expiresAt,
    );
  }
  run(
    `UPDATE trend_settings SET last_auto_update_at = CURRENT_TIMESTAMP,
     last_full_update_at = CASE WHEN ? = 1 THEN CURRENT_TIMESTAMP ELSE last_full_update_at END,
     updated_at = CURRENT_TIMESTAMP WHERE id = 1`,
    full ? 1 : 0,
  );
  return { terms: listTrendTerms(), settings: getTrendSettings() };
}

export function selectTrendTerms(creator: CreatorProfile, mode: CopyMode, variant = 0) {
  const settings = getTrendSettings();
  const max = mode === "free" ? settings.baseMaxTerms : settings.upgradeMaxTerms;
  if (!max || (mode === "free" ? !settings.baseEnabled : !settings.upgradeEnabled)) return [];
  const creatorTags = new Set(creator.tags.map((item) => item.label));
  const categories = new Set(creator.tags.map((item) => item.category));
  const matched = listTrendTerms().filter((item) => item.status === "enabled" && item.risk < 60).filter((item) =>
    item.relatedTags.some((label) => creatorTags.has(label))
    || item.relatedCategories.some((category) => categories.has(category))
    || creatorTags.has(item.term),
  );
  const offset = matched.length ? Math.abs(variant) % matched.length : 0;
  const selected = [...matched.slice(offset), ...matched.slice(0, offset)].slice(0, max);
  for (const item of selected)
    run("UPDATE trend_terms SET use_count = use_count + 1, last_used_at = CURRENT_TIMESTAMP WHERE id = ?", item.id);
  return selected.map((item) => item.term);
}

function themeTagIds(themeId: number) {
  return all<{ tag_id: number }>(
    "SELECT tag_id FROM theme_tags WHERE theme_id = ? ORDER BY tag_id",
    themeId,
  ).map((item) => item.tag_id);
}

function mapTheme(row: ThemeRow): Theme {
  return {
    id: row.id,
    title: row.title,
    category: row.category,
    description: row.description,
    posterUrl: assetUrl(row.poster_key) || categoryPosterPath(row.category),
    accent: row.accent,
    tagIds: themeTagIds(row.id),
    active: Boolean(row.active),
    sortOrder: row.sort_order,
  };
}

export function listThemes(includeInactive = false) {
  return all<ThemeRow>(
    `SELECT * FROM themes ${includeInactive ? "" : "WHERE active = 1"} ORDER BY sort_order, id`,
  ).map(mapTheme);
}

const inviteAlphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
const claimCodeLength = 8;
const activeCreatorInviteSql = `SELECT c.id, c.manager_admin_id
  FROM creators c
  LEFT JOIN admin_accounts a ON a.id = c.manager_admin_id
  LEFT JOIN creator_applications ca ON ca.creator_id = c.id
  WHERE c.invite_code = ? AND c.suspended = 0
    AND (c.manager_admin_id IS NULL OR a.status = 'active')
    AND (ca.creator_id IS NULL OR ca.status = 'active')`;

function newInviteCode(length = 6) {
  let code = "";
  do {
    const bytes = crypto.randomBytes(length);
    code = Array.from(bytes, (byte) => inviteAlphabet[byte % inviteAlphabet.length]).join("");
  }
  while (
    one("SELECT id FROM creators WHERE invite_code = ?", code) ||
    one("SELECT id FROM invite_codes WHERE code = ?", code) ||
    one("SELECT id FROM admin_accounts WHERE invite_code = ?", code)
  );
  return code;
}

function claimCodeHash(code: string) {
  const pepper = process.env.CREATOR_CLAIM_CODE_PEPPER || "qideng-creator-claim-v1";
  return crypto.createHash("sha256").update(`${pepper}:${code}`).digest("hex");
}

function newCreatorClaimCode() {
  const bytes = crypto.randomBytes(claimCodeLength);
  return Array.from(bytes, (byte) => inviteAlphabet[byte % inviteAlphabet.length]).join("");
}

export function generateCreatorClaimCode(creatorId: number, actor: string) {
  const creator = getCreator(creatorId);
  if (!creator) throw new Error("TDE新遇官不存在");
  if (!one("SELECT id FROM creators WHERE id = ? AND created_by_admin_id IS NOT NULL", creatorId))
    throw new Error("只有管理员代建的档案可以生成认领码");
  if (one("SELECT creator_id FROM creator_wechat_bindings WHERE creator_id = ?", creatorId))
    throw new Error("该新遇官档案已经绑定微信，无需认领码");
  let code = newCreatorClaimCode();
  while (one("SELECT id FROM creator_claim_tokens WHERE code_hash = ?", claimCodeHash(code))) code = newCreatorClaimCode();
  const expiresAt = new Date(Date.now() + 7 * 86400000).toISOString();
  transaction(() => {
    run(
      `UPDATE creator_claim_tokens SET revoked_at = COALESCE(revoked_at, CURRENT_TIMESTAMP)
       WHERE creator_id = ? AND consumed_at IS NULL AND revoked_at IS NULL`,
      creatorId,
    );
    run(
      `INSERT INTO creator_claim_tokens(creator_id, code_hash, expires_at, created_by)
       VALUES (?, ?, ?, ?)`,
      creatorId,
      claimCodeHash(code),
      expiresAt,
      cleanText(actor, 40),
    );
    run(
      "INSERT INTO audit_logs(actor, action, detail) VALUES (?, 'creator_claim_code_generate', ?)",
      cleanText(actor, 40),
      JSON.stringify({ creatorId, expiresAt }),
    );
  });
  return { creatorId, code, expiresAt };
}

export function revokeCreatorClaimCodes(creatorId: number, actor: string) {
  if (!getCreator(creatorId)) throw new Error("TDE新遇官不存在");
  run(
    `UPDATE creator_claim_tokens SET revoked_at = COALESCE(revoked_at, CURRENT_TIMESTAMP)
     WHERE creator_id = ? AND consumed_at IS NULL AND revoked_at IS NULL`,
    creatorId,
  );
  run(
    "INSERT INTO audit_logs(actor, action, detail) VALUES (?, 'creator_claim_code_revoke', ?)",
    cleanText(actor, 40),
    JSON.stringify({ creatorId }),
  );
  return { creatorId, revoked: true };
}

export function creatorClaimCodeHash(code: string) {
  return claimCodeHash(cleanText(code, claimCodeLength).toUpperCase());
}

export function validateInviteCode(input: string) {
  const code = input.trim().toUpperCase();
  if (!/^[A-Z0-9]{4,8}$/.test(code)) return false;
  return Boolean(
    one("SELECT id FROM invite_codes WHERE code = ? AND active = 1", code) ||
      one(activeCreatorInviteSql, code) ||
      one("SELECT id FROM admin_accounts WHERE invite_code = ? AND status = 'active'", code),
  );
}

export function listInviteCodes() {
  return all<{
    id: number;
    code: string;
    source: string;
    active: number;
    created_at: string;
  }>("SELECT id, code, source, active, created_at FROM invite_codes ORDER BY created_at DESC").map(
    (row): InviteCode => ({
      id: row.id,
      code: row.code,
      source: row.source,
      active: Boolean(row.active),
      createdAt: row.created_at,
    }),
  );
}

export function createInviteCode(input?: unknown) {
  let code = cleanText(input, 8).toUpperCase();
  if (!code) code = newInviteCode();
  if (!/^[A-Z0-9]{4,8}$/.test(code)) throw new Error("邀请码必须为 4 至 8 位字母或数字");
  if (one("SELECT id FROM invite_codes WHERE code = ?", code) || one("SELECT id FROM creators WHERE invite_code = ?", code) || one("SELECT id FROM admin_accounts WHERE invite_code = ?", code))
    throw new Error("邀请码已存在");
  run("INSERT INTO invite_codes(code, source, active) VALUES (?, 'platform', 1)", code);
  return listInviteCodes();
}

export function toggleInviteCode(id: number, active: boolean) {
  const result = run("UPDATE invite_codes SET active = ? WHERE id = ?", active ? 1 : 0, id);
  if (!result.changes) throw new Error("邀请码不存在");
  return listInviteCodes();
}

export function registerAdminAccount(phoneInput: unknown, confirmPhoneInput: unknown) {
  const phone = cleanText(phoneInput, 11);
  const confirmPhone = cleanText(confirmPhoneInput, 11);
  if (!validPhone(phone)) throw new Error("手机号格式不正确");
  if (phone !== confirmPhone) throw new Error("两次输入的手机号不一致");
  if (one("SELECT id FROM admin_accounts WHERE phone = ?", phone))
    throw new Error("这个手机号已经提交过申请");
  const credentials = hashSecret(phone);
  run(
    `INSERT INTO admin_accounts(phone, password_hash, password_salt, invite_code)
     VALUES (?, ?, ?, ?)`,
    phone,
    credentials.hash,
    credentials.salt,
    newInviteCode(),
  );
  return one<AdminAccountRow>("SELECT * FROM admin_accounts WHERE phone = ?", phone)!;
}

export function loginAdminAccount(phone: string, password: string) {
  const row = one<AdminAccountRow>("SELECT * FROM admin_accounts WHERE phone = ?", phone);
  if (!row || !verifySecret(password, row.password_salt, row.password_hash)) return null;
  if (row.status === "pending") throw new Error("账号正在等待超级管理员审核");
  if (row.status === "rejected") throw new Error("账号申请未通过，请联系超级管理员");
  if (row.status === "suspended") throw new Error("账号已停用，请联系超级管理员");
  return { id: row.id, role: "subadmin" as const, label: row.phone };
}

function mapAdminAccount(row: AdminAccountRow): AdminAccount {
  const totalUsers = Number(one<{ count: number }>(
    "SELECT COUNT(*) AS count FROM creators WHERE manager_admin_id = ?",
    row.id,
  )?.count || 0);
  const directUsers = Number(one<{ count: number }>(
    `SELECT COUNT(*) AS count FROM creators
     WHERE manager_admin_id = ? AND invited_by_creator_id IS NULL`,
    row.id,
  )?.count || 0);
  return {
    id: row.id,
    name: row.name || "",
    phone: row.phone,
    status: row.status,
    inviteCode: row.invite_code,
    approvedAt: row.approved_at,
    approvedBy: row.approved_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    directUsers,
    totalUsers,
  };
}

export function listAdminAccounts() {
  return all<AdminAccountRow>("SELECT * FROM admin_accounts ORDER BY created_at DESC").map(mapAdminAccount);
}

export function createAdminAccount(
  nameInput: unknown,
  phoneInput: unknown,
  actor: string,
) {
  const name = cleanText(nameInput, 40);
  const phone = cleanText(phoneInput, 11);
  if (!name) throw new Error("请填写子管理员姓名");
  if (!validPhone(phone)) throw new Error("手机号格式不正确");
  if (one("SELECT id FROM admin_accounts WHERE phone = ?", phone))
    throw new Error("该手机号已被使用");
  const credentials = hashSecret(phone);
  run(
    `INSERT INTO admin_accounts(phone, password_hash, password_salt, invite_code, name, status, approved_at, approved_by)
     VALUES (?, ?, ?, ?, ?, 'active', CURRENT_TIMESTAMP, ?)`,
    phone,
    credentials.hash,
    credentials.salt,
    newInviteCode(),
    name,
    cleanText(actor, 40),
  );
  run(
    "INSERT INTO audit_logs(actor, action, detail) VALUES (?, 'admin_account_create', ?)",
    cleanText(actor, 40),
    JSON.stringify({ name, phone }),
  );
  return listAdminAccounts();
}

export function updateAdminAccount(
  id: number,
  data: { status?: unknown; inviteCode?: unknown; name?: unknown; phone?: unknown; password?: unknown },
  actor: string,
) {
  const row = one<AdminAccountRow>("SELECT * FROM admin_accounts WHERE id = ?", id);
  if (!row) throw new Error("子管理员不存在");
  const status = data.status !== undefined ? String(data.status) : row.status;
  if (!["pending", "active", "suspended", "rejected"].includes(status))
    throw new Error("审核状态不正确");
  const inviteCode = data.inviteCode !== undefined ? cleanText(data.inviteCode, 8).toUpperCase() : row.invite_code;
  if (!/^[A-Z0-9]{4,8}$/.test(inviteCode)) throw new Error("固定邀请码需要4至8位字母或数字");
  if (
    one("SELECT id FROM creators WHERE invite_code = ?", inviteCode) ||
    one("SELECT id FROM invite_codes WHERE code = ?", inviteCode) ||
    one("SELECT id FROM admin_accounts WHERE invite_code = ? AND id != ?", inviteCode, id)
  ) throw new Error("邀请码已被使用");
  const name = data.name !== undefined ? cleanText(data.name, 40) : row.name;
  let phone = row.phone;
  if (data.phone !== undefined) {
    phone = cleanText(data.phone, 11);
    if (!validPhone(phone)) throw new Error("手机号格式不正确");
    if (one("SELECT id FROM admin_accounts WHERE phone = ? AND id != ?", phone, id))
      throw new Error("该手机号已被其他账号使用");
  }
  let credentials: { hash: string; salt: string } | null = null;
  if (data.password !== undefined) {
    const password = cleanText(data.password, 64);
    if (password.length < 6) throw new Error("登录密码至少需要6位");
    credentials = hashSecret(password);
  }
  run(
    `UPDATE admin_accounts SET status = ?, invite_code = ?, name = ?, phone = ?,
     password_hash = COALESCE(?, password_hash),
     password_salt = COALESCE(?, password_salt),
     approved_at = CASE WHEN ? = 'active' THEN COALESCE(approved_at, CURRENT_TIMESTAMP) ELSE approved_at END,
     approved_by = CASE WHEN ? = 'active' THEN ? ELSE approved_by END,
     updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    status,
    inviteCode,
    name,
    phone,
    credentials ? credentials.hash : null,
    credentials ? credentials.salt : null,
    status,
    status,
    cleanText(actor, 40),
    id,
  );
  run(
    "INSERT INTO audit_logs(actor, action, detail) VALUES (?, 'admin_account_update', ?)",
    cleanText(actor, 40),
    JSON.stringify({ id, status, inviteCode, name, phone, passwordChanged: Boolean(credentials) }),
  );
  return listAdminAccounts();
}

export function changeMyAdminPassword(id: number, passwordInput: unknown) {
  const password = cleanText(passwordInput, 64);
  if (password.length < 6) throw new Error("登录密码至少需要6位");
  const credentials = hashSecret(password);
  run(
    "UPDATE admin_accounts SET password_hash = ?, password_salt = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
    credentials.hash,
    credentials.salt,
    id,
  );
  run(
    "INSERT INTO audit_logs(actor, action, detail) VALUES (?, 'admin_password_change', ?)",
    String(id),
    JSON.stringify({ id }),
  );
  return true;
}

export function createManagedCreator(
  managerId: number,
  input: Record<string, unknown>,
  actor: string,
) {
  const manager = one<AdminAccountRow>("SELECT * FROM admin_accounts WHERE id = ? AND status = 'active'", managerId);
  if (!manager) throw new Error("子管理员账号不可用");
  const phone = cleanText(input.phone, 11);
  if (!validPhone(phone)) throw new Error("手机号格式不正确");
  if (one("SELECT id FROM creators WHERE phone = ?", phone)) throw new Error("这个手机号已经注册");
  const province = cleanText(input.province, 20);
  const city = cleanText(input.city, 30);
  const district = cleanText(input.district, 30);
  if (province && city && !isValidLocation(province, city, district))
    throw new Error("请选择有效的省、市、区");
  const brandName = cleanText(input.brandName, 40);
  const credentials = hashSecret(crypto.randomBytes(32).toString("hex"));
  const result = run(
    `INSERT INTO creators(phone, password_hash, password_salt, password_login_enabled, invite_code, registered_with_code,
     manager_admin_id, created_by_admin_id, brand_name, province, city, district,
     free_generation_limit, upgrade_generation_limit, service_intents)
     VALUES (?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, 3, 3, '["writer","opportunity"]')`,
    phone,
    credentials.hash,
    credentials.salt,
    newInviteCode(),
    manager.invite_code,
    managerId,
    managerId,
    brandName,
    province,
    city,
    district,
  );
  const creatorId = Number(result.lastInsertRowid);
  run(
    "INSERT INTO audit_logs(actor, action, detail) VALUES (?, 'managed_creator_create', ?)",
    cleanText(actor, 40),
    JSON.stringify({ creatorId, managerId, phone }),
  );
  return getCreator(creatorId)!;
}

export function registerCreator(
  phone: string,
  password: string,
  invitationCode: string,
  phoneVerified = false,
  province = "",
  city = "",
  wechat = "",
  serviceIntentsInput: unknown = ["writer"],
  opportunityTypesInput: unknown = [],
  opportunityOptInInput: unknown = false,
  invitationRequired = true,
) {
  const normalizedInvitation = invitationCode.trim().toUpperCase();
  const credentials = hashSecret(password);
  const rewardText = getPlatformSettings().uiText;
  const db = getDb();
  return transaction(() => {
    if (db.prepare("SELECT id FROM creators WHERE phone = ?").get(phone))
      throw new Error("这个手机号已经注册，直接登录即可。");
    const platformInvite = db.prepare(
      "SELECT id FROM invite_codes WHERE code = ? AND active = 1",
    ).get(normalizedInvitation);
    const inviter = db.prepare(activeCreatorInviteSql).get(normalizedInvitation) as
      | { id: number; manager_admin_id: number | null }
      | undefined;
    const manager = db.prepare(
      "SELECT id FROM admin_accounts WHERE invite_code = ? AND status = 'active'",
    ).get(normalizedInvitation) as { id: number } | undefined;
    if ((invitationRequired || normalizedInvitation) &&
      (!/^[A-Z0-9]{4,8}$/.test(normalizedInvitation) || (!platformInvite && !inviter && !manager)))
      throw new Error("邀请码无效，请检查或联系TDE");

    const serviceIntents = Array.isArray(serviceIntentsInput)
      ? [...new Set(serviceIntentsInput.map(String).filter((item): item is ServiceIntent => item === "writer" || item === "opportunity"))]
      : ["writer"];
    if (!serviceIntents.length) serviceIntents.push("writer");
    const opportunityTypes = Array.isArray(opportunityTypesInput)
      ? [...new Set(opportunityTypesInput.map(String).filter((item) => cooperationTypes.includes(item as (typeof cooperationTypes)[number])))]
      : [];
    const opportunityOptIn = serviceIntents.includes("opportunity") && opportunityOptInInput === true;

    const result = db.prepare(
      `INSERT INTO creators(phone, phone_verified_at, password_hash, password_salt, invite_code,
       registered_with_code, manager_admin_id, invited_by_creator_id, province, city, wechat,
       free_generation_limit, upgrade_generation_limit, service_intents, opportunity_types, opportunity_opt_in)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 3, 3, ?, ?, ?)`,
    ).run(
      phone,
      phoneVerified ? new Date().toISOString() : null,
      credentials.hash,
      credentials.salt,
      newInviteCode(),
      normalizedInvitation,
      manager?.id || inviter?.manager_admin_id || null,
      inviter?.id || null,
      cleanText(province, 20),
      cleanText(city, 30),
      cleanText(wechat, 40),
      JSON.stringify(serviceIntents),
      JSON.stringify(opportunityTypes),
      opportunityOptIn ? 1 : 0,
    );
    const id = Number(result.lastInsertRowid);
    if (inviter) {
      db.prepare(
        `UPDATE creators SET free_generation_limit = free_generation_limit + 2,
         upgrade_generation_limit = upgrade_generation_limit + 2,
         updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      ).run(inviter.id);
      db.prepare(
        `INSERT INTO inbox_messages(recipient_id, kind, subject, body, href)
         VALUES (?, 'system', ?, ?, '/studio?section=profile&view=inbox')`,
      ).run(
        inviter.id,
        rewardText["invite.rewardSubject"],
        rewardText["invite.rewardBody"],
      );
    }
    db.prepare(
      `INSERT INTO inbox_messages(recipient_id, kind, subject, body, href)
       VALUES (?, 'system', ?, ?, '/studio?section=dossier')`,
    ).run(id, rewardText["join.welcomeSubject"], rewardText["join.welcomeBody"]);
    return id;
  });
}

export function loginCreator(phone: string, password: string) {
  const row = one<CreatorRow>("SELECT * FROM creators WHERE phone = ?", phone);
  if (!row || !row.password_login_enabled || !verifySecret(password, row.password_salt, row.password_hash)) return null;
  if (row.suspended) throw new Error("账户已暂停，请联系TDE");
  return row.id;
}

export function loginCreatorByVerifiedPhone(phone: string) {
  const row = one<CreatorRow>("SELECT * FROM creators WHERE phone = ?", phone);
  if (!row || !row.password_login_enabled) return null;
  if (row.suspended) throw new Error("账户已暂停，请联系TDE");
  run(
    "UPDATE creators SET phone_verified_at = COALESCE(phone_verified_at, CURRENT_TIMESTAMP), updated_at = CURRENT_TIMESTAMP WHERE id = ?",
    row.id,
  );
  return row.id;
}

export function resetCreatorPassword(phone: string, password: string) {
  const row = one<CreatorRow>("SELECT * FROM creators WHERE phone = ?", phone);
  if (!row) throw new Error("这个手机号还没有注册");
  if (!row.password_login_enabled) throw new Error("当前新遇官使用微信授权登录，无需设置密码");
  const credentials = hashSecret(password);
  run(
    `UPDATE creators SET password_hash = ?, password_salt = ?,
     phone_verified_at = COALESCE(phone_verified_at, CURRENT_TIMESTAMP),
     updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    credentials.hash,
    credentials.salt,
    row.id,
  );
  return row.id;
}

export function changeCreatorPassword(creatorId: number, currentPassword: string, nextPassword: string) {
  const row = one<CreatorRow>("SELECT * FROM creators WHERE id = ?", creatorId);
  if (row && !row.password_login_enabled) throw new Error("当前新遇官使用微信授权登录，无需设置密码");
  if (!row || !verifySecret(currentPassword, row.password_salt, row.password_hash))
    throw new Error("当前密码不正确");
  if (nextPassword.length < 8 || nextPassword.length > 72)
    throw new Error("新密码需要为 8 至 72 个字符");
  const credentials = hashSecret(nextPassword);
  run(
    "UPDATE creators SET password_hash = ?, password_salt = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
    credentials.hash,
    credentials.salt,
    creatorId,
  );
}

export function registerWechatCreator(
  phone: string,
  invitationCode: string,
  province = "",
  city = "",
  serviceIntentsInput: unknown = ["opportunity"],
  opportunityTypesInput: unknown = [],
  opportunityOptInInput: unknown = false,
  invitationRequired = true,
) {
  const creatorId = registerCreator(
    phone,
    crypto.randomBytes(32).toString("hex"),
    invitationCode,
    false,
    province,
    city,
    "",
    serviceIntentsInput,
    opportunityTypesInput,
    opportunityOptInInput,
    invitationRequired,
  );
  run("UPDATE creators SET password_login_enabled = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?", creatorId);
  return creatorId;
}

function normalizeChoiceList(input: unknown, options: readonly string[], max: number, label: string) {
  if (!Array.isArray(input)) return [];
  const values = [...new Set(input.map((item) => String(item).trim()).filter(Boolean))];
  if (values.length > max || values.some((item) => !options.includes(item)))
    throw new Error(`${label}选择不正确`);
  return values;
}

function normalizeFollowerCount(input: unknown, label: string) {
  const raw = String(input ?? "").trim();
  if (!raw) return null;
  if (!/^\d+$/.test(raw) || !Number.isSafeInteger(Number(raw)) || Number(raw) > 10000000000)
    throw new Error(`${label}请填写0-100亿的整数`);
  return Number(raw);
}

function normalizeSocialUrl(input: unknown, label: string) {
  const value = cleanText(input, 300);
  if (!value) return "";
  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol)) throw new Error();
  } catch {
    throw new Error(`${label}请填写有效链接`);
  }
  return value;
}

export function updateProfile(creatorId: number, input: Record<string, unknown>) {
  const current = one<CreatorRow>("SELECT * FROM creators WHERE id = ?", creatorId);
  if (!current) throw new Error("用户不存在");
  const supplied = (key: string) => Object.prototype.hasOwnProperty.call(input, key);
  const userName = supplied("userName") ? cleanText(input.userName, 30) : current.user_name;
  const brandName = supplied("brandName") ? cleanText(input.brandName, 40) : current.brand_name;
  const wechat = supplied("wechat") ? cleanText(input.wechat, 40) : current.wechat;
  if (supplied("intro") && Array.from(String(input.intro || "")).length > 2000) throw new Error("品牌或个人介绍最多2000字");
  const intro = supplied("intro") ? cleanText(input.intro, 2000) : current.intro;
  const province = supplied("province") ? cleanText(input.province, 20) : current.province;
  const city = supplied("city") ? cleanText(input.city, 30) : current.city;
  const district = supplied("district") ? cleanText(input.district, 30) : current.district;
  const slogan = supplied("slogan") ? cleanText(input.slogan, 7) : current.slogan;
  const socialAccount = supplied("socialAccount") ? cleanText(input.socialAccount, 60) : current.social_account;
  const serviceIntents = supplied("serviceIntents") && Array.isArray(input.serviceIntents)
    ? [...new Set(input.serviceIntents.map(String).filter((item): item is ServiceIntent => item === "writer" || item === "opportunity"))]
    : parseJson<ServiceIntent[]>(current.service_intents, ["writer"]);
  const opportunityTypes = supplied("opportunityTypes") && Array.isArray(input.opportunityTypes)
    ? [...new Set(input.opportunityTypes.map(String).filter((item) => cooperationTypes.includes(item as (typeof cooperationTypes)[number])))]
    : parseJson<string[]>(current.opportunity_types, []);
  const opportunityOptIn = supplied("opportunityOptIn")
    ? input.opportunityOptIn === true
    : Boolean(current.opportunity_opt_in);
  const precisionInviteGoals = supplied("precisionInviteGoals")
    ? normalizeChoiceList(input.precisionInviteGoals, precisionInviteGoalOptions, precisionInviteGoalOptions.length, "合作目标")
    : parseJson<string[]>(current.precision_invite_goals, []).filter((item) => precisionInviteGoalOptions.includes(item as (typeof precisionInviteGoalOptions)[number]));
  const precisionInviteScenes = supplied("precisionInviteScenes")
    ? normalizeChoiceList(input.precisionInviteScenes, precisionInviteSceneOptions, precisionInviteSceneOptions.length, "期待场景")
    : parseJson<string[]>(current.precision_invite_scenes, []).filter((item) => precisionInviteSceneOptions.includes(item as (typeof precisionInviteSceneOptions)[number]));
  const xiaohongshuFollowers = supplied("xiaohongshuFollowers")
    ? normalizeFollowerCount(input.xiaohongshuFollowers, "小红书粉丝数")
    : current.xiaohongshu_followers;
  const xiaohongshuUrl = supplied("xiaohongshuUrl") ? normalizeSocialUrl(input.xiaohongshuUrl, "小红书链接") : current.xiaohongshu_url;
  const douyinFollowers = supplied("douyinFollowers")
    ? normalizeFollowerCount(input.douyinFollowers, "抖音粉丝数")
    : current.douyin_followers;
  const douyinUrl = supplied("douyinUrl") ? normalizeSocialUrl(input.douyinUrl, "抖音链接") : current.douyin_url;
  const safety = contentSafety(userName, brandName, wechat, intro, socialAccount);
  if (safety) throw new Error(safety);
  run(
    `UPDATE creators SET user_name = ?, brand_name = ?, wechat = ?, intro = ?, province = ?, city = ?, district = ?, slogan = ?,
     available_cities = '[]', social_account = ?, service_intents = ?, opportunity_types = ?, opportunity_opt_in = ?,
     precision_invite_goals = ?, precision_invite_scenes = ?, xiaohongshu_followers = ?, xiaohongshu_url = ?,
     douyin_followers = ?, douyin_url = ?, profile_submitted_at = NULL,
     updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    userName,
    brandName,
    wechat,
    intro,
    province,
    city,
    district,
    slogan,
    socialAccount,
    JSON.stringify(serviceIntents.length ? serviceIntents : ["writer"]),
    JSON.stringify(opportunityTypes),
    opportunityOptIn ? 1 : 0,
    JSON.stringify(precisionInviteGoals),
    JSON.stringify(precisionInviteScenes),
    xiaohongshuFollowers,
    xiaohongshuUrl,
    douyinFollowers,
    douyinUrl,
    creatorId,
  );
  if (input.submit === true) {
    const creator = getCreator(creatorId)!;
    const settings = getPlatformSettings();
    const values: Record<string, boolean> = {
      "profile.userName": Boolean(creator.userName),
      "profile.brandName": Boolean(creator.brandName),
      "profile.wechat": Boolean(creator.wechat),
      "profile.socialAccount": Boolean(creator.socialAccount),
      "profile.logo": Boolean(creator.logoUrl),
      "profile.workImages": creator.workUrls.length === 1,
      "profile.intro": Boolean(creator.intro),
      "profile.province": Boolean(creator.province),
      "profile.city": Boolean(creator.city),
    };
    const missing = fieldDefinitions
      .filter((item) => item.section === "我的" && fieldRequired(settings, item.key) && !values[item.key])
      .map((item) => item.label);
    const missingOpportunities = fieldDefinitions
      .filter((item) => item.section === "合作" && fieldRequired(settings, item.key) && !creator.opportunityTypes.length)
      .map((item) => item.label);
    missing.push(...missingOpportunities);
    if (missing.length) throw new Error(`请先完成：${missing.join("、")}`);
    run(
      "UPDATE creators SET profile_submitted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
      creatorId,
    );
  }
  return getCreator(creatorId)!;
}

export function attachUpload(
  creatorId: number,
  kind: "logo" | "work" | "poster",
  key: string,
  targetId?: number,
) {
  if (kind === "poster") {
    if (!targetId) throw new Error("缺少活动主题");
    run("UPDATE themes SET poster_key = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", key, targetId);
    return listThemes(true).find((theme) => theme.id === targetId)!;
  }
  if (kind === "logo") {
    run("UPDATE creators SET logo_key = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", key, creatorId);
  } else {
    const row = one<{ work_keys: string }>("SELECT work_keys FROM creators WHERE id = ?", creatorId);
    const keys = parseJson<string[]>(row?.work_keys, []);
    keys.splice(0, keys.length, key);
    run(
      "UPDATE creators SET work_keys = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
      JSON.stringify(keys),
      creatorId,
    );
  }
  return getCreator(creatorId)!;
}

export function updateCreatorImages(creatorId: number, input: {
  representativeImageKey?: string;
  logoImageKey?: string;
  productImageKey?: string;
  boothImageKey?: string;
  historyImageKey?: string;
}) {
  const current = one<CreatorRow>("SELECT * FROM creators WHERE id = ?", creatorId);
  if (!current) throw new Error("用户不存在");
  const value = (key: keyof typeof input, fallback: string) => {
    const raw = input[key];
    return raw === undefined ? fallback : String(raw || "").trim();
  };
  const representative = value("representativeImageKey", parseJson<string[]>(current.work_keys, [])[0] || "");
  const logo = value("logoImageKey", current.logo_key || "");
  const product = value("productImageKey", current.product_image_key || "");
  const booth = value("boothImageKey", current.booth_image_key || "");
  const history = value("historyImageKey", current.history_image_key || "");
  run(
    `UPDATE creators SET logo_key = ?, product_image_key = ?, booth_image_key = ?,
     history_image_key = ?, work_keys = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    logo,
    product,
    booth,
    history,
    JSON.stringify(representative ? [representative] : []),
    creatorId,
  );
  return getCreator(creatorId)!;
}

export function removeWork(creatorId: number, url: string) {
  const row = one<{ work_keys: string }>("SELECT work_keys FROM creators WHERE id = ?", creatorId);
  const key = decodeURIComponent(url.replace(/^\/api\/assets\//, ""));
  const keys = parseJson<string[]>(row?.work_keys, []).filter((item) => item !== key);
  run(
    "UPDATE creators SET work_keys = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
    JSON.stringify(keys),
    creatorId,
  );
  return getCreator(creatorId)!;
}

export function setBoothDescription(creatorId: number, input: unknown, skip = false) {
  const creator = getCreator(creatorId);
  if (!creator) throw new Error("用户不存在");
  const settings = getPlatformSettings();
  if (skip && fieldRequired(settings, "lights.boothDescription"))
    throw new Error("请先填写展位描述");

  const description = skip ? "" : cleanText(input, 60);
  if (!skip && !description) throw new Error("请填写展位描述");
  if (Array.from(description).length > 30) throw new Error("展位描述最多30个字");
  const safety = contentSafety(description);
  if (safety) throw new Error(safety);

  run(
    `UPDATE creators SET booth_description = ?, booth_description_confirmed_at = CURRENT_TIMESTAMP,
     tags_submitted_at = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    description,
    creatorId,
  );

  if (description) {
    const selected = creator.tags;
    const counts = new Map<string, number>();
    for (const tag of selected) counts.set(tag.category, (counts.get(tag.category) || 0) + 1);
    const matchedPerCategory = new Map<string, number>();
    let matchedTotal = 0;
    for (const tag of rankTagMatches(listTags(), description, 24)) {
      if (matchedTotal >= 12) break;
      const categoryMatches = matchedPerCategory.get(tag.category) || 0;
      const categorySelected = counts.get(tag.category) || 0;
      if (categoryMatches >= 2 || categorySelected >= 8) continue;
      const result = run(
        "INSERT OR IGNORE INTO creator_tags(creator_id, tag_id, source) VALUES (?, ?, 'auto')",
        creatorId,
        tag.id,
      );
      if (!result.changes) continue;
      matchedPerCategory.set(tag.category, categoryMatches + 1);
      counts.set(tag.category, categorySelected + 1);
      matchedTotal += 1;
    }
  }
  return getCreator(creatorId)!;
}

export function claimTag(
  creatorId: number,
  input: { tagId?: number; customLabel?: string; category?: string },
) {
  let tagId = Number(input.tagId || 0);
  let customSubmission = false;
  if (!tagId && input.customLabel) {
    customSubmission = true;
    const label = cleanText(input.customLabel, 20);
    const category = cleanText(input.category, 20);
    if (!label || !category) throw new Error("请选择标签分类并填写标签");
    if (Array.from(label).length > 7) throw new Error("标签描述最多7个字");
    if (!tagSeeds[category]) throw new Error("请选择有效标签分类");
    const selectedInCategory = Number(
      one<{ count: number }>(
        `SELECT COUNT(*) AS count FROM creator_tags ct JOIN tags t ON t.id = ct.tag_id
         WHERE ct.creator_id = ? AND t.category = ? AND t.status != 'archived'`,
        creatorId,
        category,
      )?.count || 0,
    );
    if (selectedInCategory >= 8) throw new Error(`“${category}”最多选择 8 个标签`);
    const safety = contentSafety(label);
    if (safety) throw new Error(safety);
    const existing = one<{ id: number }>(
      "SELECT id FROM tags WHERE category = ? AND label = ?",
      category,
      label,
    );
    tagId = existing?.id || Number(
      run(
        "INSERT INTO tags(label, category, status, created_by) VALUES (?, ?, 'pending', ?)",
        label,
        category,
        creatorId,
      ).lastInsertRowid,
    );
  }
  const tag = one<TagRow>(
    `SELECT id, label, category, status FROM tags
     WHERE id = ? AND (status = 'active' OR (status = 'pending' AND (created_by = ? OR ? = 1)))`,
    tagId,
    creatorId,
    customSubmission ? 1 : 0,
  );
  if (!tag)
    throw new Error("请选择有效标签");
  const alreadySelected = Boolean(
    one("SELECT tag_id FROM creator_tags WHERE creator_id = ? AND tag_id = ?", creatorId, tagId),
  );
  const categoryCount = Number(
    one<{ count: number }>(
      `SELECT COUNT(*) AS count FROM creator_tags ct
       JOIN tags t ON t.id = ct.tag_id
       WHERE ct.creator_id = ? AND t.category = ? AND t.status != 'archived'`,
      creatorId,
      tag.category,
    )?.count || 0,
  );
  if (!alreadySelected && categoryCount >= 8)
    throw new Error(`“${tag.category}”最多选择 8 个标签`);
  run(
    "INSERT OR IGNORE INTO creator_tags(creator_id, tag_id, source) VALUES (?, ?, 'creator')",
    creatorId,
    tagId,
  );
  run("UPDATE creators SET tags_submitted_at = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?", creatorId);
  return getCreator(creatorId)!;
}

export function removeTag(creatorId: number, tagId: number) {
  run("DELETE FROM creator_tags WHERE creator_id = ? AND tag_id = ?", creatorId, tagId);
  run("UPDATE creators SET tags_submitted_at = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?", creatorId);
  return getCreator(creatorId)!;
}

export function submitTags(creatorId: number) {
  const creator = getCreator(creatorId)!;
  const settings = getPlatformSettings();
  if (fieldRequired(settings, "lights.boothDescription") && !creator.boothDescription)
    throw new Error("请填写展位描述");
  if (fieldRequired(settings, "lights.selection") && !creator.tags.length)
    throw new Error("请至少选择一个标签");
  if (
    fieldRequired(settings, "lights.customTag") &&
    !one(
      `SELECT t.id FROM tags t JOIN creator_tags ct ON ct.tag_id = t.id
       WHERE ct.creator_id = ? AND t.created_by = ? AND t.status != 'archived' LIMIT 1`,
      creatorId,
      creatorId,
    )
  )
    throw new Error("请新增至少一个自定义标签");
  const missingCategories = Object.keys(settings.fieldRules)
    .filter((key) => key.startsWith("lights.category.") && fieldRequired(settings, key))
    .map((key) => key.slice("lights.category.".length))
    .filter((category) => !creator.tags.some((tag) => tag.category === category));
  if (missingCategories.length)
    throw new Error(`请先选择以下分类标签：${missingCategories.join("、")}`);
  run(
    `UPDATE creators SET tags_submitted_at = CURRENT_TIMESTAMP,
     tags_first_submitted_at = COALESCE(tags_first_submitted_at, CURRENT_TIMESTAMP),
     updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    creatorId,
  );
  return getCreator(creatorId)!;
}

function validDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00`));
}

function shanghaiToday() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

export function addBusyPeriod(
  creatorId: number,
  startDate: string,
  endDate: string,
  note = "",
) {
  if (!validDate(startDate) || !validDate(endDate) || startDate > endDate)
    throw new Error("请选择正确的开始和结束日期");
  run(
    "INSERT INTO busy_periods(creator_id, start_date, end_date, note, source) VALUES (?, ?, ?, ?, 'manual')",
    creatorId,
    startDate,
    endDate,
    cleanText(note, 20),
  );
  run(
    `UPDATE creators SET no_bookings = 0, schedule_confirmed_at = NULL,
     generation_schedule_confirmed_at = NULL, generation_schedule_confirmation_used_at = NULL,
     updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    creatorId,
  );
  return getCreator(creatorId)!;
}

export function removeBusyPeriod(creatorId: number, periodId: number) {
  run(
    "DELETE FROM busy_periods WHERE id = ? AND creator_id = ? AND source = 'manual'",
    periodId,
    creatorId,
  );
  run(
    `UPDATE creators SET schedule_confirmed_at = NULL,
     generation_schedule_confirmed_at = NULL, generation_schedule_confirmation_used_at = NULL,
     updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    creatorId,
  );
  return getCreator(creatorId)!;
}

export function setNoBookings(creatorId: number, selected: boolean) {
  if (selected)
    run("DELETE FROM busy_periods WHERE creator_id = ? AND source = 'manual'", creatorId);
  run(
    `UPDATE creators SET no_bookings = ?, schedule_confirmed_at = NULL,
     generation_schedule_confirmed_at = NULL, generation_schedule_confirmation_used_at = NULL,
     updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    selected ? 1 : 0,
    creatorId,
  );
  return getCreator(creatorId)!;
}

export function confirmNoBookings(creatorId: number) {
  setNoBookings(creatorId, true);
  return confirmSchedule(creatorId);
}

export function confirmSchedule(creatorId: number) {
  const creator = getCreator(creatorId)!;
  const settings = getPlatformSettings();
  if (
    fieldRequired(settings, "schedule.availability") &&
    !creator.noBookings &&
    !(creator.busyPeriods || []).length
  )
    throw new Error("请标记已有安排，或选择“近期无计划”");
  run(
    "UPDATE creators SET schedule_confirmed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
    creatorId,
  );
  return getCreator(creatorId)!;
}

export function confirmScheduleForGeneration(creatorId: number) {
  const creator = getCreator(creatorId);
  if (!creator) throw new Error("用户不存在");
  const futurePeriods = (creator.busyPeriods || []).filter((period) => period.endDate >= shanghaiToday());
  if (!creator.noBookings && !futurePeriods.length)
    throw new Error("请填写未来活动计划，或选择“近期无计划”");
  run(
    `UPDATE creators SET schedule_confirmed_at = CURRENT_TIMESTAMP,
     generation_schedule_confirmed_at = CURRENT_TIMESTAMP,
     generation_schedule_confirmation_used_at = NULL,
     updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    creatorId,
  );
  return getCreator(creatorId)!;
}

export function markWriterGuideSeen(creatorId: number) {
  const version = getPlatformSettings().writerIntro.version;
  run(
    "UPDATE creators SET intro_popup_seen_version = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
    version,
    creatorId,
  );
  return getCreator(creatorId)!;
}

export function setThemeInterest(creatorId: number, themeId: number, selected: boolean) {
  if (!one("SELECT id FROM themes WHERE id = ? AND active = 1", themeId))
    throw new Error("活动主题不存在或已停用");
  run(
    `INSERT INTO creator_theme_interests(creator_id, theme_id, selected) VALUES (?, ?, ?)
     ON CONFLICT(creator_id, theme_id) DO UPDATE SET selected = excluded.selected, updated_at = CURRENT_TIMESTAMP`,
    creatorId,
    themeId,
    selected ? 1 : 0,
  );
  return listThemeInterestIds(creatorId);
}

export function listThemeInterestIds(creatorId: number) {
  return all<{ theme_id: number }>(
    "SELECT theme_id FROM creator_theme_interests WHERE creator_id = ? AND selected = 1 ORDER BY updated_at",
    creatorId,
  ).map((item) => item.theme_id);
}

function applicationTags(tagIds: number[]) {
  if (!tagIds.length) return [];
  const placeholders = tagIds.map(() => "?").join(",");
  return all<TagRow>(
    `SELECT id, label, category, status FROM tags WHERE id IN (${placeholders}) ORDER BY category, label`,
    ...tagIds,
  );
}

function mapApplication(row: ApplicationRow): ActivityApplication {
  const tagIds = parseJson<number[]>(row.tag_ids, []);
  return {
    id: row.id,
    reference: row.reference,
    creatorId: row.creator_id,
    creatorName: row.creator_name,
    brandName: row.brand_name,
    phone: row.phone,
    themeId: row.theme_id,
    themeTitle: row.theme_title || "",
    province: row.province,
    city: row.city,
    startDate: row.start_date,
    endDate: row.end_date,
    participation: row.participation,
    tags: applicationTags(tagIds),
    note: row.note,
    hasConflict: Boolean(row.has_conflict),
    status: row.status,
    snapshot: parseJson<Record<string, unknown> | undefined>(row.snapshot, undefined),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function applicationQuery(where = "", values: Array<string | number> = []) {
  return all<ApplicationRow>(
    `SELECT a.*, th.title AS theme_title, c.user_name AS creator_name, c.brand_name, c.phone
     FROM applications a JOIN themes th ON th.id = a.theme_id JOIN creators c ON c.id = a.creator_id
     ${where} ORDER BY a.updated_at DESC`,
    ...values,
  ).map(mapApplication);
}

export function listApplications(creatorId?: number) {
  return creatorId
    ? applicationQuery("WHERE a.creator_id = ?", [creatorId])
    : applicationQuery();
}

function hasDateConflict(creatorId: number, startDate: string, endDate: string) {
  return Boolean(
    one(
      `SELECT id FROM busy_periods
       WHERE creator_id = ? AND start_date <= ? AND end_date >= ? LIMIT 1`,
      creatorId,
      endDate,
      startDate,
    ),
  );
}

export function saveApplication(
  creatorId: number,
  input: Record<string, unknown>,
  notify: boolean,
) {
  const applicationId = Number(input.applicationId || 0);
  const existingDraft = applicationId
    ? one<ApplicationRow>(
        "SELECT * FROM applications WHERE id = ? AND creator_id = ? AND status = 'draft'",
        applicationId,
        creatorId,
      )
    : null;
  if (applicationId && !existingDraft)
    throw new Error("草稿不存在、已提交或无权修改");
  const themeId = Number(input.themeId || 0);
  const province = cleanText(input.province, 20);
  const city = cleanText(input.city, 30);
  const startDate = cleanText(input.startDate, 10);
  const endDate = cleanText(input.endDate, 10);
  const participation = cleanText(input.participation, 30);
  const note = cleanText(input.note, 50);
  const tagIds = Array.isArray(input.tagIds)
    ? [...new Set(input.tagIds.map(Number).filter(Number.isInteger))].slice(0, 50)
    : [];
  const theme = listThemes().find((item) => item.id === themeId);
  if (!theme) throw new Error("请选择有效活动主题");
  if (!validDate(startDate) || !validDate(endDate) || startDate > endDate)
    throw new Error("请选择正确的活动日期");
  if (!province || !city) throw new Error("请选择活动省份和城市");
  if (!tagIds.length) throw new Error("请至少选择一个匹配标签");
  const creator = getCreator(creatorId)!;
  if (notify) {
    if (!creator.userName || !creator.wechat || !creator.intro || !creator.logoUrl || creator.workUrls.length < 1)
      throw new Error("请先完成姓名、微信、介绍、标识图和至少 1 张代表图片");
    if (!creator.scheduleConfirmedAt) throw new Error("请先确认已有约期");
    if (creator.applicationLimit !== null && creator.applicationCount >= creator.applicationLimit)
      throw new Error("当前申请额度已用完，请联系TDE");
  }
  const safety = contentSafety(participation, note);
  if (safety) throw new Error(safety);
  const conflict = hasDateConflict(creatorId, startDate, endDate);
  const status: ApplicationStatus = notify ? "notified" : "draft";
  const snapshot = notify
    ? JSON.stringify({
        profile: creator,
        theme,
        tags: applicationTags(tagIds),
        province,
        city,
        startDate,
        endDate,
        participation,
        note,
        hasConflict: conflict,
        submittedAt: new Date().toISOString(),
      })
    : null;
  let savedId = applicationId;
  if (existingDraft) {
    run(
      `UPDATE applications SET theme_id = ?, province = ?, city = ?, start_date = ?, end_date = ?,
       participation = ?, tag_ids = ?, note = ?, has_conflict = ?, status = ?, snapshot = ?,
       updated_at = CURRENT_TIMESTAMP WHERE id = ? AND creator_id = ? AND status = 'draft'`,
      themeId,
      province,
      city,
      startDate,
      endDate,
      participation,
      JSON.stringify(tagIds),
      note,
      conflict ? 1 : 0,
      status,
      snapshot,
      applicationId,
      creatorId,
    );
  } else {
    const result = run(
      `INSERT INTO applications(reference, creator_id, theme_id, province, city, start_date, end_date,
        participation, tag_ids, note, has_conflict, status, snapshot)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      newReference("QD"),
      creatorId,
      themeId,
      province,
      city,
      startDate,
      endDate,
      participation,
      JSON.stringify(tagIds),
      note,
      conflict ? 1 : 0,
      status,
      snapshot,
    );
    savedId = Number(result.lastInsertRowid);
  }
  if (notify) {
    run(
      `INSERT INTO inbox_messages(recipient_id, kind, subject, body, href)
       VALUES (?, 'application', '平台已收到你的活动资料', ?, '/studio?section=profile&view=inbox')`,
      creatorId,
      `“${theme.title}”的资料已通知平台，申请编号 ${one<{ reference: string }>("SELECT reference FROM applications WHERE id = ?", savedId)?.reference || ""}。`,
    );
  }
  return listApplications(creatorId).find((item) => item.id === savedId)!;
}

export function deleteDraftApplication(creatorId: number, applicationId: number) {
  const result = run(
    "DELETE FROM applications WHERE id = ? AND creator_id = ? AND status = 'draft'",
    applicationId,
    creatorId,
  );
  if (!result.changes) throw new Error("草稿不存在、已提交或无权删除");
  return listApplications(creatorId);
}

export function getInbox(creatorId: number) {
  return all<{
    id: number;
    kind: InboxMessage["kind"];
    subject: string;
    body: string;
    href: string;
    read_at: string | null;
    created_at: string;
  }>(
    "SELECT * FROM inbox_messages WHERE recipient_id = ? ORDER BY created_at DESC",
    creatorId,
  ).map((row) => ({
    id: row.id,
    kind: row.kind,
    subject: row.subject,
    body: row.body,
    href: row.href,
    readAt: row.read_at,
    createdAt: row.created_at,
  }));
}

export function markInboxRead(creatorId: number, messageId: number) {
  if (!messageId) throw new Error("请选择一条通知");
  run(
    "UPDATE inbox_messages SET read_at = COALESCE(read_at, CURRENT_TIMESTAMP) WHERE recipient_id = ? AND id = ?",
    creatorId,
    messageId,
  );
  return getInbox(creatorId);
}

export function getPlatformSettings(): PlatformSettings {
  const storedRow = one<{ value: string }>("SELECT value FROM platform_settings WHERE key = 'platform'");
  const stored = parseJson<Partial<PlatformSettings>>(
    storedRow?.value,
    {},
  );
  const navigationMigration = one<{ value: string }>(
    "SELECT value FROM platform_settings WHERE key = 'navigation_writer_v1'",
  );
  if (!navigationMigration) {
    if (stored.navigation?.writer === "智能体") {
      stored.navigation = { ...stored.navigation, writer: "生成文章" };
      run(
        `INSERT INTO platform_settings(key, value) VALUES ('platform', ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
        JSON.stringify(stored),
      );
    }
    run("INSERT INTO platform_settings(key, value) VALUES ('navigation_writer_v1', 'complete') ON CONFLICT(key) DO NOTHING");
  }
  const writerModesMigration = one<{ value: string }>(
    "SELECT value FROM platform_settings WHERE key = 'writer_modes_v2'",
  );
  if (!writerModesMigration) {
    let changed = false;
    const writerUi = { ...(stored.writerUi || {}) };
    if (["免费生成", "普通生成"].includes(writerUi.freeTitle || "")) {
      writerUi.freeTitle = defaultWriterUiSettings.freeTitle;
      changed = true;
    }
    if (["升级生成", "加强生成"].includes(writerUi.upgradeTitle || "")) {
      writerUi.upgradeTitle = defaultWriterUiSettings.upgradeTitle;
      changed = true;
    }
    if (changed) {
      stored.writerUi = writerUi as WriterUiSettings;
      run(
        `INSERT INTO platform_settings(key, value) VALUES ('platform', ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
        JSON.stringify(stored),
      );
    }
    run("INSERT INTO platform_settings(key, value) VALUES ('writer_modes_v2', 'complete') ON CONFLICT(key) DO NOTHING");
  }
  const writerModesV3Migration = one<{ value: string }>(
    "SELECT value FROM platform_settings WHERE key = 'writer_modes_v3'",
  );
  if (!writerModesV3Migration) {
    let changed = false;
    const writerUi = { ...(stored.writerUi || {}) };
    if (writerUi.freeTitle === "基础生成") {
      writerUi.freeTitle = defaultWriterUiSettings.freeTitle;
      changed = true;
    }
    if (writerUi.upgradeTitle === "魔法生成") {
      writerUi.upgradeTitle = defaultWriterUiSettings.upgradeTitle;
      changed = true;
    }
    if (changed) {
      stored.writerUi = writerUi as WriterUiSettings;
      run(
        `INSERT INTO platform_settings(key, value) VALUES ('platform', ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
        JSON.stringify(stored),
      );
    }
    run("INSERT INTO platform_settings(key, value) VALUES ('writer_modes_v3', 'complete') ON CONFLICT(key) DO NOTHING");
  }
  const writerTimingMigration = one<{ value: string }>(
    "SELECT value FROM platform_settings WHERE key = 'writer_timing_v1'",
  );
  if (!writerTimingMigration) {
    let changed = false;
    const writerUi = { ...(stored.writerUi || {}) };
    if ([
      "通常需要30–60秒，无需刷新或重复点击。",
      "算法通常需要30–60秒，无需刷新或重复点击。",
    ].includes(writerUi.waitMessage || "")) {
      writerUi.waitMessage = defaultWriterUiSettings.waitMessage;
      changed = true;
    }
    if (stored.scheduleTitle === "先标记你已有安排的日期") {
      stored.scheduleTitle = defaultPlatformSettings.scheduleTitle;
      changed = true;
    }
    if (stored.scheduleDescription === "我们会避开这些时间，减少不必要的活动打扰。") {
      stored.scheduleDescription = defaultPlatformSettings.scheduleDescription;
      changed = true;
    }
    if (changed) {
      stored.writerUi = writerUi as WriterUiSettings;
      run(
        `INSERT INTO platform_settings(key, value) VALUES ('platform', ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
        JSON.stringify(stored),
      );
    }
    run("INSERT INTO platform_settings(key, value) VALUES ('writer_timing_v1', 'complete') ON CONFLICT(key) DO NOTHING");
  }
  const creatorCopyMigration = one<{ value: string }>(
    "SELECT value FROM platform_settings WHERE key = 'creator_copy_v1'",
  );
  if (!creatorCopyMigration) {
    let changed = false;
    if (!stored.productName || stored.productName === "TDE精选邀约") {
      stored.productName = defaultPlatformSettings.productName;
      changed = true;
    }
    if (!stored.headline || stored.headline === "不是所有活动都推送，只为你精选匹配。") {
      stored.headline = defaultPlatformSettings.headline;
      changed = true;
    }
    if (!stored.subheadline || stored.subheadline === "精选品牌活动邀约，根据城市、档期、内容标签和创作风格精准匹配，让真正适合你的机会及时抵达。") {
      stored.subheadline = defaultPlatformSettings.subheadline;
      changed = true;
    }
    if (!stored.navigation?.writer || stored.navigation.writer === "生成文章") {
      stored.navigation = { ...stored.navigation, writer: defaultPlatformSettings.navigation.writer };
      changed = true;
    }
    const writerUi = { ...(stored.writerUi || {}) };
    if (!writerUi.generateButton || writerUi.generateButton === "生成文章") {
      writerUi.generateButton = defaultWriterUiSettings.generateButton;
      changed = true;
    }
    if (!writerUi.pageTitle || writerUi.pageTitle === "生成文章") {
      writerUi.pageTitle = "生成";
      changed = true;
    }
    stored.writerUi = writerUi as WriterUiSettings;
    const oldCriteria = { city: "城市", schedule: "档期", tags: "标签" } as Record<string, string>;
    const currentCriteria = Array.isArray(stored.homeCriteria) ? stored.homeCriteria : [];
    stored.homeCriteria = defaultPlatformSettings.homeCriteria.map((defaults) => {
      const current = currentCriteria.find((item) => item.id === defaults.id);
      if (!current || current.label === oldCriteria[defaults.id]) {
        changed = true;
        return { ...defaults, ...(current || {}), label: defaults.label, icon: "Lightbulb" };
      }
      return current;
    });
    const uiReplacements: Record<string, [string, string]> = {
      "login.description": ["登录后进入生成文章，按需完善你的资料。", defaultUiText["login.description"]],
      "join.success": ["注册成功，正在进入生成文章。", defaultUiText["join.success"]],
      "profile.description": ["这些资料只用于平台匹配、联系和经你通知后的资料下载。", defaultUiText["profile.description"]],
      "profile.updateDescription": ["更新代表图片、标签、活动计划和品牌介绍。", defaultUiText["profile.updateDescription"]],
      "writer.stepTags": ["筛选标签", defaultUiText["writer.stepTags"]],
      "writer.stepIntro": ["品牌介绍", defaultUiText["writer.stepIntro"]],
      "writer.imageTitle": ["上传代表图片", defaultUiText["writer.imageTitle"]],
      "writer.tagsTitle": ["筛选标签", defaultUiText["writer.tagsTitle"]],
      "writer.introTitle": ["品牌或个人介绍", defaultUiText["writer.introTitle"]],
      "writer.generateAgain": ["再次生成文章", defaultUiText["writer.generateAgain"]],
      "writer.updateMaterials": ["更新资料", defaultUiText["writer.updateMaterials"]],
      "writer.updateHint": ["勤更新资料，小奇更懂你", defaultUiText["writer.updateHint"]],
      "writer.readyToGenerate": ["资料已更新", defaultUiText["writer.readyToGenerate"]],
    };
    stored.uiText = { ...(stored.uiText || {}) };
    for (const [key, [oldValue, newValue]] of Object.entries(uiReplacements)) {
      if (!stored.uiText[key] || stored.uiText[key] === oldValue) {
        stored.uiText[key] = newValue;
        changed = true;
      }
    }
    if (changed) {
      run(
        `INSERT INTO platform_settings(key, value) VALUES ('platform', ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
        JSON.stringify(stored),
      );
    }
    run("INSERT INTO platform_settings(key, value) VALUES ('creator_copy_v1', 'complete') ON CONFLICT(key) DO NOTHING");
  }
  const copyClarityMigration = one<{ value: string }>(
    "SELECT value FROM platform_settings WHERE key = 'copy_clarity_v1'",
  );
  if (!copyClarityMigration) {
    stored.productName = defaultPlatformSettings.productName;
    stored.headline = defaultPlatformSettings.headline;
    stored.subheadline = defaultPlatformSettings.subheadline;
    stored.scheduleTitle = defaultPlatformSettings.scheduleTitle;
    stored.scheduleDescription = defaultPlatformSettings.scheduleDescription;
    stored.lightsDescription = defaultPlatformSettings.lightsDescription;
    stored.writerUi = {
      ...stored.writerUi,
      pageDescription: defaultWriterUiSettings.pageDescription,
      expiryWarning: defaultWriterUiSettings.expiryWarning,
      tips: defaultWriterUiSettings.tips,
      completedNotificationBody: defaultWriterUiSettings.completedNotificationBody,
    } as WriterUiSettings;
    stored.uiText = {
      ...stored.uiText,
      "login.title": defaultUiText["login.title"],
      "login.description": defaultUiText["login.description"],
      "join.description": defaultUiText["join.description"],
      "profile.submit": defaultUiText["profile.submit"],
      "profile.description": defaultUiText["profile.description"],
      "lights.quickPrompt": defaultUiText["lights.quickPrompt"],
      "lights.quickPlaceholder": defaultUiText["lights.quickPlaceholder"],
      "lights.remembered": defaultUiText["lights.remembered"],
      "schedule.submit": defaultUiText["schedule.submit"],
      "lights.save": defaultUiText["lights.save"],
      "lights.submit": defaultUiText["lights.submit"],
      "lights.writer": defaultUiText["lights.writer"],
      "writer.guideClosing": defaultUiText["writer.guideClosing"],
      "writer.guideDisclaimer": defaultUiText["writer.guideDisclaimer"],
    };
    stored.homeCriteria = defaultPlatformSettings.homeCriteria.map((defaults) => ({
      ...defaults,
      ...(Array.isArray(stored.homeCriteria)
        ? stored.homeCriteria.find((item) => item.id === defaults.id)
        : {}),
      label: defaults.label,
      icon: "Lightbulb",
    }));
    stored.inviteSharing = {
      ...defaultPlatformSettings.inviteSharing,
      ...(stored.inviteSharing || {}),
      heading: defaultPlatformSettings.inviteSharing.heading,
      description: defaultPlatformSettings.inviteSharing.description,
      buttonText: defaultPlatformSettings.inviteSharing.buttonText,
      template: defaultPlatformSettings.inviteSharing.template,
    };
    stored.fieldRules = {
      ...(stored.fieldRules || {}),
      "profile.userName": { enabled: false, required: false },
      "profile.wechat": { enabled: false, required: false },
      "profile.socialAccount": { enabled: false, required: false },
      "profile.logo": { enabled: false, required: false },
    };
    run(
      `INSERT INTO platform_settings(key, value) VALUES ('platform', ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      JSON.stringify(stored),
    );
    run("INSERT INTO platform_settings(key, value) VALUES ('copy_clarity_v1', 'complete') ON CONFLICT(key) DO NOTHING");
  }
  const storedCards = Array.isArray(stored.homeShowcase?.cards)
    ? stored.homeShowcase.cards
    : [];
  const storedCriteria = Array.isArray(stored.homeCriteria) ? stored.homeCriteria : [];
  const legacyWorkbench = !stored.uiText?.["writer.stepImage"];
  if (legacyWorkbench) {
    stored.navigation = {
      ...stored.navigation,
      lights: stored.navigation?.lights === "亮灯" || !stored.navigation?.lights
        ? "筛选标签"
        : stored.navigation.lights,
    };
    stored.uiText = {
      ...stored.uiText,
      "home.inviteHint": defaultUiText["home.inviteHint"],
      "join.inviteHint": defaultUiText["join.inviteHint"],
      "join.registerTitle": "开启注册",
      "join.registerButton": "提交注册",
      "profile.submit": stored.uiText?.["profile.submit"] === "提交并进入约期" || !stored.uiText?.["profile.submit"]
        ? "保存（记得更新）"
        : stored.uiText["profile.submit"],
    };
    stored.writerUi = {
      ...defaultWriterUiSettings,
      ...stored.writerUi,
      pageTitle: stored.writerUi?.pageTitle === "TDE智能体" || !stored.writerUi?.pageTitle
        ? defaultWriterUiSettings.pageTitle
        : stored.writerUi.pageTitle,
      pageDescription: stored.writerUi?.pageDescription === "从你已经提交的资料出发，生成一篇可以继续修改的文案。" || !stored.writerUi?.pageDescription
        ? defaultWriterUiSettings.pageDescription
        : stored.writerUi.pageDescription,
      freeTitle: stored.writerUi?.freeTitle === "免费生成" || !stored.writerUi?.freeTitle
        ? defaultWriterUiSettings.freeTitle
        : stored.writerUi.freeTitle,
      upgradeTitle: stored.writerUi?.upgradeTitle === "升级生成" || !stored.writerUi?.upgradeTitle
        ? defaultWriterUiSettings.upgradeTitle
        : stored.writerUi.upgradeTitle,
      generateButton: stored.writerUi?.generateButton === "一键生成" || !stored.writerUi?.generateButton
        ? defaultWriterUiSettings.generateButton
        : stored.writerUi.generateButton,
      copyButton: stored.writerUi?.copyButton === "复制全文" || !stored.writerUi?.copyButton
        ? defaultWriterUiSettings.copyButton
        : stored.writerUi.copyButton,
      completedNotificationBody: stored.writerUi?.completedNotificationBody?.includes("TDE智能体")
        ? defaultWriterUiSettings.completedNotificationBody
        : stored.writerUi?.completedNotificationBody || defaultWriterUiSettings.completedNotificationBody,
    };
    stored.homeCriteria = defaultPlatformSettings.homeCriteria.map((criterion) => ({
      ...(storedCriteria.find((item) => item?.id === criterion.id) || criterion),
      icon: "Lightbulb",
    }));
    run(
      `INSERT INTO platform_settings(key, value) VALUES ('platform', ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      JSON.stringify(stored),
    );
  }
  const brandHubMigration = one<{ value: string }>(
    "SELECT value FROM platform_settings WHERE key = 'brand_hub_v1'",
  );
  if (!brandHubMigration) {
    if (!stored.productName || stored.productName === "TDE AI 智能体")
      stored.productName = defaultPlatformSettings.productName;
    if (!stored.headline || stored.headline === "先让TDE懂你，再写出更像你的文章。")
      stored.headline = defaultPlatformSettings.headline;
    if (!stored.subheadline || stored.subheadline.includes("不用反复写提示词"))
      stored.subheadline = defaultPlatformSettings.subheadline;
    stored.navigation = { ...defaultPlatformSettings.navigation, ...(stored.navigation || {}) };
    stored.navigationIcons = { ...defaultPlatformSettings.navigationIcons, ...(stored.navigationIcons || {}) };
    stored.uiText = { ...(stored.uiText || {}) };
    if (!stored.uiText["home.eyebrow"] || stored.uiText["home.eyebrow"] === "QIDENG AI WRITER")
      stored.uiText["home.eyebrow"] = defaultUiText["home.eyebrow"];
    if (!stored.uiText["home.invitePlaceholder"] || stored.uiText["home.invitePlaceholder"] === "8 位邀请码")
      stored.uiText["home.invitePlaceholder"] = defaultUiText["home.invitePlaceholder"];
    run(
      `INSERT INTO platform_settings(key, value) VALUES ('platform', ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      JSON.stringify(stored),
    );
    run("INSERT INTO platform_settings(key, value) VALUES ('brand_hub_v1', 'complete') ON CONFLICT(key) DO NOTHING");
  }
  const creativeDossierMigration = one<{ value: string }>(
    "SELECT value FROM platform_settings WHERE key = 'creative_dossier_v1'",
  );
  if (!creativeDossierMigration) {
    stored.productName = defaultPlatformSettings.productName;
    stored.headline = defaultPlatformSettings.headline;
    stored.subheadline = defaultPlatformSettings.subheadline;
    stored.navigation = {
      ...defaultPlatformSettings.navigation,
      ...(stored.navigation || {}),
    };
    stored.navigationIcons = {
      ...defaultPlatformSettings.navigationIcons,
      ...(stored.navigationIcons || {}),
    };
    stored.homeCriteria = defaultPlatformSettings.homeCriteria.map((defaults) => ({
      ...defaults,
      ...((Array.isArray(stored.homeCriteria) ? stored.homeCriteria : []).find((item) => item?.id === defaults.id) || {}),
      label: defaults.label,
      icon: "Lightbulb",
    }));
    stored.fieldRules = {
      ...(stored.fieldRules || {}),
      "profile.userName": { enabled: false, required: false },
      "profile.wechat": { enabled: true, required: true },
      "profile.socialAccount": { enabled: false, required: false },
      "profile.logo": { enabled: false, required: false },
      "opportunity.types": { enabled: true, required: true },
    };
    stored.uiText = {
      ...(stored.uiText || {}),
      "home.join": defaultUiText["home.join"],
      "home.login": defaultUiText["home.login"],
      "home.privateNote": defaultUiText["home.privateNote"],
      "join.success": defaultUiText["join.success"],
      "join.defaultPasswordHint": defaultUiText["join.defaultPasswordHint"],
      "join.welcomeSubject": defaultUiText["join.welcomeSubject"],
      "join.welcomeBody": defaultUiText["join.welcomeBody"],
      "login.description": defaultUiText["login.description"],
      "studio.loading": defaultUiText["studio.loading"],
      "profile.wechatLabel": defaultUiText["profile.wechatLabel"],
      "profile.updateDescription": defaultUiText["profile.updateDescription"],
    };
    run(
      `INSERT INTO platform_settings(key, value) VALUES ('platform', ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      JSON.stringify(stored),
    );
    run("INSERT INTO platform_settings(key, value) VALUES ('creative_dossier_v1', 'complete') ON CONFLICT(key) DO NOTHING");
  }
  const legacyExpiryWarning = "生成结果仅在用户端保留24小时，请马上复制并粘贴到你的笔记中。";
  return {
    ...defaultPlatformSettings,
    ...stored,
    navigation: Object.fromEntries(
      Object.keys(defaultPlatformSettings.navigation).map((key) => [
        key,
        stored.navigation?.[key] || defaultPlatformSettings.navigation[key],
      ]),
    ),
    navigationIcons: Object.fromEntries(
      Object.keys(defaultPlatformSettings.navigationIcons).map((key) => [
        key,
        stored.navigationIcons?.[key] || defaultPlatformSettings.navigationIcons[key],
      ]),
    ),
    homeShowcase: {
      enabled: stored.homeShowcase?.enabled === true,
      cards: defaultPlatformSettings.homeShowcase.cards.map((card, index) => ({
        ...card,
        ...(storedCards[index] || {}),
      })),
    },
    homeCriteria: defaultPlatformSettings.homeCriteria.map((criterion) => ({
      ...criterion,
      ...((Array.isArray(stored.homeCriteria) ? stored.homeCriteria : storedCriteria).find((item) => item?.id === criterion.id) || {}),
    })),
    inviteSharing: {
      ...defaultPlatformSettings.inviteSharing,
      ...(stored.inviteSharing || {}),
    },
    inviteContactText: stored.inviteContactText || defaultPlatformSettings.inviteContactText,
    sms: {
      ...defaultPlatformSettings.sms,
      ...(stored.sms || {}),
      notificationTypes: defaultPlatformSettings.sms.notificationTypes.map((defaults) => {
        const storedType = stored.sms?.notificationTypes?.find((item) => item.key === defaults.key);
        return {
          ...defaults,
          ...(storedType || {}),
          linkPath: storedType?.linkPath === "/studio?section=inbox" ? defaults.linkPath : storedType?.linkPath || defaults.linkPath,
        };
      }),
    },
    writerUi: {
      ...defaultWriterUiSettings,
      ...(stored.writerUi || {}),
      expiryWarning:
        !stored.writerUi?.expiryWarning || stored.writerUi.expiryWarning === legacyExpiryWarning
          ? defaultWriterUiSettings.expiryWarning
          : stored.writerUi.expiryWarning,
      statusLabels: {
        ...defaultWriterUiSettings.statusLabels,
        ...(stored.writerUi?.statusLabels || {}),
      },
      tips: Array.isArray(stored.writerUi?.tips) && stored.writerUi.tips.length
        ? stored.writerUi.tips
        : defaultWriterUiSettings.tips,
    },
    writerIntro: {
      ...defaultPlatformSettings.writerIntro,
      ...(stored.writerIntro || {}),
      enabled: stored.writerIntro?.enabled !== false,
      version: stored.writerIntro?.version || defaultPlatformSettings.writerIntro.version,
    },
    uiText: Object.fromEntries(
      Object.keys(defaultUiText).map((key) => [
        key,
        stored.uiText?.[key] || defaultUiText[key],
      ]),
    ),
    fieldRules: Object.fromEntries(
      fieldDefinitions.map((definition) => [
        definition.key,
        stored.fieldRules?.[definition.key] || defaultFieldRules[definition.key],
      ]),
    ),
  };
}

function cleanSettingList(value: unknown, fallback: string[], maxItems: number, maxLength: number) {
  if (!Array.isArray(value)) return fallback;
  const result = value.map((item) => cleanText(item, maxLength)).filter(Boolean).slice(0, maxItems);
  return result.length ? result : fallback;
}

function settingColor(value: unknown, fallback: string) {
  const color = String(value || "").toUpperCase();
  return /^#[0-9A-F]{6}$/.test(color) ? color : fallback;
}

function settingAssetUrl(value: unknown) {
  const url = String(value || "");
  return url.startsWith("/api/assets/platform/showcase/") ? url : null;
}

function settingUrl(value: unknown, fallback: string) {
  const url = cleanText(value, 240);
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.toString() : fallback;
  } catch {
    return fallback;
  }
}

export function updatePlatformSettings(input: Partial<PlatformSettings>) {
  const current = getPlatformSettings();
  const writerInput: Partial<WriterUiSettings> = input.writerUi || {};
  const writerStatusLabels = Object.fromEntries(
    (Object.keys(defaultWriterUiSettings.statusLabels) as CopyGenerationStage[]).map((key) => [
      key,
      cleanText(
        writerInput.statusLabels?.[key] ?? current.writerUi.statusLabels[key],
        60,
      ) || defaultWriterUiSettings.statusLabels[key],
    ]),
  ) as PlatformSettings["writerUi"]["statusLabels"];
  const settings: PlatformSettings = {
    productName: cleanText(input.productName ?? current.productName, 30),
    headline: cleanText(input.headline ?? current.headline, 80),
    subheadline: cleanText(input.subheadline ?? current.subheadline, 180),
    contactText: cleanText(input.contactText ?? current.contactText, 300),
    profileExample: cleanText(input.profileExample ?? current.profileExample, 200),
    scheduleTitle: cleanText(input.scheduleTitle ?? current.scheduleTitle, 60),
    scheduleDescription: cleanText(input.scheduleDescription ?? current.scheduleDescription, 160),
    lightsDescription: cleanText(input.lightsDescription ?? current.lightsDescription, 160),
    writerUi: {
      pageTitle: cleanText(writerInput.pageTitle ?? current.writerUi.pageTitle, 40),
      pageDescription: cleanText(writerInput.pageDescription ?? current.writerUi.pageDescription, 180),
      freeTitle: cleanText(writerInput.freeTitle ?? current.writerUi.freeTitle, 30),
      upgradeTitle: cleanText(writerInput.upgradeTitle ?? current.writerUi.upgradeTitle, 30),
      generateButton: cleanText(writerInput.generateButton ?? current.writerUi.generateButton, 20),
      processingButton: cleanText(writerInput.processingButton ?? current.writerUi.processingButton, 20),
      copyButton: cleanText(writerInput.copyButton ?? current.writerUi.copyButton, 20),
      viewResultButton: cleanText(writerInput.viewResultButton ?? current.writerUi.viewResultButton, 20),
      statusLabels: writerStatusLabels,
      waitMessage: cleanText(writerInput.waitMessage ?? current.writerUi.waitMessage, 160),
      leaveMessage: cleanText(writerInput.leaveMessage ?? current.writerUi.leaveMessage, 160),
      expiryWarning: cleanText(writerInput.expiryWarning ?? current.writerUi.expiryWarning, 200),
      tips: cleanSettingList(writerInput.tips, current.writerUi.tips, 12, 160),
      successDialogTitle: cleanText(writerInput.successDialogTitle ?? current.writerUi.successDialogTitle, 60),
      successDialogBody: cleanText(writerInput.successDialogBody ?? current.writerUi.successDialogBody, 200),
      completedNotificationSubject: cleanText(writerInput.completedNotificationSubject ?? current.writerUi.completedNotificationSubject, 80),
      completedNotificationBody: cleanText(writerInput.completedNotificationBody ?? current.writerUi.completedNotificationBody, 300),
      failedNotificationSubject: cleanText(writerInput.failedNotificationSubject ?? current.writerUi.failedNotificationSubject, 80),
      failedNotificationBody: cleanText(writerInput.failedNotificationBody ?? current.writerUi.failedNotificationBody, 300),
    },
    writerIntro: {
      enabled: input.writerIntro?.enabled ?? current.writerIntro.enabled,
      version: cleanText(input.writerIntro?.version ?? current.writerIntro.version, 20) || current.writerIntro.version,
    },
    uiText: Object.fromEntries(
      Object.keys(defaultUiText).map((key) => [
        key,
        cleanText(input.uiText?.[key] ?? current.uiText[key], 200) || defaultUiText[key],
      ]),
    ),
    homeShowcase: {
      enabled: input.homeShowcase?.enabled ?? current.homeShowcase.enabled,
      cards: defaultPlatformSettings.homeShowcase.cards.map((defaults, index) => {
        const card = input.homeShowcase?.cards?.[index] ?? current.homeShowcase.cards[index] ?? defaults;
        return {
          enabled: card.enabled !== false,
          index: cleanText(card.index, 8) || defaults.index,
          category: cleanText(card.category, 30) || defaults.category,
          eyebrow: cleanText(card.eyebrow, 40) || defaults.eyebrow,
          title: cleanText(card.title, 40) || defaults.title,
          footer: cleanText(card.footer, 60) || defaults.footer,
          background: settingColor(card.background, defaults.background),
          foreground: settingColor(card.foreground, defaults.foreground),
          imageUrl: settingAssetUrl(card.imageUrl),
        };
      }),
    },
    homeCriteria: defaultPlatformSettings.homeCriteria.map((defaults) => {
      const criterion = input.homeCriteria?.find((item) => item.id === defaults.id)
        || current.homeCriteria.find((item) => item.id === defaults.id)
        || defaults;
      return {
        id: defaults.id,
        label: cleanText(criterion.label, 12) || defaults.label,
        icon: allowedContentIcons.includes(criterion.icon as (typeof allowedContentIcons)[number])
          ? criterion.icon
          : defaults.icon,
        enabled: criterion.enabled !== false,
        sortOrder: Math.max(1, Math.min(20, Number(criterion.sortOrder) || defaults.sortOrder)),
      };
    }),
    inviteSharing: {
      heading: cleanText(input.inviteSharing?.heading ?? current.inviteSharing.heading, 40),
      description: cleanText(input.inviteSharing?.description ?? current.inviteSharing.description, 120),
      buttonText: cleanText(input.inviteSharing?.buttonText ?? current.inviteSharing.buttonText, 20),
      buttonIcon: allowedContentIcons.includes((input.inviteSharing?.buttonIcon ?? current.inviteSharing.buttonIcon) as (typeof allowedContentIcons)[number])
        ? (input.inviteSharing?.buttonIcon ?? current.inviteSharing.buttonIcon)
        : defaultPlatformSettings.inviteSharing.buttonIcon,
      template: cleanText(input.inviteSharing?.template ?? current.inviteSharing.template, 800),
      joinUrl: settingUrl(input.inviteSharing?.joinUrl ?? current.inviteSharing.joinUrl, defaultPlatformSettings.inviteSharing.joinUrl),
    },
    inviteContactText: cleanText(input.inviteContactText ?? current.inviteContactText, 160)
      || defaultPlatformSettings.inviteContactText,
    sms: {
      enabled: input.sms?.enabled === true,
      signName: cleanText(input.sms?.signName ?? current.sms.signName, 20),
      verificationTemplateCode: cleanText(input.sms?.verificationTemplateCode ?? current.sms.verificationTemplateCode, 40),
      notificationTypes: defaultPlatformSettings.sms.notificationTypes.map((defaults) => {
        const value = input.sms?.notificationTypes?.find((item) => item.key === defaults.key)
          || current.sms.notificationTypes.find((item) => item.key === defaults.key)
          || defaults;
        const path = cleanText(value.linkPath, 160);
        return {
          key: defaults.key,
          label: cleanText(value.label, 30) || defaults.label,
          enabled: value.enabled !== false,
          smsEnabled: value.smsEnabled === true,
          templateCode: cleanText(value.templateCode, 40),
          linkPath: path.startsWith("/") && !path.startsWith("//") ? path : defaults.linkPath,
          sortOrder: defaults.sortOrder,
        };
      }),
    },
    navigation: Object.fromEntries(
      Object.keys(defaultPlatformSettings.navigation).map((key) => [
        key,
        cleanText(input.navigation?.[key] ?? current.navigation[key], 12),
      ]),
    ),
    navigationIcons: Object.fromEntries(
      Object.keys(defaultPlatformSettings.navigationIcons).map((key) => {
        const value = input.navigationIcons?.[key] ?? current.navigationIcons[key];
        return [
          key,
          allowedNavigationIcons.includes(value as (typeof allowedNavigationIcons)[number])
            ? value
            : defaultPlatformSettings.navigationIcons[key],
        ];
      }),
    ),
    fieldRules: Object.fromEntries(
      fieldDefinitions.map((definition) => {
        const value = input.fieldRules?.[definition.key] ?? current.fieldRules[definition.key];
        const enabled = value?.enabled !== false;
        return [definition.key, { enabled, required: enabled && value?.required === true }];
      }),
    ),
  };
  const safety = contentSafety(
    ...Object.values(settings).filter((value): value is string => typeof value === "string"),
    ...settings.homeShowcase.cards.flatMap((card) => [card.category, card.eyebrow, card.title, card.footer]),
    ...settings.homeCriteria.map((criterion) => criterion.label),
    settings.inviteSharing.heading,
    settings.inviteSharing.description,
    settings.inviteSharing.buttonText,
    settings.inviteSharing.template,
    settings.sms.signName,
    ...settings.sms.notificationTypes.flatMap((item) => [item.label, item.linkPath]),
    ...Object.values(settings.writerUi).flatMap((value) =>
      typeof value === "string"
        ? [value]
        : Array.isArray(value)
          ? value
          : Object.values(value),
    ),
    ...Object.values(settings.uiText),
  );
  if (safety) throw new Error(safety);
  run(
    `INSERT INTO platform_settings(key, value) VALUES ('platform', ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP`,
    JSON.stringify(settings),
  );
  return settings;
}

export function listAdminCreators(managerAdminId?: number | null) {
  const rows = managerAdminId
    ? all<CreatorRow>("SELECT * FROM creators WHERE manager_admin_id = ? ORDER BY created_at DESC", managerAdminId)
    : all<CreatorRow>("SELECT * FROM creators ORDER BY created_at DESC");
  return rows.map((row) => mapCreator(row));
}

export function adminOverview(principal: AdminPrincipal = { id: null, role: "super", label: "超级管理员" }): AdminOverview {
  const creators = listAdminCreators(principal.role === "subadmin" ? principal.id : null);
  const tags = listTags(true);
  return {
    admin: principal,
    adminAccounts: principal.role === "super" ? listAdminAccounts() : [],
    creators,
    generations: principal.role === "super" ? listCopyGenerations() : [],
    tags,
    inviteCodes: principal.role === "super" ? listInviteCodes() : [],
    notifications: listPlatformNotifications(principal),
    metrics: {
      creators: creators.length,
      pendingTags: tags.filter((tag) => tag.status === "pending").length,
    },
    settings: getPlatformSettings(),
  };
}

function datesBetween(start: string, end: string) {
  if (!validDate(start) || !validDate(end) || start > end) return [];
  const dates: string[] = [];
  const cursor = new Date(`${start}T00:00:00Z`);
  const finish = new Date(`${end}T00:00:00Z`);
  while (cursor <= finish && dates.length < 367) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

export function searchCreators(filters: Record<string, unknown>, managerAdminId?: number | null) {
  const keyword = cleanText(filters.keyword, 60).toLowerCase();
  const province = cleanText(filters.province, 20);
  const city = cleanText(filters.city, 30);
  const district = cleanText(filters.district, 30);
  const inviteCode = cleanText(filters.inviteCode, 8).toUpperCase();
  const rating = cleanText(filters.rating, 20) as CreatorRating;
  const requestedManagerId = Number(filters.managerAdminId || 0);
  const opportunityType = cleanText(filters.opportunityType, 30);
  const precisionInviteGoal = cleanText(filters.precisionInviteGoal, 30);
  const precisionInviteScene = cleanText(filters.precisionInviteScene, 30);
  const xiaohongshuFollowersMin = String(filters.xiaohongshuFollowersMin ?? "").trim();
  const douyinFollowersMin = String(filters.douyinFollowersMin ?? "").trim();
  const xiaohongshuLinkStatus = cleanText(filters.xiaohongshuLinkStatus, 10);
  const douyinLinkStatus = cleanText(filters.douyinLinkStatus, 10);
  const accountStatus = cleanText(filters.accountStatus, 20) || "active";
  const startDate = cleanText(filters.startDate, 10);
  const endDate = cleanText(filters.endDate, 10);
  const tagLabels = Array.isArray(filters.tagLabels)
    ? [...new Set(filters.tagLabels.map((value) => cleanText(value, 60)).filter(Boolean))]
    : [];
  const tagIds = Array.isArray(filters.tagIds)
    ? [...new Set(filters.tagIds.map(Number).filter(Number.isInteger))]
    : [];
  return listAdminCreators(managerAdminId).filter((creator) => {
    if (accountStatus === "active" && creator.suspended) return false;
    if (accountStatus === "archived" && !creator.suspended) return false;
    if (keyword) {
      const haystack = [creator.userName, creator.brandName, creator.phone, creator.boothDescription, ...creator.tags.map((tag) => tag.label)]
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(keyword)) return false;
    }
    if (province && creator.province !== province) return false;
    if (city && creator.city !== city) return false;
    if (district && creator.district !== district) return false;
    if (inviteCode && !creator.registeredWithCode.toUpperCase().includes(inviteCode)) return false;
    if (rating && creator.adminRating !== rating) return false;
    if (!managerAdminId && requestedManagerId && creator.managerAdminId !== requestedManagerId) return false;
    if (opportunityType && !creator.opportunityTypes.includes(opportunityType)) return false;
    if (precisionInviteGoal && !creator.precisionInviteGoals.includes(precisionInviteGoal)) return false;
    if (precisionInviteScene && !creator.precisionInviteScenes.includes(precisionInviteScene)) return false;
    if (xiaohongshuFollowersMin && (creator.xiaohongshuFollowers == null || creator.xiaohongshuFollowers < Number(xiaohongshuFollowersMin))) return false;
    if (douyinFollowersMin && (creator.douyinFollowers == null || creator.douyinFollowers < Number(douyinFollowersMin))) return false;
    if (xiaohongshuLinkStatus === "filled" && !creator.xiaohongshuUrl) return false;
    if (xiaohongshuLinkStatus === "empty" && creator.xiaohongshuUrl) return false;
    if (douyinLinkStatus === "filled" && !creator.douyinUrl) return false;
    if (douyinLinkStatus === "empty" && creator.douyinUrl) return false;
    if (tagIds.length && !tagIds.every((id) => creator.tags.some((tag) => tag.id === id))) return false;
    if (tagLabels.length && !tagLabels.some((label) => creator.tags.some((tag) => tag.status === "active" && tag.label === label))) return false;
    if (startDate || endDate) {
      const from = startDate || endDate;
      const to = endDate || startDate;
      const dates = datesBetween(from, to);
      if (!dates.length) return false;
      const periods = creator.busyPeriods || [];
      const hasFreeDay = dates.some(
        (date) => !periods.some((period) => period.startDate <= date && period.endDate >= date),
      );
      if (!hasFreeDay) return false;
    }
    return true;
  });
}

export function reviewTag(
  tagId: number,
  status: TagStatus,
  replacementTagId?: number,
  note = "",
) {
  if (status !== "active" && status !== "archived") throw new Error("标签复核状态不正确");
  const tag = one<TagRow>("SELECT id, label, category, status FROM tags WHERE id = ?", tagId);
  if (!tag) throw new Error("标签不存在");
  if (!tagCategoryNames.includes(tag.category)) throw new Error("该标签不属于新遇官标签库");
  if (replacementTagId === tagId) throw new Error("替代标签不能与原标签相同");
  const creators = all<{ creator_id: number }>("SELECT creator_id FROM creator_tags WHERE tag_id = ?", tagId);
  run("UPDATE tags SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", status, tagId);
  if (status === "archived") {
    const replacement = replacementTagId
      ? one<TagRow>("SELECT id, label, category, status FROM tags WHERE id = ? AND status = 'active'", replacementTagId)
      : null;
    if (replacement && (replacement.category !== tag.category || !tagCategoryNames.includes(replacement.category)))
      throw new Error("替代标签必须属于同一新遇官标签分类");
    for (const creator of creators) {
      if (replacement)
        run(
          "INSERT OR IGNORE INTO creator_tags(creator_id, tag_id, source) VALUES (?, ?, 'platform')",
          creator.creator_id,
          replacement.id,
        );
      run("DELETE FROM creator_tags WHERE creator_id = ? AND tag_id = ?", creator.creator_id, tagId);
      run(
        `INSERT INTO inbox_messages(recipient_id, kind, subject, body, href)
         VALUES (?, 'review', '标签复核结果', ?, '/studio?section=lights')`,
        creator.creator_id,
        note || `你提交的标签“${tag.label}”未通过复核${replacement ? `，已调整为“${replacement.label}”` : ""}。如有疑问，请联系TDE。`,
      );
    }
  }
  return listTags(true);
}

export function createTag(labelInput: unknown, categoryInput: unknown) {
  const label = cleanText(labelInput, 20);
  const category = cleanText(categoryInput, 20);
  if (!label || !category) throw new Error("请填写标签名称和分类");
  if (!tagSeeds[category]) throw new Error("请选择有效标签分类");
  const safety = contentSafety(label);
  if (safety) throw new Error(safety);
  const existing = one<TagRow>(
    "SELECT id, label, category, status FROM tags WHERE category = ? AND label = ?",
    category,
    label,
  );
  if (existing?.status === "active") throw new Error("该分类中已存在同名标签");
  if (existing) {
    run("UPDATE tags SET status = 'active', updated_at = CURRENT_TIMESTAMP WHERE id = ?", existing.id);
    return one<TagRow>("SELECT id, label, category, status FROM tags WHERE id = ?", existing.id)!;
  }
  const id = Number(
    run(
      "INSERT INTO tags(label, category, status) VALUES (?, ?, 'active')",
      label,
      category,
    ).lastInsertRowid,
  );
  return one<TagRow>("SELECT id, label, category, status FROM tags WHERE id = ?", id)!;
}

export function retireTag(tagId: number) {
  const tag = one<TagRow>("SELECT id, label, category, status FROM tags WHERE id = ?", tagId);
  if (!tag || tag.status !== "active") throw new Error("公共标签不存在或已下架");
  if (!tagCategoryNames.includes(tag.category)) throw new Error("该标签不属于新遇官标签库");
  run("UPDATE tags SET status = 'retired', updated_at = CURRENT_TIMESTAMP WHERE id = ?", tagId);
  return listTags(true);
}

export function assignCreatorTag(creatorId: number, tagId: number, remove = false) {
  const tag = one<TagRow>("SELECT id, label, category, status FROM tags WHERE id = ? AND status = 'active'", tagId);
  if (!tag || !getCreator(creatorId)) throw new Error("用户或标签不存在");
  if (!tagCategoryNames.includes(tag.category)) throw new Error("该标签不属于新遇官标签库");
  const alreadySelected = Boolean(one("SELECT tag_id FROM creator_tags WHERE creator_id = ? AND tag_id = ?", creatorId, tagId));
  const categoryCount = Number(one<{ count: number }>(`SELECT COUNT(*) AS count FROM creator_tags ct JOIN tags t ON t.id = ct.tag_id WHERE ct.creator_id = ? AND t.category = ? AND t.status != 'archived'`, creatorId, tag.category)?.count || 0);
  if (!remove && !alreadySelected && categoryCount >= 8)
    throw new Error(`“${tag.category}”最多选择 8 个标签`);
  if (remove)
    run("DELETE FROM creator_tags WHERE creator_id = ? AND tag_id = ?", creatorId, tagId);
  else
    run(
      "INSERT OR IGNORE INTO creator_tags(creator_id, tag_id, source) VALUES (?, ?, 'platform')",
      creatorId,
      tagId,
    );
  run("UPDATE creators SET tags_submitted_at = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?", creatorId);
  run(
    `INSERT INTO inbox_messages(recipient_id, kind, subject, body, href)
     VALUES (?, 'review', '平台已调整你的标签', ?, '/studio?section=lights')`,
    creatorId,
    `平台已${remove ? "移除" : "增加"}标签“${tag.label}”。如有疑问，请联系TDE。`,
  );
  return getCreator(creatorId)!;
}

export function updateManagedCreatorDetails(
  creatorId: number,
  input: Record<string, unknown>,
  actor: string,
) {
  const current = one<CreatorRow>("SELECT * FROM creators WHERE id = ?", creatorId);
  if (!current) throw new Error("用户不存在");
  const brandName = cleanText(input.brandName ?? current.brand_name, 40);
  const intro = cleanText(input.intro ?? current.intro, 2000);
  const province = cleanText(input.province ?? current.province, 20);
  const city = cleanText(input.city ?? current.city, 30);
  const district = cleanText(input.district ?? current.district, 30);
  const slogan = cleanText(input.slogan ?? current.slogan, 7);
  if (province && city && !isValidLocation(province, city, district))
    throw new Error("请选择有效的省、市、区");
  const adminRating = cleanText(input.adminRating ?? current.admin_rating, 20) as CreatorRating;
  if (!["", "excellent", "good", "average", "poor"].includes(adminRating))
    throw new Error("用户分级不正确");
  const adminNote = cleanText(input.adminNote ?? current.admin_note, 500);
  const opportunityTypes = Array.isArray(input.opportunityTypes)
    ? [...new Set(input.opportunityTypes.map(String).filter((item) => cooperationTypes.includes(item as (typeof cooperationTypes)[number])))]
    : parseJson<string[]>(current.opportunity_types, []).filter((item) => cooperationTypes.includes(item as (typeof cooperationTypes)[number]));
  const opportunityOptIn = input.opportunityOptIn === undefined
    ? Boolean(current.opportunity_opt_in)
    : input.opportunityOptIn === true && opportunityTypes.length > 0;
  const precisionInviteGoals = input.precisionInviteGoals === undefined
    ? parseJson<string[]>(current.precision_invite_goals, []).filter((item) => precisionInviteGoalOptions.includes(item as (typeof precisionInviteGoalOptions)[number]))
    : normalizeChoiceList(input.precisionInviteGoals, precisionInviteGoalOptions, precisionInviteGoalOptions.length, "合作目标");
  const precisionInviteScenes = input.precisionInviteScenes === undefined
    ? parseJson<string[]>(current.precision_invite_scenes, []).filter((item) => precisionInviteSceneOptions.includes(item as (typeof precisionInviteSceneOptions)[number]))
    : normalizeChoiceList(input.precisionInviteScenes, precisionInviteSceneOptions, precisionInviteSceneOptions.length, "期待场景");
  const xiaohongshuFollowers = input.xiaohongshuFollowers === undefined
    ? current.xiaohongshu_followers
    : normalizeFollowerCount(input.xiaohongshuFollowers, "小红书粉丝数");
  const xiaohongshuUrl = input.xiaohongshuUrl === undefined
    ? current.xiaohongshu_url
    : normalizeSocialUrl(input.xiaohongshuUrl, "小红书链接");
  const douyinFollowers = input.douyinFollowers === undefined
    ? current.douyin_followers
    : normalizeFollowerCount(input.douyinFollowers, "抖音粉丝数");
  const douyinUrl = input.douyinUrl === undefined
    ? current.douyin_url
    : normalizeSocialUrl(input.douyinUrl, "抖音链接");
  const tagIds = Array.isArray(input.tagIds)
    ? [...new Set(input.tagIds.map(Number).filter(Number.isInteger))]
    : null;
  const periods = Array.isArray(input.busyPeriods)
    ? input.busyPeriods.slice(0, 30).map((item) => {
        const period = item as Record<string, unknown>;
        const startDate = cleanText(period.startDate, 10);
        const endDate = cleanText(period.endDate || period.startDate, 10);
        if (!validDate(startDate) || !validDate(endDate) || startDate > endDate)
          throw new Error("活动日期格式不正确");
        return { startDate, endDate, note: cleanText(period.note, 20) };
      })
    : null;
  const noBookings = input.noBookings === undefined ? Boolean(current.no_bookings) : input.noBookings === true;
  const safety = contentSafety(brandName, intro, adminNote);
  if (safety) throw new Error(safety);

  const db = getDb();
  transaction(() => {
    db.prepare(
      `UPDATE creators SET brand_name = ?, intro = ?, province = ?, city = ?, district = ?, slogan = ?, admin_rating = ?,
       admin_note = ?, opportunity_types = ?, opportunity_opt_in = ?, precision_invite_goals = ?, precision_invite_scenes = ?,
       xiaohongshu_followers = ?, xiaohongshu_url = ?, douyin_followers = ?, douyin_url = ?,
       service_intents = CASE WHEN ? = 1 THEN '["writer","opportunity"]' ELSE service_intents END,
       profile_submitted_at = CASE WHEN ? != '' AND ? != '' THEN COALESCE(profile_submitted_at, CURRENT_TIMESTAMP) ELSE profile_submitted_at END,
       updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    ).run(
      brandName,
      intro,
      province,
      city,
      district,
      slogan,
      adminRating,
      adminNote,
      JSON.stringify(opportunityTypes),
      opportunityOptIn ? 1 : 0,
      JSON.stringify(precisionInviteGoals),
      JSON.stringify(precisionInviteScenes),
      xiaohongshuFollowers,
      xiaohongshuUrl,
      douyinFollowers,
      douyinUrl,
      opportunityOptIn ? 1 : 0,
      province,
      city,
      creatorId,
    );
    if (tagIds) {
      const selected = tagIds.length
        ? all<TagRow>(`SELECT id, label, category, status FROM tags WHERE id IN (${tagIds.map(() => "?").join(",")}) AND status IN ('active', 'pending')`, ...tagIds)
          .filter((tag) => tagCategoryNames.includes(tag.category))
        : [];
      if (selected.length !== tagIds.length) throw new Error("包含不可用标签");
      const categoryCounts = new Map<string, number>();
      for (const tag of selected) {
        const count = (categoryCounts.get(tag.category) || 0) + 1;
        if (count > 8) throw new Error(`“${tag.category}”最多选择8个标签`);
        categoryCounts.set(tag.category, count);
      }
      db.prepare("DELETE FROM creator_tags WHERE creator_id = ?").run(creatorId);
      const insertTag = db.prepare("INSERT INTO creator_tags(creator_id, tag_id, source) VALUES (?, ?, 'platform')");
      for (const tag of selected) insertTag.run(creatorId, tag.id);
      db.prepare("UPDATE creators SET tags_submitted_at = CURRENT_TIMESTAMP, tags_first_submitted_at = COALESCE(tags_first_submitted_at, CURRENT_TIMESTAMP) WHERE id = ?").run(creatorId);
    }
    if (periods) {
      db.prepare("DELETE FROM busy_periods WHERE creator_id = ? AND source = 'manual'").run(creatorId);
      if (!noBookings) {
        const insertPeriod = db.prepare("INSERT INTO busy_periods(creator_id, start_date, end_date, note, source) VALUES (?, ?, ?, ?, 'manual')");
        for (const period of periods) insertPeriod.run(creatorId, period.startDate, period.endDate, period.note);
      }
      db.prepare(
        `UPDATE creators SET no_bookings = ?, schedule_confirmed_at = CURRENT_TIMESTAMP,
         generation_schedule_confirmed_at = NULL, generation_schedule_confirmation_used_at = NULL
         WHERE id = ?`,
      ).run(noBookings ? 1 : 0, creatorId);
      db.prepare(
        "UPDATE creator_applications SET busy_periods = ?, no_bookings = ?, updated_at = CURRENT_TIMESTAMP WHERE creator_id = ?",
      ).run(JSON.stringify(noBookings ? [] : periods), noBookings ? 1 : 0, creatorId);
    }
    if (Array.isArray(input.opportunityTypes))
      db.prepare(
        "UPDATE creator_applications SET opportunity_types = ?, updated_at = CURRENT_TIMESTAMP WHERE creator_id = ?",
      ).run(JSON.stringify(opportunityTypes), creatorId);
    db.prepare("INSERT INTO audit_logs(actor, action, detail) VALUES (?, 'managed_creator_update', ?)").run(
      cleanText(actor, 40),
      JSON.stringify({ creatorId, fields: Object.keys(input).sort() }),
    );
  });
  return getCreator(creatorId)!;
}

export function setManagedCreatorSuspended(
  creatorId: number,
  suspended: boolean,
  actor: string,
) {
  const current = one<CreatorRow>("SELECT * FROM creators WHERE id = ?", creatorId);
  if (!current) throw new Error("用户不存在");
  run(
    "UPDATE creators SET suspended = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
    suspended ? 1 : 0,
    creatorId,
  );
  run(
    "INSERT INTO audit_logs(actor, action, detail) VALUES (?, 'managed_creator_status', ?)",
    cleanText(actor, 40),
    JSON.stringify({ creatorId, suspended }),
  );
  return getCreator(creatorId)!;
}

export function setApplicationLimit(creatorId: number, value: unknown) {
  if (!getCreator(creatorId)) throw new Error("用户不存在");
  const raw = String(value ?? "");
  const limit = raw === "" || raw === "unlimited" ? null : Number(raw);
  if (limit !== null && (!Number.isInteger(limit) || limit < 0 || limit > 10000))
    throw new Error("申请额度不正确");
  run(
    "UPDATE creators SET application_limit = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
    limit,
    creatorId,
  );
  return getCreator(creatorId)!;
}

export function updateApplicationStatus(id: number, status: ApplicationStatus) {
  const allowed: ApplicationStatus[] = ["viewed", "downloaded", "needs_info", "processed", "rejected"];
  if (!allowed.includes(status)) throw new Error("申请状态不正确");
  const application = listApplications().find((item) => item.id === id);
  if (!application) throw new Error("申请不存在");
  run("UPDATE applications SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", status, id);
  const labels: Record<ApplicationStatus, string> = {
    draft: "草稿",
    notified: "已通知平台",
    viewed: "平台已查看",
    downloaded: "资料已下载",
    needs_info: "需要补充资料",
    processed: "已处理",
    rejected: "暂未通过",
  };
  run(
    `INSERT INTO inbox_messages(recipient_id, kind, subject, body, href)
     VALUES (?, 'application', '活动资料状态更新', ?, '/studio?section=profile&view=inbox')`,
    application.creatorId,
    `申请 ${application.reference} 已更新为“${labels[status]}”。`,
  );
  return listApplications().find((item) => item.id === id)!;
}

export function listPlatformNotifications(principal?: AdminPrincipal): PlatformNotification[] {
  const where = principal?.role === "subadmin" ? "WHERE created_by_admin_id = ?" : "";
  const values = principal?.role === "subadmin" ? [principal.id || 0] : [];
  return all<{
    id: number;
    source: PlatformNotification["source"];
    sender: string;
    subject: string;
    body: string;
    filter_snapshot: string;
    requested_count: number;
    sent_count: number;
    failed_count: number;
    sms_requested_count: number;
    sms_sent_count: number;
    sms_failed_count: number;
    wecom_requested_count: number;
    wecom_sent_count: number;
    wecom_failed_count: number;
    wecom_unbound_count: number;
    created_at: string;
  }>(`SELECT * FROM platform_notifications ${where} ORDER BY created_at DESC, id DESC`, ...values).map((row) => {
    const recipients = all<{
      id: number;
      name: string;
      phone: string;
      read_at: string | null;
      wecom_status: PlatformNotification["recipients"][number]["wecomStatus"];
      wecom_error: string | null;
    }>(
      `SELECT c.id, COALESCE(NULLIF(c.brand_name, ''), NULLIF(c.user_name, ''), c.phone) AS name,
       c.phone, im.read_at, wd.status AS wecom_status, wd.error AS wecom_error
       FROM inbox_messages im JOIN creators c ON c.id = im.recipient_id
       LEFT JOIN wecom_notification_deliveries wd ON wd.campaign_id = im.campaign_id AND wd.creator_id = im.recipient_id
       WHERE im.campaign_id = ? ORDER BY c.id`,
      row.id,
    ).map((recipient) => ({
      id: recipient.id,
      name: recipient.name,
      phone: recipient.phone,
      readAt: recipient.read_at,
      wecomStatus: recipient.wecom_status || null,
      wecomError: recipient.wecom_error || "",
    }));
    return {
      id: row.id,
      source: row.source,
      sender: row.sender,
      subject: row.subject,
      body: row.body,
      filterSnapshot: parseJson<Record<string, unknown>>(row.filter_snapshot, {}),
      requestedCount: row.requested_count,
      sentCount: row.sent_count,
      failedCount: row.failed_count,
      smsRequestedCount: row.sms_requested_count,
      smsSentCount: row.sms_sent_count,
      smsFailedCount: row.sms_failed_count,
      wecomRequestedCount: row.wecom_requested_count,
      wecomSentCount: row.wecom_sent_count,
      wecomFailedCount: row.wecom_failed_count,
      wecomUnboundCount: row.wecom_unbound_count,
      readCount: recipients.filter((recipient) => recipient.readAt).length,
      recipients,
      createdAt: row.created_at,
    };
  });
}

export function sendPlatformMessage(
  creatorIds: number[],
  subjectInput: unknown,
  bodyInput: unknown,
  options: { source?: unknown; filterSnapshot?: unknown; sender?: unknown; createdByAdminId?: number | null } = {},
) {
  const subject = cleanText(subjectInput, 80);
  const body = cleanText(bodyInput, 500);
  const safety = contentSafety(subject, body);
  if (!subject || !body) throw new Error("请填写通知标题和内容");
  if (safety) throw new Error(safety);
  const requestedIds = [...new Set(creatorIds.filter(Number.isInteger).filter((id) => id > 0))];
  if (!requestedIds.length) throw new Error("请至少选择一位接收用户");
  const source = options.source === "creator_search" ? "creator_search" : "platform";
  const sender = cleanText(options.sender || process.env.ADMIN_USERNAME || "admin", 40) || "admin";
  const createdByAdminId = Number(options.createdByAdminId || 0) || null;
  const filterInput = options.filterSnapshot && typeof options.filterSnapshot === "object"
    ? options.filterSnapshot as Record<string, unknown>
    : {};
  const filterSnapshot = source === "creator_search" ? {
    keyword: cleanText(filterInput.keyword, 60),
    province: cleanText(filterInput.province, 20),
    city: cleanText(filterInput.city, 30),
    startDate: cleanText(filterInput.startDate, 10),
    endDate: cleanText(filterInput.endDate, 10),
    tagIds: Array.isArray(filterInput.tagIds)
      ? [...new Set(filterInput.tagIds.map(Number).filter(Number.isInteger))]
      : [],
  } : {};
  const campaignId = Number(run(
    `INSERT INTO platform_notifications(source, sender, created_by_admin_id, subject, body, filter_snapshot, requested_count)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    source,
    sender,
    createdByAdminId,
    subject,
    body,
    JSON.stringify(filterSnapshot),
    requestedIds.length,
  ).lastInsertRowid);
  let sent = 0;
  for (const creatorId of requestedIds) {
    if (!getCreator(creatorId)) continue;
    run(
      `INSERT INTO inbox_messages(recipient_id, campaign_id, kind, subject, body, href)
       VALUES (?, ?, 'system', ?, ?, '/studio?section=profile&view=inbox')`,
      creatorId,
      campaignId,
      subject,
      body,
    );
    sent += 1;
  }
  run(
    "UPDATE platform_notifications SET sent_count = ?, failed_count = ? WHERE id = ?",
    sent,
    requestedIds.length - sent,
    campaignId,
  );
  return listPlatformNotifications().find((item) => item.id === campaignId)!;
}

export function setPlatformNotificationSmsCounts(id: number, requested: number, sent: number) {
  run(
    `UPDATE platform_notifications
     SET sms_requested_count = ?, sms_sent_count = ?, sms_failed_count = ?
     WHERE id = ?`,
    requested,
    sent,
    Math.max(0, requested - sent),
    id,
  );
  return listPlatformNotifications().find((item) => item.id === id)!;
}

export function saveTheme(input: Record<string, unknown>) {
  const id = Number(input.id || 0);
  const title = cleanText(input.title, 40);
  const category = cleanText(input.category, 30);
  const description = cleanText(input.description, 120);
  const accent = /^#[0-9A-Fa-f]{6}$/.test(String(input.accent || ""))
    ? String(input.accent)
    : "#555B63";
  const sortOrder = Number(input.sortOrder || 0);
  const active = input.active === false ? 0 : 1;
  const tagIds = Array.isArray(input.tagIds)
    ? [...new Set(input.tagIds.map(Number).filter(Number.isInteger))]
    : [];
  if (!title || !category) throw new Error("请填写主题名称和分类");
  const safety = contentSafety(title, description);
  if (safety) throw new Error(safety);
  let themeId = id;
  if (id) {
    run(
      "UPDATE themes SET title = ?, category = ?, description = ?, accent = ?, sort_order = ?, active = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
      title,
      category,
      description,
      accent,
      sortOrder,
      active,
      id,
    );
  } else {
    themeId = Number(
      run(
        "INSERT INTO themes(title, category, description, accent, sort_order, active) VALUES (?, ?, ?, ?, ?, ?)",
        title,
        category,
        description,
        accent,
        sortOrder,
        active,
      ).lastInsertRowid,
    );
  }
  run("DELETE FROM theme_tags WHERE theme_id = ?", themeId);
  for (const tagId of tagIds)
    run("INSERT OR IGNORE INTO theme_tags(theme_id, tag_id) VALUES (?, ?)", themeId, tagId);
  return listThemes(true).find((theme) => theme.id === themeId)!;
}

export function audit(actor: string, action: string, detail: Record<string, unknown>) {
  run(
    "INSERT INTO audit_logs(actor, action, detail) VALUES (?, ?, ?)",
    cleanText(actor, 80),
    cleanText(action, 80),
    JSON.stringify(detail),
  );
}

// ===== 设计策划模块（在线矢量海报）=====

export function listDesignSolarTerms(): DesignSolarTerm[] {
  return all<DesignSolarTerm>(
    "SELECT * FROM design_solar_terms WHERE status = 'active' ORDER BY month_day",
  );
}

export function getDesignSolarTerm(id: number): DesignSolarTerm | null {
  return one<DesignSolarTerm>("SELECT * FROM design_solar_terms WHERE id = ?", id);
}

export function listDesignTagCategories(): DesignTagCategory[] {
  return all<DesignTagCategory>(
    "SELECT * FROM design_tag_categories WHERE status = 'active' ORDER BY sort_order, id",
  );
}

export function listDesignTags(): DesignTag[] {
  return all<DesignTag>(
    "SELECT * FROM design_tags WHERE status = 'active' ORDER BY category_key, sort_order, id",
  );
}

export function listDesignTagsByCategory(categoryKey: string): DesignTag[] {
  return all<DesignTag>(
    "SELECT * FROM design_tags WHERE category_key = ? AND status = 'active' ORDER BY sort_order, id",
    categoryKey,
  );
}

export function createDesignTag(categoryKey: string, value: string): DesignTag {
  const label = cleanText(value, 20);
  if (!label) throw new Error("标签值不能为空");
  const category = one<{ key: string }>(
    "SELECT key FROM design_tag_categories WHERE key = ? AND status = 'active'",
    categoryKey,
  );
  if (!category) throw new Error("标签类别不存在或已停用");
  run(
    "INSERT INTO design_tags(category_key, value) VALUES (?, ?)",
    categoryKey,
    label,
  );
  const row = one<DesignTag>(
    "SELECT * FROM design_tags WHERE category_key = ? AND value = ?",
    categoryKey,
    label,
  );
  if (!row) throw new Error("新增标签失败");
  return row;
}

export function updateDesignTagStatus(id: number, status: "active" | "archived") {
  run("UPDATE design_tags SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", status, id);
}

export function updateDesignTagCategoryPick(categoryKey: string, pickCount: number) {
  const count = Math.min(5, Math.max(1, Number(pickCount) || 1));
  run(
    "UPDATE design_tag_categories SET pick_count = ?, updated_at = CURRENT_TIMESTAMP WHERE key = ?",
    count,
    categoryKey,
  );
}

// ---- BYOK：每人配置自己的豆包 Key ----

export function listDesignApiKeys(): DesignApiKey[] {
  return all<DesignApiKey>("SELECT * FROM design_api_keys ORDER BY id DESC");
}

export function createDesignApiKey(input: {
  operator_name: string;
  base_url: string;
  api_key: string;
  model: string;
  note: string;
  created_by: string;
}): DesignApiKey {
  const name = cleanText(input.operator_name, 40);
  if (!name) throw new Error("操作员名称不能为空");
  if (!cleanText(input.api_key, 500)) throw new Error("API Key 不能为空");
  if (!cleanText(input.model, 80)) throw new Error("模型名称不能为空");
  run(
    `INSERT INTO design_api_keys(operator_name, base_url, api_key_encrypted, model, note, created_by)
     VALUES (?, ?, ?, ?, ?, ?)`,
    name,
    cleanText(input.base_url, 300) || "https://ark.cn-beijing.volces.com/api/v3",
    encryptDesignKey(cleanText(input.api_key, 500)),
    cleanText(input.model, 80),
    cleanText(input.note, 200),
    cleanText(input.created_by, 40),
  );
  const row = one<DesignApiKey>(
    "SELECT * FROM design_api_keys WHERE operator_name = ? ORDER BY id DESC",
    name,
  );
  if (!row) throw new Error("保存 API Key 失败");
  return row;
}

export function updateDesignApiKey(
  id: number,
  input: { operator_name?: string; base_url?: string; api_key?: string; model?: string; note?: string; enabled?: number },
) {
  const existing = one<{ api_key_encrypted: string }>(
    "SELECT api_key_encrypted FROM design_api_keys WHERE id = ?",
    id,
  );
  if (!existing) throw new Error("该配置不存在");
  const fields: string[] = [];
  const values: (string | number)[] = [];
  if (input.operator_name !== undefined) {
    fields.push("operator_name = ?");
    values.push(cleanText(input.operator_name, 40));
  }
  if (input.base_url !== undefined) {
    fields.push("base_url = ?");
    values.push(cleanText(input.base_url, 300) || "https://ark.cn-beijing.volces.com/api/v3");
  }
  if (input.model !== undefined) {
    fields.push("model = ?");
    values.push(cleanText(input.model, 80));
  }
  if (input.note !== undefined) {
    fields.push("note = ?");
    values.push(cleanText(input.note, 200));
  }
  if (input.enabled !== undefined) {
    fields.push("enabled = ?");
    values.push(input.enabled ? 1 : 0);
  }
  if (input.api_key !== undefined && cleanText(input.api_key, 500)) {
    fields.push("api_key_encrypted = ?");
    values.push(encryptDesignKey(cleanText(input.api_key, 500)));
  }
  if (!fields.length) return;
  fields.push("updated_at = CURRENT_TIMESTAMP");
  run(`UPDATE design_api_keys SET ${fields.join(", ")} WHERE id = ?`, ...values, id);
}

export function deleteDesignApiKey(id: number) {
  run("DELETE FROM design_api_keys WHERE id = ?", id);
}

/** 解密 API Key（仅服务端内部调用，不经过 API 返回） */
export function getDesignApiKeyPlain(id: number): { apiKey: string; baseUrl: string; model: string; operatorName: string } | null {
  const row = one<{ operator_name: string; base_url: string; api_key_encrypted: string; model: string; enabled: number }>(
    "SELECT operator_name, base_url, api_key_encrypted, model, enabled FROM design_api_keys WHERE id = ?",
    id,
  );
  if (!row || !row.enabled) return null;
  try {
    return {
      apiKey: decryptDesignKey(row.api_key_encrypted),
      baseUrl: row.base_url,
      model: row.model,
      operatorName: row.operator_name,
    };
  } catch {
    return null;
  }
}

// ---- 抽卡会话与草稿 ----

export function createDesignSession(input: {
  solar_term_id: number;
  title: string;
  created_by: string;
}): DesignSession {
  const term = getDesignSolarTerm(input.solar_term_id);
  if (!term) throw new Error("节气不存在");
  const title = cleanText(input.title, 60) || `${term.name} · 市集海报`;
  const result = run(
    `INSERT INTO design_sessions(title, solar_term_id, created_by)
     VALUES (?, ?, ?)`,
    title,
    term.id,
    cleanText(input.created_by, 40),
  );
  const session = one<DesignSession>("SELECT * FROM design_sessions WHERE id = ?", Number(result.lastInsertRowid));
  if (!session) throw new Error("创建会话失败");
  return session;
}

export function listDesignSessions(limit = 50): Array<DesignSession & { solar_term_name: string; draft_count: number; confirmed: boolean }> {
  return all<DesignSession & { solar_term_name: string; draft_count: number; confirmed: boolean }>(
    `SELECT s.*, t.name AS solar_term_name,
       (SELECT COUNT(*) FROM design_drafts d WHERE d.session_id = s.id) AS draft_count,
       (s.selected_draft_id IS NOT NULL) AS confirmed
     FROM design_sessions s JOIN design_solar_terms t ON t.id = s.solar_term_id
     WHERE s.status != 'archived'
     ORDER BY s.created_at DESC LIMIT ?`,
    limit,
  );
}

export function getDesignSession(id: number) {
  return one<DesignSession & { solar_term_name: string }>(
    `SELECT s.*, t.name AS solar_term_name
     FROM design_sessions s JOIN design_solar_terms t ON t.id = s.solar_term_id
     WHERE s.id = ?`,
    id,
  );
}

export function archiveDesignSession(id: number) {
  run("UPDATE design_sessions SET status = 'archived', updated_at = CURRENT_TIMESTAMP WHERE id = ?", id);
}

/** 按每类 pick_count 随机组合标签；某类无可用标签时抛出可读错误（报错分级：数据缺失） */
export function randomTagCombo(): Array<{ category: string; category_name: string; value: string }> {
  const categories = listDesignTagCategories();
  const combo: Array<{ category: string; category_name: string; value: string }> = [];
  for (const category of categories) {
    const tags = listDesignTagsByCategory(category.key);
    if (!tags.length) {
      throw new Error(`标签类别「${category.name}」还没有可用标签，请先到标签库补充`);
    }
    const count = Math.min(category.pick_count || 1, tags.length);
    const pool = [...tags];
    for (let i = 0; i < count; i += 1) {
      const index = Math.floor(Math.random() * pool.length);
      combo.push({ category: category.key, category_name: category.name, value: pool[index].value });
      pool.splice(index, 1);
    }
  }
  return combo;
}

/** 抽卡：随机组合标签 + 豆包一键生成（提示词 + 结构化设计描述），消耗操作员自己的 Key */
export async function createDesignDraft(input: {
  session_id: number;
  operator_id: number;
  created_by: string;
}): Promise<DesignDraft> {
  const session = getDesignSession(input.session_id);
  if (!session) throw new Error("会话不存在");
  if (session.status === "confirmed") throw new Error("该会话已确认，如需继续请新建会话");
  const term = getDesignSolarTerm(session.solar_term_id);
  if (!term) throw new Error("节气不存在");

  const combo = randomTagCombo();
  const keyConfig = getDesignApiKeyPlain(input.operator_id);
  if (!keyConfig) throw new Error("该操作员未配置可用的 API Key，请联系管理员");

  const generated = await generateDesignBrief({
    term: { name: term.name, month_day: term.month_day, theme_hint: term.theme_hint },
    combo,
    apiKey: keyConfig.apiKey,
    baseUrl: keyConfig.baseUrl,
    model: keyConfig.model,
  });

  const nextVersion = Number(
    (one<{ v: number }>(
      "SELECT COALESCE(MAX(version), 0) + 1 AS v FROM design_drafts WHERE session_id = ?",
      session.id,
    ) as { v: number }).v,
  );

  const result = run(
    `INSERT INTO design_drafts(
       session_id, version, tag_combo, prompt_text, brief_json, style_key, grid_key, palette, created_by
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    session.id,
    nextVersion,
    JSON.stringify(combo),
    generated.prompt,
    JSON.stringify(generated.brief),
    generated.brief.style_key,
    generated.brief.grid_key,
    JSON.stringify([
      generated.brief.palette.background,
      generated.brief.palette.primary,
      generated.brief.palette.accent,
      generated.brief.palette.text,
    ]),
    cleanText(input.created_by, 40),
  );
  const row = one<DesignDraftRow>("SELECT * FROM design_drafts WHERE id = ?", Number(result.lastInsertRowid));
  if (!row) throw new Error("生成草稿失败");
  return draftFromRow(row);
}

type DesignDraftRow = Omit<DesignDraft, "tag_combo" | "brief_json" | "palette"> & {
  tag_combo: string;
  brief_json: string;
  palette: string;
};

function draftFromRow(row: DesignDraftRow): DesignDraft {
  return {
    ...row,
    tag_combo: parseJson(row.tag_combo, []),
    brief_json: parseJson(row.brief_json, {}) as DesignBrief,
    palette: parseJson(row.palette, []),
  };
}

export function listDesignDrafts(sessionId: number): DesignDraft[] {
  const rows = all<DesignDraftRow>(
    "SELECT * FROM design_drafts WHERE session_id = ? ORDER BY version ASC",
    sessionId,
  );
  return rows.map(draftFromRow);
}

export function getDesignDraft(id: number): DesignDraft | null {
  const row = one<DesignDraftRow>("SELECT * FROM design_drafts WHERE id = ?", id);
  return row ? draftFromRow(row) : null;
}

/** 前端渲染完成后回存 SVG（所见即所得） */
export function saveDesignDraftSvg(id: number, svg: string) {
  const cleanSvg = String(svg || "").slice(0, 500_000);
  if (!cleanSvg.trim()) throw new Error("SVG 内容为空");
  run(
    "UPDATE design_drafts SET svg = ?, svg_size = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
    cleanSvg,
    Buffer.byteLength(cleanSvg, "utf8"),
    id,
  );
}

/** 点「确定」：锁定草稿为选中版本，会话进入 confirmed 状态 */
export function selectDesignDraft(draftId: number) {
  const draft = getDesignDraft(draftId);
  if (!draft) throw new Error("草稿不存在");
  if (!draft.svg) throw new Error("该版本还未完成渲染，无法确定");
  transaction(() => {
    run(
      "UPDATE design_drafts SET status = CASE WHEN id = ? THEN 'selected' ELSE 'generated' END WHERE session_id = ?",
      draftId,
      draft.session_id,
    );
    run(
      "UPDATE design_sessions SET status = 'confirmed', selected_draft_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
      draftId,
      draft.session_id,
    );
  });
  return getDesignDraft(draftId);
}
