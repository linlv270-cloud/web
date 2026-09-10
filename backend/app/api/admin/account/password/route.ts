import { adminPrincipalFromRequest } from "../../../../../lib/auth";
import { apiError } from "../../../../../lib/http";
import { changeMyAdminPassword } from "../../../../../lib/repository";

export async function POST(request: Request) {
  try {
    const principal = adminPrincipalFromRequest(request);
    if (!principal || principal.role !== "subadmin" || !principal.id)
      return Response.json({ error: "仅子管理员可在此修改自己的登录密码" }, { status: 403 });
    const data = await request.json();
    changeMyAdminPassword(principal.id, data.password);
    return Response.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}
