import { apiError } from "../../../../../lib/http";
import { loginMiniConsumer } from "../../../../../lib/mini-auth";
import { rateLimit } from "../../../../../lib/security";

export async function POST(request: Request) {
  try {
    const limited = rateLimit(request, "mini-wechat-login", 20, 15 * 60000);
    if (limited) return limited;
    const data = await request.json();
    return Response.json(await loginMiniConsumer(String(data.code || "")), {
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    return apiError(error);
  }
}

