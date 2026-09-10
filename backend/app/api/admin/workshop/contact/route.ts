import { requireAdmin } from "../../../../../lib/auth";

export async function POST(request: Request) {
  const denied = requireAdmin(request);
  if (denied) return denied;
  return Response.json(
    { error: "企业微信客服联系入口已停用；消费者通过经授权的注册手机号直接联系新遇官" },
    { status: 410 },
  );
}

export const PATCH = POST;
