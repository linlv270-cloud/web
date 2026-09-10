import { creatorIdFromRequest } from "../../../../lib/auth";
import { apiError } from "../../../../lib/http";
import { changeCreatorPassword } from "../../../../lib/repository";
import { rateLimit } from "../../../../lib/security";

export async function PATCH(request: Request) {
  try {
    const creatorId = creatorIdFromRequest(request);
    if (!creatorId) return Response.json({ error: "请先登录" }, { status: 401 });
    const limited = rateLimit(request, "change-password", 8, 15 * 60000, String(creatorId));
    if (limited) return limited;
    const data = await request.json();
    const currentPassword = String(data.currentPassword || "");
    const nextPassword = String(data.nextPassword || "");
    if (nextPassword !== String(data.confirmPassword || ""))
      throw new Error("两次输入的新密码不一致");
    changeCreatorPassword(creatorId, currentPassword, nextPassword);
    return Response.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}
