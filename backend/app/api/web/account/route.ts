import { one, run, transaction } from "../../../../lib/database";
import { apiError } from "../../../../lib/http";
import { miniPrincipalFromRequest } from "../../../../lib/mini-auth";
import { hashSecret, verifySecret } from "../../../../lib/security";

export async function POST(request: Request) {
  try {
    const principal = miniPrincipalFromRequest(request);
    if (!principal || principal.actorType !== "creator") {
      return Response.json({ error: "请先登录" }, { status: 401, headers: { "cache-control": "no-store" } });
    }
    const creatorId = principal.actorId;
    const data = await request.json();
    const action = String(data.action || "");

    if (action === "changePassword") {
      const oldPassword = String(data.oldPassword || "");
      const newPassword = String(data.newPassword || "");
      if (!oldPassword) throw new Error("请输入当前密码");
      if (newPassword.length < 8 || newPassword.length > 72) throw new Error("新密码需要8-72位字符");

      const row = one<{ password_hash: string; password_salt: string }>(
        "SELECT password_hash, password_salt FROM creators WHERE id = ?",
        creatorId,
      );
      if (!row || !verifySecret(oldPassword, row.password_salt, row.password_hash)) {
        throw new Error("当前密码不正确");
      }
      const credentials = hashSecret(newPassword);
      run(
        "UPDATE creators SET password_hash = ?, password_salt = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        credentials.hash,
        credentials.salt,
        creatorId,
      );
      return Response.json({ success: true });
    }

    if (action === "deleteAccount") {
      const password = String(data.password || "");
      if (!password) throw new Error("请输入当前密码");
      if (data.confirmPermanentDeletion !== true || String(data.confirmationText || "") !== "永久注销")
        throw new Error("请先确认永久注销账号");

      const creator = one<{ phone: string; password_hash: string; password_salt: string }>(
        "SELECT phone, password_hash, password_salt FROM creators WHERE id = ?",
        creatorId,
      );
      if (!creator || !verifySecret(password, creator.password_salt, creator.password_hash))
        throw new Error("当前密码不正确");

      const webConsumer = one<{ id: number; openid: string }>(
        "SELECT id, openid FROM consumer_accounts WHERE openid = ?",
        `web_${creator.phone}`,
      );

      transaction(() => {
        run("DELETE FROM creator_sessions WHERE creator_id = ?", creatorId);
        run("DELETE FROM mini_sessions WHERE actor_type = 'creator' AND actor_id = ?", creatorId);
        run("DELETE FROM creators WHERE id = ?", creatorId);
        if (webConsumer) run("DELETE FROM consumer_accounts WHERE id = ? AND openid = ?", webConsumer.id, webConsumer.openid);
      });

      return Response.json({ success: true }, { headers: { "cache-control": "no-store" } });
    }

    return Response.json({ error: "未知操作" }, { status: 400 });
  } catch (error) {
    return apiError(error);
  }
}
