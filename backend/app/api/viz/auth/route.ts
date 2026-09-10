import { apiError } from "../../../../lib/http";
import {
  destroyVisualizationSession,
  getVisualizationSession,
  setVisualizationUserPassword,
  verifyVisualizationLogin,
} from "../../../../lib/visualization";

const COOKIE_NAME = "viz_session";

function getTokenFromRequest(request: Request): string {
  const cookie = request.headers.get("cookie") || "";
  const match = cookie.match(new RegExp(`${COOKIE_NAME}=([^;]+)`));
  return match ? match[1] : "";
}

export async function POST(request: Request) {
  try {
    const data = await request.json();

    if (data.action === "login") {
      const phone = String(data.phone || "").trim();
      const password = String(data.password || "");
      if (!phone || !password) throw new Error("请输入手机号和密码");
      const { user, token } = verifyVisualizationLogin(phone, password);
      return new Response(JSON.stringify({ user }), {
        status: 200,
        headers: {
          "content-type": "application/json",
          "set-cookie": `${COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${7 * 24 * 60 * 60}`,
        },
      });
    }

    if (data.action === "logout") {
      const token = getTokenFromRequest(request);
      if (token) destroyVisualizationSession(token);
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: {
          "content-type": "application/json",
          "set-cookie": `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`,
        },
      });
    }

    if (data.action === "change-password") {
      const token = getTokenFromRequest(request);
      const user = token ? getVisualizationSession(token) : null;
      if (!user) return Response.json({ error: "请先登录" }, { status: 401 });
      const oldPassword = String(data.oldPassword || "");
      const newPassword = String(data.newPassword || "");
      if (!oldPassword || !newPassword) throw new Error("请输入原密码和新密码");
      if (newPassword.length < 6) throw new Error("新密码至少6位");
      // 验证原密码
      try {
        verifyVisualizationLogin(user.phone, oldPassword);
      } catch {
        throw new Error("原密码错误");
      }
      setVisualizationUserPassword(user.id, newPassword);
      return Response.json({ ok: true });
    }

    return Response.json({ error: "未知操作" }, { status: 400 });
  } catch (error) {
    return apiError(error);
  }
}

export async function GET(request: Request) {
  try {
    const token = getTokenFromRequest(request);
    const user = token ? getVisualizationSession(token) : null;
    if (!user) return Response.json({ error: "未登录" }, { status: 401 });
    return Response.json({ user });
  } catch (error) {
    return apiError(error);
  }
}
