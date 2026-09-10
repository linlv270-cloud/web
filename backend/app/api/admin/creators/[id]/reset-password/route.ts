import { requireAdmin } from "../../../../../../lib/auth";
import { one, run } from "../../../../../../lib/database";
import { apiError } from "../../../../../../lib/http";
import { hashSecret } from "../../../../../../lib/security";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const denied = requireAdmin(request);
    if (denied) return denied;
    const { id } = await params;
    const creatorId = Number(id);
    if (!creatorId) throw new Error("用户ID无效");
    const data = await request.json();
    const mode = String(data.mode || "default"); // default | manual
    let newPassword = "12345678";
    if (mode === "manual") {
      newPassword = String(data.password || "");
      if (newPassword.length < 8 || newPassword.length > 72) throw new Error("密码需要8-72位字符");
    }
    const exists = one<{ id: number }>("SELECT id FROM creators WHERE id = ?", creatorId);
    if (!exists) throw new Error("用户不存在");
    const credentials = hashSecret(newPassword);
    run(
      "UPDATE creators SET password_hash = ?, password_salt = ?, password_login_enabled = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
      credentials.hash,
      credentials.salt,
      creatorId,
    );
    return Response.json({ success: true, newPassword: mode === "default" ? "12345678" : "(已手动设置)" });
  } catch (error) {
    return apiError(error);
  }
}
