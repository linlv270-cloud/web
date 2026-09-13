import crypto from "node:crypto";
import { all, one, run, transaction } from "./database";
import type { VisualizationUser, VisualizationAccessEvent } from "./types";

const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7天

export type VizInterfaceSettings = {
  landingTitle: string;
  landingSubtitle: string;
  loginButtonLabel: string;
  contactButtonLabel: string;
  loginTitle: string;
  loginSubtitle: string;
  headerName: string;
  headerSubtitle: string;
  pageTitle: string;
};

export const DEFAULT_VIZ_INTERFACE_SETTINGS: VizInterfaceSettings = {
  landingTitle: "TDE",
  landingSubtitle: "小众&创意主理人名录可视化平台",
  loginButtonLabel: "登录",
  contactButtonLabel: "联络TDE",
  loginTitle: "TDE",
  loginSubtitle: "可视化用户登录",
  headerName: "TDE",
  headerSubtitle: "主理人名录可视化平台",
  pageTitle: "TDE主理人名录可视化平台",
};

const VIZ_INTERFACE_SETTINGS_KEY = "viz_interface_settings";

function hashPassword(password: string, salt: string): string {
  return crypto.pbkdf2Sync(password, salt, 100000, 64, "sha512").toString("hex");
}

function rowToUser(row: Record<string, unknown>): VisualizationUser {
  return {
    id: Number(row.id),
    name: String(row.name || ""),
    phone: String(row.phone || ""),
    accessScope: (row.access_scope as "all" | "province" | "city") || "all",
    province: String(row.province || ""),
    city: String(row.city || ""),
    unit: String(row.unit || ""),
    position: String(row.position || ""),
    note: String(row.note || ""),
    status: (row.status as "active" | "suspended") || "active",
    expiresAt: row.expires_at ? Number(row.expires_at) : null,
    createdAt: String(row.created_at || ""),
    updatedAt: String(row.updated_at || ""),
  };
}

function rowToEvent(row: Record<string, unknown>): VisualizationAccessEvent {
  return {
    id: Number(row.id),
    vizUserId: Number(row.viz_user_id),
    action: row.action as VisualizationAccessEvent["action"],
    daysDelta: Number(row.days_delta || 0),
    beforeExpiresAt: row.before_expires_at ? Number(row.before_expires_at) : null,
    afterExpiresAt: row.after_expires_at ? Number(row.after_expires_at) : null,
    operatorAdminId: row.operator_admin_id ? Number(row.operator_admin_id) : null,
    note: String(row.note || ""),
    createdAt: String(row.created_at || ""),
  };
}

// ========== 用户管理 ==========

export function listVisualizationUsers(): VisualizationUser[] {
  const rows = all(
    "SELECT * FROM visualization_users ORDER BY created_at DESC",
  ) as Record<string, unknown>[];
  return rows.map(rowToUser);
}

export function getVisualizationUser(id: number): VisualizationUser | null {
  const row = one("SELECT * FROM visualization_users WHERE id = ?", id) as
    | Record<string, unknown>
    | undefined;
  return row ? rowToUser(row) : null;
}

export function getVisualizationUserByPhone(phone: string): VisualizationUser | null {
  const row = one("SELECT * FROM visualization_users WHERE phone = ?", phone) as
    | Record<string, unknown>
    | undefined;
  return row ? rowToUser(row) : null;
}

export function createVisualizationUser(input: {
  name: string;
  phone: string;
  password: string;
  accessScope?: "all" | "province" | "city";
  province?: string;
  city?: string;
  unit?: string;
  position?: string;
  note?: string;
  expiresAt?: number | null;
  createdByAdminId?: number | null;
}): VisualizationUser {
  const existing = getVisualizationUserByPhone(input.phone);
  if (existing) throw new Error("该手机号已存在");

  const salt = crypto.randomBytes(16).toString("hex");
  const passwordHash = hashPassword(input.password, salt);
  const now = new Date().toISOString();
  const accessScope = input.accessScope || "all";

  const result = run(
    `INSERT INTO visualization_users
      (name, phone, password_hash, password_salt, access_scope, province, city, unit, position, note, status, expires_at, created_by_admin_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?)`,
    input.name,
    input.phone,
    passwordHash,
    salt,
    accessScope,
    input.province || "",
    input.city || "",
    input.unit || "",
    input.position || "",
    input.note || "",
    input.expiresAt ?? null,
    input.createdByAdminId ?? null,
    now,
    now,
  );
  const id = Number(result.lastInsertRowid);

  // 记录开通事件
  if (input.expiresAt) {
    run(
      `INSERT INTO visualization_access_events
        (viz_user_id, action, days_delta, before_expires_at, after_expires_at, operator_admin_id, note, created_at)
       VALUES (?, 'open', 0, NULL, ?, ?, '开通账号', ?)`,
      id,
      input.expiresAt,
      input.createdByAdminId ?? null,
      now,
    );
  }

  return getVisualizationUser(id)!;
}

export function updateVisualizationUser(
  id: number,
  input: {
    name?: string;
    accessScope?: "all" | "province" | "city";
    province?: string;
    city?: string;
    unit?: string;
    position?: string;
    note?: string;
    status?: "active" | "suspended";
  },
): VisualizationUser {
  const user = getVisualizationUser(id);
  if (!user) throw new Error("用户不存在");

  const now = new Date().toISOString();
  run(
    `UPDATE visualization_users SET
      name = COALESCE(?, name),
      access_scope = COALESCE(?, access_scope),
      province = COALESCE(?, province),
      city = COALESCE(?, city),
      unit = COALESCE(?, unit),
      position = COALESCE(?, position),
      note = COALESCE(?, note),
      status = COALESCE(?, status),
      updated_at = ?
     WHERE id = ?`,
    input.name ?? null,
    input.accessScope ?? null,
    input.province ?? null,
    input.city ?? null,
    input.unit ?? null,
    input.position ?? null,
    input.note ?? null,
    input.status ?? null,
    now,
    id,
  );
  return getVisualizationUser(id)!;
}

export function setVisualizationUserPassword(id: number, newPassword: string): void {
  const user = getVisualizationUser(id);
  if (!user) throw new Error("用户不存在");

  const salt = crypto.randomBytes(16).toString("hex");
  const passwordHash = hashPassword(newPassword, salt);
  const now = new Date().toISOString();

  run(
    "UPDATE visualization_users SET password_hash = ?, password_salt = ?, updated_at = ? WHERE id = ?",
    passwordHash,
    salt,
    now,
    id,
  );
}

export function extendVisualizationUser(
  id: number,
  days: number,
  operatorAdminId: number | null,
  note?: string,
): VisualizationUser {
  const user = getVisualizationUser(id);
  if (!user) throw new Error("用户不存在");

  const now = Date.now();
  const nowIso = new Date().toISOString();
  const base = user.expiresAt && user.expiresAt > now ? user.expiresAt : now;
  const afterExpiresAt = base + days * 24 * 60 * 60 * 1000;

  transaction(() => {
    run(
      "UPDATE visualization_users SET expires_at = ?, updated_at = ? WHERE id = ?",
      afterExpiresAt,
      nowIso,
      id,
    );
    run(
      `INSERT INTO visualization_access_events
        (viz_user_id, action, days_delta, before_expires_at, after_expires_at, operator_admin_id, note, created_at)
       VALUES (?, 'extend', ?, ?, ?, ?, ?, ?)`,
      id,
      days,
      user.expiresAt,
      afterExpiresAt,
      operatorAdminId,
      note || "管理员续时",
      nowIso,
    );
  });

  return getVisualizationUser(id)!;
}

export function setVisualizationUserExpiry(
  id: number,
  expiresAt: number | null,
  operatorAdminId: number | null,
  note?: string,
): VisualizationUser {
  const user = getVisualizationUser(id);
  if (!user) throw new Error("用户不存在");

  const nowIso = new Date().toISOString();
  transaction(() => {
    run(
      "UPDATE visualization_users SET expires_at = ?, updated_at = ? WHERE id = ?",
      expiresAt,
      nowIso,
      id,
    );
    run(
      `INSERT INTO visualization_access_events
        (viz_user_id, action, days_delta, before_expires_at, after_expires_at, operator_admin_id, note, created_at)
       VALUES (?, 'extend', 0, ?, ?, ?, ?, ?)`,
      id,
      user.expiresAt,
      expiresAt,
      operatorAdminId,
      note || "管理员设置有效期",
      nowIso,
    );
  });

  return getVisualizationUser(id)!;
}

export function listVisualizationAccessEvents(vizUserId: number): VisualizationAccessEvent[] {
  const rows = all(
    "SELECT * FROM visualization_access_events WHERE viz_user_id = ? ORDER BY created_at DESC LIMIT 50",
    vizUserId,
  ) as Record<string, unknown>[];
  return rows.map(rowToEvent);
}

// ========== 登录与会话 ==========

export function verifyVisualizationLogin(phone: string, password: string): { user: VisualizationUser; token: string } {
  const user = getVisualizationUserByPhone(phone);
  if (!user) throw new Error("手机号或密码错误");
  if (user.status !== "active") throw new Error("账号已被停用");

  const row = one(
    "SELECT password_hash, password_salt FROM visualization_users WHERE id = ?",
    user.id,
  ) as Record<string, unknown> | undefined;
  if (!row) throw new Error("账号异常");

  const expectedHash = String(row.password_hash);
  const salt = String(row.password_salt);
  const actualHash = hashPassword(password, salt);
  if (actualHash !== expectedHash) throw new Error("手机号或密码错误");

  // 检查有效期
  if (user.expiresAt && user.expiresAt < Date.now()) {
    throw new Error("账号已过期，请联系TDE续时");
  }

  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS).toISOString();
  run(
    "INSERT INTO visualization_sessions(token, viz_user_id, expires_at, created_at) VALUES (?, ?, ?, ?)",
    token,
    user.id,
    expiresAt,
    new Date().toISOString(),
  );

  return { user, token };
}

export function getVisualizationSession(token: string): VisualizationUser | null {
  const row = one(
    `SELECT vu.* FROM visualization_sessions vs
     JOIN visualization_users vu ON vu.id = vs.viz_user_id
     WHERE vs.token = ? AND vs.expires_at > ?`,
    token,
    new Date().toISOString(),
  ) as Record<string, unknown> | undefined;
  if (!row) return null;
  const user = rowToUser(row);
  // 再次检查有效期
  if (user.expiresAt && user.expiresAt < Date.now()) return null;
  return user;
}

export function destroyVisualizationSession(token: string): void {
  run("DELETE FROM visualization_sessions WHERE token = ?", token);
}

// ========== 联络TDE文字段 ==========

export function getVizContactText(): string {
  const row = one(
    "SELECT value FROM platform_settings WHERE key = 'viz_contact_text'",
  ) as { value: string } | undefined;
  return row?.value || "请联系TDE运营团队，电话：400-000-0000，微信：qideng2026";
}

export function setVizContactText(text: string): void {
  run(
    "INSERT OR REPLACE INTO platform_settings(key, value, updated_at) VALUES ('viz_contact_text', ?, ?)",
    text,
    new Date().toISOString(),
  );
}

export function getVizInterfaceSettings(): VizInterfaceSettings {
  const row = one(
    "SELECT value FROM platform_settings WHERE key = ?",
    VIZ_INTERFACE_SETTINGS_KEY,
  ) as { value: string } | undefined;
  if (!row) return { ...DEFAULT_VIZ_INTERFACE_SETTINGS };
  try {
    const parsed = JSON.parse(row.value) as Partial<VizInterfaceSettings>;
    return Object.fromEntries(
      Object.entries(DEFAULT_VIZ_INTERFACE_SETTINGS).map(([key, fallback]) => [
        key,
        typeof parsed[key as keyof VizInterfaceSettings] === "string" &&
        parsed[key as keyof VizInterfaceSettings]?.trim()
          ? String(parsed[key as keyof VizInterfaceSettings]).trim()
          : fallback,
      ]),
    ) as VizInterfaceSettings;
  } catch {
    return { ...DEFAULT_VIZ_INTERFACE_SETTINGS };
  }
}

export function setVizInterfaceSettings(input: Partial<VizInterfaceSettings>): VizInterfaceSettings {
  const next = Object.fromEntries(
    Object.entries(DEFAULT_VIZ_INTERFACE_SETTINGS).map(([key, fallback]) => {
      const value = input[key as keyof VizInterfaceSettings];
      return [key, typeof value === "string" && value.trim() ? value.trim().slice(0, 80) : fallback];
    }),
  ) as VizInterfaceSettings;
  run(
    `INSERT INTO platform_settings(key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP`,
    VIZ_INTERFACE_SETTINGS_KEY,
    JSON.stringify(next),
  );
  return next;
}

// ========== 有效期检查 ==========

export function isVisualizationUserActive(user: VisualizationUser): boolean {
  if (user.status !== "active") return false;
  if (user.expiresAt && user.expiresAt < Date.now()) return false;
  return true;
}

export function daysRemaining(expiresAt: number | null): number {
  if (!expiresAt) return -1; // 永久
  const diff = expiresAt - Date.now();
  if (diff <= 0) return 0;
  return Math.ceil(diff / (24 * 60 * 60 * 1000));
}
