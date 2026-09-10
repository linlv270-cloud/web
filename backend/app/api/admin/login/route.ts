import crypto from "node:crypto";
import { createAdminSession } from "../../../../lib/auth";
import { rateLimit } from "../../../../lib/security";
import { loginAdminAccount } from "../../../../lib/repository";

function equal(a: string, b: string) { const left = Buffer.from(a); const right = Buffer.from(b); return left.length === right.length && crypto.timingSafeEqual(left, right); }
export async function POST(request: Request) {
  try {
  const limited = rateLimit(request, "admin-login", 10, 15 * 60000); if (limited) return limited;
  const data = await request.json().catch(() => ({}));
  const expectedUser = process.env.ADMIN_USERNAME || (process.env.NODE_ENV === "production" ? "" : "admin");
  const expectedPassword = process.env.ADMIN_PASSWORD || (process.env.NODE_ENV === "production" ? "" : "Qideng725!@#");
  const username = String(data.username || "").trim();
  const password = String(data.password || "");
  let principal = null;
  if (expectedUser && expectedPassword && equal(username, expectedUser) && equal(password, expectedPassword))
    principal = { id: null, role: "super" as const, label: "超级管理员" };
  else principal = loginAdminAccount(username, password);
  if (!principal) return Response.json({ error: "运营账号或密码错误" }, { status: 401 });
  const session = createAdminSession(request, principal);
  return Response.json({ ok: true, role: principal.role }, { headers: { "set-cookie": session.cookie } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "登录失败" }, { status: 401 });
  }
}
