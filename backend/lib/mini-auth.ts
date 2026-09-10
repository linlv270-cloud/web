import crypto from "node:crypto";
import { one, run, transaction } from "./database";
import { creatorClaimCodeHash } from "./repository";
import { randomToken } from "./security";
import { getWechatMiniAccessToken } from "./wechat-mini";
import type { CreatorApplicationStatus, MiniActorType, MiniConsumer, MiniPrincipal } from "./mini-program-types";

type ConsumerRow = {
  id: number;
  openid: string;
  unionid: string;
  nickname: string;
  avatar_url: string;
  phone: string;
  province: string;
  city: string;
  district: string;
  suspended: number;
  created_at: string;
};

export type CreatorApplicationRecord = {
  id: number;
  creatorId: number;
  consumerId: number;
  status: CreatorApplicationStatus;
  inviteCode: string;
  phone: string;
  brandName: string;
  intro: string;
  province: string;
  city: string;
  district: string;
  representativeImageKey: string;
  logoImageKey: string;
  slogan: string;
  productImageKey: string;
  boothImageKey: string;
  historyImageKey: string;
  tagIds: number[];
  customTags: Array<{ category: string; label: string }>;
  opportunityTypes: string[];
  busyPeriods: Array<{ startDate: string; endDate: string; note: string }>;
  noBookings: boolean;
  agreementVersion: string;
  privacyVersion: string;
  publicAuthorized: boolean;
  consentAt: string | null;
  phonePublicAuthorized: boolean;
  phoneConsentAt: string | null;
  reviewNote: string;
  reviewedAt: string | null;
  reviewedBy: string;
  revision: number;
  submittedAt: string;
  createdAt: string;
  updatedAt: string;
};

function parseJson<T>(value: string, fallback: T): T {
  try { return JSON.parse(value) as T; } catch { return fallback; }
}

function mapCreatorApplication(row: Record<string, unknown>): CreatorApplicationRecord {
  return {
    id: Number(row.id),
    creatorId: Number(row.creator_id),
    consumerId: Number(row.consumer_id),
    status: String(row.status) as CreatorApplicationStatus,
    inviteCode: String(row.invite_code || ""),
    phone: String(row.phone || ""),
    brandName: String(row.brand_name || ""),
    intro: String(row.intro || ""),
    province: String(row.province || ""),
    city: String(row.city || ""),
    district: String(row.district || ""),
    representativeImageKey: String(row.representative_image_key || ""),
    logoImageKey: String(row.logo_image_key || ""),
    slogan: String(row.slogan || ""),
    productImageKey: String(row.product_image_key || ""),
    boothImageKey: String(row.booth_image_key || ""),
    historyImageKey: String(row.history_image_key || ""),
    tagIds: parseJson<number[]>(String(row.tag_ids || "[]"), []),
    customTags: parseJson<Array<{ category: string; label: string }>>(String(row.custom_tags || "[]"), []),
    opportunityTypes: parseJson<string[]>(String(row.opportunity_types || "[]"), []).filter((item) => item !== "同城约见"),
    busyPeriods: parseJson<Array<{ startDate: string; endDate: string; note: string }>>(String(row.busy_periods || "[]"), []),
    noBookings: Boolean(row.no_bookings),
    agreementVersion: String(row.agreement_version || "creator-application-v2"),
    privacyVersion: String(row.privacy_version || "privacy-v2"),
    publicAuthorized: Boolean(row.public_authorized),
    consentAt: row.consent_at ? String(row.consent_at) : null,
    phonePublicAuthorized: Boolean(row.phone_public_authorized),
    phoneConsentAt: row.phone_consent_at ? String(row.phone_consent_at) : null,
    reviewNote: String(row.review_note || ""),
    reviewedAt: row.reviewed_at ? String(row.reviewed_at) : null,
    reviewedBy: String(row.reviewed_by || ""),
    revision: Number(row.revision || 1),
    submittedAt: String(row.submitted_at || ""),
    createdAt: String(row.created_at || ""),
    updatedAt: String(row.updated_at || ""),
  };
}

export function getCreatorApplication(creatorId: number) {
  const row = one<Record<string, unknown>>("SELECT * FROM creator_applications WHERE creator_id = ?", creatorId);
  return row ? mapCreatorApplication(row) : null;
}

export function getConsumerCreatorApplication(consumerId: number) {
  const row = one<Record<string, unknown>>("SELECT * FROM creator_applications WHERE consumer_id = ?", consumerId);
  return row ? mapCreatorApplication(row) : null;
}

export function submitCreatorApplicationSnapshot(input: {
  creatorId: number;
  consumerId: number;
  inviteCode: string;
  phone: string;
  brandName: string;
  intro: string;
  province: string;
  city: string;
  district: string;
  representativeImageKey: string;
  logoImageKey: string;
  slogan: string;
  productImageKey: string;
  boothImageKey: string;
  historyImageKey: string;
  tagIds: number[];
  customTags: Array<{ category: string; label: string }>;
  opportunityTypes: string[];
  busyPeriods: Array<{ startDate: string; endDate: string; note: string }>;
  noBookings: boolean;
  phonePublicAuthorized: boolean;
  agreementVersion?: string;
  privacyVersion?: string;
}) {
  run(
    `INSERT INTO creator_applications(
      creator_id, consumer_id, status, invite_code, phone, brand_name, intro, province, city, district,
      representative_image_key, logo_image_key, slogan, product_image_key, booth_image_key, history_image_key, tag_ids, custom_tags, opportunity_types, busy_periods,
      no_bookings, agreement_version, privacy_version, public_authorized, consent_at,
      phone_public_authorized, phone_consent_at, submitted_at
    ) VALUES (?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT(creator_id) DO UPDATE SET consumer_id = excluded.consumer_id, status = 'pending',
      invite_code = excluded.invite_code, phone = excluded.phone, brand_name = excluded.brand_name,
      intro = excluded.intro, province = excluded.province, city = excluded.city,
      district = excluded.district, representative_image_key = excluded.representative_image_key,
      logo_image_key = excluded.logo_image_key,
      slogan = excluded.slogan,
      product_image_key = excluded.product_image_key,
      booth_image_key = excluded.booth_image_key,
      history_image_key = excluded.history_image_key,
      tag_ids = excluded.tag_ids, custom_tags = excluded.custom_tags, opportunity_types = excluded.opportunity_types,
      busy_periods = excluded.busy_periods, no_bookings = excluded.no_bookings, agreement_version = excluded.agreement_version,
      privacy_version = excluded.privacy_version, public_authorized = 1, consent_at = CURRENT_TIMESTAMP,
      phone_public_authorized = excluded.phone_public_authorized,
      phone_consent_at = CASE WHEN excluded.phone_public_authorized = 1 THEN CURRENT_TIMESTAMP ELSE NULL END,
      review_note = '', reviewed_at = NULL, reviewed_by = '', revision = creator_applications.revision + 1,
      submitted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP`,
    input.creatorId, input.consumerId, input.inviteCode, input.phone, input.brandName, input.intro, input.province, input.city,
    input.district, input.representativeImageKey, input.logoImageKey, input.slogan, input.productImageKey, input.boothImageKey, input.historyImageKey, JSON.stringify(input.tagIds), JSON.stringify(input.customTags),
    JSON.stringify(input.opportunityTypes), JSON.stringify(input.busyPeriods), input.noBookings ? 1 : 0,
    input.agreementVersion || "creator-application-v2", input.privacyVersion || "privacy-v2",
    input.phonePublicAuthorized ? 1 : 0,
  );
  return getCreatorApplication(input.creatorId)!;
}

function bearerToken(request: Request) {
  const header = request.headers.get("authorization") || "";
  return header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";
}

export function createMiniSession(actorType: MiniActorType, actorId: number) {
  const token = randomToken();
  const expiresAt = new Date(Date.now() + 30 * 86400000).toISOString();
  run("DELETE FROM mini_sessions WHERE expires_at <= ?", new Date().toISOString());
  run(
    "INSERT INTO mini_sessions(token, actor_type, actor_id, expires_at) VALUES (?, ?, ?, ?)",
    token,
    actorType,
    actorId,
    expiresAt,
  );
  return { token, expiresAt };
}

export function miniPrincipalFromRequest(request: Request): MiniPrincipal | null {
  const token = bearerToken(request);
  if (!token) return null;
  const row = one<{ actor_type: MiniActorType; actor_id: number }>(
    "SELECT actor_type, actor_id FROM mini_sessions WHERE token = ? AND expires_at > ?",
    token,
    new Date().toISOString(),
  );
  if (!row) return null;
  const active = row.actor_type === "consumer"
    ? one("SELECT id FROM consumer_accounts WHERE id = ? AND suspended = 0", row.actor_id)
    : one(
        `SELECT c.id FROM creators c
         LEFT JOIN creator_wechat_bindings b ON b.creator_id = c.id
         WHERE c.id = ? AND c.suspended = 0 AND COALESCE(b.workspace_enabled, 1) = 1`,
        row.actor_id,
      );
  return active ? { actorType: row.actor_type, actorId: row.actor_id } : null;
}

export function requireMiniActor(request: Request, actorType?: MiniActorType) {
  const principal = miniPrincipalFromRequest(request);
  if (!principal)
    return Response.json({ error: "请先完成微信登录" }, { status: 401, headers: { "cache-control": "no-store" } });
  if (actorType && principal.actorType !== actorType)
    return Response.json({ error: "当前账号不能进行此操作" }, { status: 403, headers: { "cache-control": "no-store" } });
  return null;
}

function mapConsumer(row: ConsumerRow): MiniConsumer {
  return {
    id: row.id,
    nickname: row.nickname,
    avatarUrl: row.avatar_url,
    phone: row.phone,
    province: row.province,
    city: row.city,
    district: row.district,
    createdAt: row.created_at,
  };
}

export function getMiniConsumer(id: number) {
  const row = one<ConsumerRow>("SELECT * FROM consumer_accounts WHERE id = ?", id);
  return row ? mapConsumer(row) : null;
}

export function getMiniAccountRoles(consumerId: number) {
  const binding = one<{ creator_id: number; status: CreatorApplicationStatus; workspace_enabled: number }>(
    `SELECT b.creator_id, COALESCE(a.status, b.status) AS status, b.workspace_enabled
     FROM creator_wechat_bindings b LEFT JOIN creator_applications a ON a.creator_id = b.creator_id
     WHERE b.consumer_id = ?`,
    consumerId,
  );
  return {
    consumer: true,
    creatorId: binding?.workspace_enabled ? binding.creator_id : null,
    creatorStatus: binding?.workspace_enabled ? binding.status : "none",
    creatorWorkspaceEnabled: Boolean(binding?.workspace_enabled),
  };
}

export function bindMiniCreator(consumerId: number, creatorId: number, status: "pending" | "active" = "pending") {
  const consumer = one<ConsumerRow>("SELECT * FROM consumer_accounts WHERE id = ?", consumerId);
  if (!consumer) throw new Error("微信账户不存在");
  const existing = one<{ creator_id: number }>(
    "SELECT creator_id FROM creator_wechat_bindings WHERE consumer_id = ? OR openid = ?",
    consumerId,
    consumer.openid,
  );
  if (existing && existing.creator_id !== creatorId) throw new Error("这个微信账户已绑定其他新遇官档案");
  run(
    `INSERT INTO creator_wechat_bindings(creator_id, consumer_id, openid, unionid, status, workspace_enabled, submitted_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
     ON CONFLICT(creator_id) DO UPDATE SET consumer_id = excluded.consumer_id, openid = excluded.openid,
     unionid = excluded.unionid, status = excluded.status, workspace_enabled = 1,
     submitted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP`,
    creatorId,
    consumerId,
    consumer.openid,
    consumer.unionid,
    status,
  );
  return getMiniAccountRoles(consumerId);
}

export async function claimManagedCreator(input: {
  consumerId: number;
  code: string;
  phoneCode: string;
  mockPhone?: string;
  agreed: boolean;
}) {
  const code = String(input.code || "").trim().toUpperCase();
  if (!/^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{8}$/.test(code))
    throw new Error("请输入8位有效认领码");
  if (!input.agreed) throw new Error("请先确认认领并同意隐私政策");
  const consumer = one<ConsumerRow>("SELECT * FROM consumer_accounts WHERE id = ?", input.consumerId);
  if (!consumer || consumer.suspended) throw new Error("微信账户不可用");
  if (one("SELECT creator_id FROM creator_wechat_bindings WHERE consumer_id = ?", input.consumerId))
    throw new Error("当前微信账户已经绑定新遇官档案");
  const phone = await exchangeWechatPhoneCode(input.phoneCode, input.mockPhone || "");
  const token = one<{
    id: number;
    creator_id: number;
    creator_phone: string;
    suspended: number;
    created_by_admin_id: number | null;
  }>(
    `SELECT t.id, t.creator_id, c.phone AS creator_phone, c.suspended, c.created_by_admin_id
     FROM creator_claim_tokens t JOIN creators c ON c.id = t.creator_id
     WHERE t.code_hash = ? AND t.consumed_at IS NULL AND t.revoked_at IS NULL AND t.expires_at > ?`,
    creatorClaimCodeHash(code),
    new Date().toISOString(),
  );
  if (!token) throw new Error("认领码无效或已过期，请联系管理员重新生成");
  if (!token.created_by_admin_id) throw new Error("该档案不支持管理员认领");
  if (token.suspended) throw new Error("该新遇官档案已暂停，请联系管理员");
  if (phone !== token.creator_phone) throw new Error("微信授权手机号与管理员登记手机号不一致");
  if (one("SELECT creator_id FROM creator_wechat_bindings WHERE creator_id = ?", token.creator_id))
    throw new Error("该新遇官档案已经被认领");
  transaction(() => {
    run(
      "UPDATE consumer_accounts SET phone = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
      phone,
      input.consumerId,
    );
    bindMiniCreator(input.consumerId, token.creator_id, "active");
    run("UPDATE creator_claim_tokens SET consumed_at = CURRENT_TIMESTAMP WHERE id = ?", token.id);
    run(
      `UPDATE creator_claim_tokens SET revoked_at = COALESCE(revoked_at, CURRENT_TIMESTAMP)
       WHERE creator_id = ? AND id != ? AND consumed_at IS NULL AND revoked_at IS NULL`,
      token.creator_id,
      token.id,
    );
    run(
      `UPDATE creators SET phone_verified_at = COALESCE(phone_verified_at, CURRENT_TIMESTAMP),
       password_login_enabled = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      token.creator_id,
    );
    run(
      "INSERT INTO audit_logs(actor, action, detail) VALUES ('微信用户', 'creator_claim_complete', ?)",
      JSON.stringify({ creatorId: token.creator_id, consumerId: input.consumerId }),
    );
  });
  return {
    creatorId: token.creator_id,
    roles: getMiniAccountRoles(input.consumerId),
    session: createMiniSession("creator", token.creator_id),
  };
}

export function createBoundCreatorSession(consumerId: number) {
  const binding = one<{ creator_id: number; status: string; suspended: number; workspace_enabled: number }>(
    `SELECT b.creator_id, COALESCE(a.status, b.status) AS status, c.suspended, b.workspace_enabled
     FROM creator_wechat_bindings b JOIN creators c ON c.id = b.creator_id
     LEFT JOIN creator_applications a ON a.creator_id = b.creator_id
     WHERE b.consumer_id = ?`,
    consumerId,
  );
  if (!binding) throw new Error("当前微信账户还没有新遇官档案");
  if (!binding.workspace_enabled) throw new Error("当前账号已恢复游客状态，请重新提交新遇官申请");
  if (binding.suspended) throw new Error("新遇官档案已暂停，请联系TDE");
  return { session: createMiniSession("creator", binding.creator_id), creatorId: binding.creator_id, status: binding.status };
}

async function exchangeWechatCode(code: string) {
  const appId = process.env.WECHAT_MINI_APP_ID || "";
  const secret = process.env.WECHAT_MINI_APP_SECRET || "";
  const mockAllowed = process.env.MINI_AUTH_MOCK === "true" || process.env.NODE_ENV === "test";
  if (!appId || !secret) {
    if (!mockAllowed) throw new Error("微信小程序登录尚未配置");
    const digest = crypto.createHash("sha256").update(code || crypto.randomUUID()).digest("hex").slice(0, 24);
    return { openid: `mock_${digest}`, unionid: "" };
  }
  const url = new URL("https://api.weixin.qq.com/sns/jscode2session");
  url.searchParams.set("appid", appId);
  url.searchParams.set("secret", secret);
  url.searchParams.set("js_code", code);
  url.searchParams.set("grant_type", "authorization_code");
  const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
  const data = await response.json() as { openid?: string; unionid?: string; errcode?: number; errmsg?: string };
  if (!response.ok || !data.openid) throw new Error(`微信登录失败：${data.errmsg || data.errcode || response.status}`);
  return { openid: data.openid, unionid: data.unionid || "" };
}

export async function loginMiniConsumer(code: string) {
  if (!code || code.length > 160) throw new Error("微信登录凭证无效");
  const identity = await exchangeWechatCode(code);
  let row = one<ConsumerRow>("SELECT * FROM consumer_accounts WHERE openid = ?", identity.openid);
  if (!row) {
    const id = Number(run(
      "INSERT INTO consumer_accounts(openid, unionid) VALUES (?, ?)",
      identity.openid,
      identity.unionid,
    ).lastInsertRowid);
    row = one<ConsumerRow>("SELECT * FROM consumer_accounts WHERE id = ?", id);
  } else if (identity.unionid) {
    run("UPDATE consumer_accounts SET unionid = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", identity.unionid, row.id);
  }
  if (!row || row.suspended) throw new Error("当前账号暂时无法使用，请联系TDE");
  return { consumer: mapConsumer(row), roles: getMiniAccountRoles(row.id), session: createMiniSession("consumer", row.id) };
}

export async function exchangeWechatPhoneCode(code: string, mockPhone = "") {
  const appId = process.env.WECHAT_MINI_APP_ID || "";
  const secret = process.env.WECHAT_MINI_APP_SECRET || "";
  const mockAllowed = process.env.MINI_AUTH_MOCK === "true" || process.env.NODE_ENV === "test";
  if (!appId || !secret) {
    if (!mockAllowed || !/^1\d{10}$/.test(mockPhone)) throw new Error("微信手机号授权尚未配置");
    return mockPhone;
  }
  if (!code) throw new Error("请先授权微信手机号");
  const accessToken = await getWechatMiniAccessToken();
  const phoneResponse = await fetch(
    `https://api.weixin.qq.com/wxa/business/getuserphonenumber?access_token=${encodeURIComponent(accessToken)}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code }),
      signal: AbortSignal.timeout(10000),
    },
  );
  const phoneData = await phoneResponse.json() as { errcode?: number; errmsg?: string; phone_info?: { purePhoneNumber?: string } };
  const phone = phoneData.phone_info?.purePhoneNumber || "";
  if (!/^1\d{10}$/.test(phone)) throw new Error(`微信手机号授权失败：${phoneData.errmsg || phoneData.errcode || phoneResponse.status}`);
  return phone;
}

export function updateMiniConsumer(id: number, input: Record<string, unknown>) {
  const current = one<ConsumerRow>("SELECT * FROM consumer_accounts WHERE id = ?", id);
  if (!current) throw new Error("用户不存在");
  const clean = (value: unknown, limit: number) => String(value || "").replace(/[<>]/g, "").trim().slice(0, limit);
  run(
    `UPDATE consumer_accounts SET nickname = ?, avatar_url = ?, province = ?, city = ?, district = ?,
     updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    clean(input.nickname ?? current.nickname, 30),
    clean(input.avatarUrl ?? current.avatar_url, 500),
    clean(input.province ?? current.province, 20),
    clean(input.city ?? current.city, 30),
    clean(input.district ?? current.district, 30),
    id,
  );
  return getMiniConsumer(id)!;
}
