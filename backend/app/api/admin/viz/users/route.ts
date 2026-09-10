import { adminPrincipalFromRequest, requireAdmin } from "../../../../../lib/auth";
import { apiError } from "../../../../../lib/http";
import {
  createVisualizationUser,
  extendVisualizationUser,
  getVisualizationUser,
  listVisualizationAccessEvents,
  listVisualizationUsers,
  setVisualizationUserExpiry,
  setVisualizationUserPassword,
  updateVisualizationUser,
} from "../../../../../lib/visualization";

export async function GET(request: Request) {
  try {
    const denied = requireAdmin(request);
    if (denied) return denied;
    const users = listVisualizationUsers();
    return Response.json({ users });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const denied = requireAdmin(request);
    if (denied) return denied;
    const principal = adminPrincipalFromRequest(request)!;
    const data = await request.json();

    if (data.action === "create") {
      const phone = String(data.phone || "").trim();
      const password = String(data.password || "");
      const name = String(data.name || "").trim();
      if (!phone || !password || !name) throw new Error("请填写姓名、手机号和密码");
      if (password.length < 6) throw new Error("密码至少6位");
      if (!/^1\d{10}$/.test(phone)) throw new Error("请输入正确的手机号");

      const expiresAt = data.expiresAt ? Number(data.expiresAt) : null;
      const accessScope = (data.accessScope as "all" | "province" | "city") || "all";
      const province = String(data.province || "");
      const city = String(data.city || "");

      // 验证权限模式与省市的关系
      if (accessScope === "province" && !province) throw new Error("指定省份模式必须选择省份");
      if (accessScope === "city" && (!province || !city)) throw new Error("指定城市模式必须选择省份和城市");

      const user = createVisualizationUser({
        name,
        phone,
        password,
        accessScope,
        province: accessScope === "all" ? "" : province,
        city: accessScope !== "city" ? "" : city,
        unit: String(data.unit || ""),
        position: String(data.position || ""),
        note: String(data.note || ""),
        expiresAt,
        createdByAdminId: principal.id,
      });
      return Response.json({ user }, { status: 201 });
    }

    if (data.action === "update") {
      const id = Number(data.id);
      if (!id) throw new Error("用户ID不能为空");
      const accessScope = data.accessScope !== undefined ? (data.accessScope as "all" | "province" | "city") : undefined;
      const province = data.province !== undefined ? String(data.province) : undefined;
      const city = data.city !== undefined ? String(data.city) : undefined;

      // 验证权限模式与省市的关系
      if (accessScope === "province" && province === "") throw new Error("指定省份模式必须选择省份");
      if (accessScope === "city" && (!province || !city)) throw new Error("指定城市模式必须选择省份和城市");

      const user = updateVisualizationUser(id, {
        name: data.name !== undefined ? String(data.name) : undefined,
        accessScope,
        province: accessScope === "all" ? "" : province,
        city: accessScope !== "city" ? "" : city,
        unit: data.unit !== undefined ? String(data.unit) : undefined,
        position: data.position !== undefined ? String(data.position) : undefined,
        note: data.note !== undefined ? String(data.note) : undefined,
        status: data.status !== undefined ? (data.status as "active" | "suspended") : undefined,
      });
      return Response.json({ user });
    }

    if (data.action === "setPassword") {
      const id = Number(data.id);
      const newPassword = String(data.newPassword || "");
      if (!id) throw new Error("用户ID不能为空");
      if (!newPassword || newPassword.length < 6) throw new Error("新密码至少6位");
      setVisualizationUserPassword(id, newPassword);
      return Response.json({ ok: true });
    }

    if (data.action === "extend") {
      const id = Number(data.id);
      const days = Number(data.days || 0);
      if (!id) throw new Error("用户ID不能为空");
      if (days <= 0) throw new Error("续时天数必须大于0");
      const user = extendVisualizationUser(id, days, principal.id, String(data.note || ""));
      return Response.json({ user });
    }

    if (data.action === "setExpiry") {
      const id = Number(data.id);
      const expiresAt = data.expiresAt ? Number(data.expiresAt) : null;
      if (!id) throw new Error("用户ID不能为空");
      const user = setVisualizationUserExpiry(id, expiresAt, principal.id, String(data.note || ""));
      return Response.json({ user });
    }

    if (data.action === "events") {
      const id = Number(data.id);
      if (!id) throw new Error("用户ID不能为空");
      const events = listVisualizationAccessEvents(id);
      return Response.json({ events });
    }

    if (data.action === "detail") {
      const id = Number(data.id);
      if (!id) throw new Error("用户ID不能为空");
      const user = getVisualizationUser(id);
      if (!user) throw new Error("用户不存在");
      const events = listVisualizationAccessEvents(id);
      return Response.json({ user, events });
    }

    return Response.json({ error: "未知操作" }, { status: 400 });
  } catch (error) {
    return apiError(error);
  }
}
