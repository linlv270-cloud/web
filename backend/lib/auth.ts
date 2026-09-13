import { one, run } from "./database";
import { randomToken } from "./security";
import type { AdminPrincipal } from "./types";

export const CREATOR_COOKIE = "qideng_invite_creator";
export const ADMIN_COOKIE = "qideng_invite_admin";

function readCookie(request: Request, name: string) {
  for (const part of (request.headers.get("cookie") || "").split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return "";
}

function cookie(name: string, value: string, request: Request, maxAge: number) {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

export function clearCookie(name: string, request: Request) {
  return cookie(name, "", request, 0);
}

export function destroyCreatorSession(request: Request) {
  const token = readCookie(request, CREATOR_COOKIE);
  if (token) run("DELETE FROM creator_sessions WHERE token = ?", token);
  return clearCookie(CREATOR_COOKIE, request);
}

export function destroyAdminSession(request: Request) {
  const token = readCookie(request, ADMIN_COOKIE);
  if (token) run("DELETE FROM admin_sessions WHERE token = ?", token);
  return clearCookie(ADMIN_COOKIE, request);
}

export function createCreatorSession(creatorId: number, request: Request) {
  const token = randomToken();
  const expiresAt = new Date(Date.now() + 30 * 86400000).toISOString();
  run(
    "DELETE FROM creator_sessions WHERE expires_at <= ?",
    new Date().toISOString(),
  );
  run(
    "INSERT INTO creator_sessions(token, creator_id, expires_at) VALUES (?, ?, ?)",
    token,
    creatorId,
    expiresAt,
  );
  return { token, cookie: cookie(CREATOR_COOKIE, token, request, 30 * 86400) };
}

export function creatorIdFromRequest(request: Request) {
  const token = readCookie(request, CREATOR_COOKIE);
  if (!token) return null;
  const row = one<{ creator_id: number }>(
    `SELECT s.creator_id FROM creator_sessions s
     JOIN creators c ON c.id = s.creator_id
     WHERE s.token = ? AND s.expires_at > ? AND c.suspended = 0`,
    token,
    new Date().toISOString(),
  );
  return row?.creator_id ?? null;
}

export function createAdminSession(request: Request, principal: AdminPrincipal = { id: null, role: "super", label: "超级管理员" }) {
  const token = randomToken();
  const expiresAt = new Date(Date.now() + 12 * 3600000).toISOString();
  run(
    "DELETE FROM admin_sessions WHERE expires_at <= ?",
    new Date().toISOString(),
  );
  run(
    "INSERT INTO admin_sessions(token, admin_account_id, role, actor_label, expires_at) VALUES (?, ?, ?, ?, ?)",
    token,
    principal.id,
    principal.role,
    principal.label,
    expiresAt,
  );
  return { cookie: cookie(ADMIN_COOKIE, token, request, 12 * 3600) };
}

export function adminPrincipalFromRequest(request: Request): AdminPrincipal | null {
  const token = readCookie(request, ADMIN_COOKIE);
  if (!token) return null;
  const row = one<{
    admin_account_id: number | null;
    role: AdminPrincipal["role"];
    actor_label: string;
    account_status: string | null;
  }>(
    `SELECT s.admin_account_id, s.role, s.actor_label, a.status AS account_status
     FROM admin_sessions s LEFT JOIN admin_accounts a ON a.id = s.admin_account_id
     WHERE s.token = ? AND s.expires_at > ?`,
    token,
    new Date().toISOString(),
  );
  if (!row) return null;
  if (row.role === "subadmin" && row.account_status !== "active") return null;
  return { id: row.admin_account_id, role: row.role, label: row.actor_label };
}

export function isAdminRequest(request: Request) {
  return Boolean(adminPrincipalFromRequest(request));
}

export function adminCanManageCreator(request: Request, creatorId: number) {
  const principal = adminPrincipalFromRequest(request);
  if (!principal) return false;
  if (principal.role === "super") return true;
  return Boolean(
    principal.id &&
      one(
        "SELECT id FROM creators WHERE id = ? AND manager_admin_id = ?",
        creatorId,
        principal.id,
      ),
  );
}

export function requireCreator(request: Request) {
  const creatorId = creatorIdFromRequest(request);
  return creatorId
    ? null
    : Response.json({ error: "请先登录" }, { status: 401 });
}

export function requireAdmin(request: Request) {
  const principal = adminPrincipalFromRequest(request);
  if (!principal) return Response.json({ error: "请先登录运营台" }, { status: 401 });
  const pathname = new URL(request.url).pathname;
  const subadminPaths = new Set([
    "/api/admin/overview",
    "/api/admin/creators",
    "/api/admin/creator-image",
    "/api/admin/messages",
    "/api/admin/account/password",
  ]);
  return principal.role === "super" || subadminPaths.has(pathname) || pathname.startsWith("/api/admin/mini/")
    || pathname.startsWith("/api/admin/workshop/") || pathname.startsWith("/api/admin/wecom/")
    || pathname.startsWith("/api/admin/design/") || pathname === "/api/admin/projects"
    || pathname.startsWith("/api/admin/projects/")
    ? null
    : Response.json({ error: "该账号没有此操作权限" }, { status: 403 });
}

export function requireSuperAdmin(request: Request) {
  const principal = adminPrincipalFromRequest(request);
  return principal?.role === "super"
    ? null
    : Response.json({ error: principal ? "该账号没有此操作权限" : "请先登录运营台" }, { status: principal ? 403 : 401 });
}
