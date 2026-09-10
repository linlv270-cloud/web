import { requireSuperAdmin } from "../../../../../../lib/auth";

export function POST(request: Request) {
  const denied = requireSuperAdmin(request);
  if (denied) return denied;
  return Response.json({ error: "在线咨询已关闭，历史记录仅供查看" }, { status: 410 });
}
