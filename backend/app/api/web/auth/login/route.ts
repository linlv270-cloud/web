import { apiError } from "../../../../../lib/http";
import { createMiniSession } from "../../../../../lib/mini-auth";
import { getCreator, loginCreator } from "../../../../../lib/repository";
import { normalizePhone, rateLimit, validPhone } from "../../../../../lib/security";

export async function POST(request: Request) {
  try {
    const limited = rateLimit(request, "web-login", 10, 60 * 60000, request.headers.get("x-forwarded-for") || "");
    if (limited) return limited;

    const data = await request.json();
    const phone = normalizePhone(String(data.phone || ""));
    const password = String(data.password || "");

    if (!validPhone(phone)) throw new Error("手机号格式不正确");
    if (!password) throw new Error("请输入密码");

    const creatorId = loginCreator(phone, password);
    if (!creatorId) throw new Error("手机号或密码不正确");

    const session = createMiniSession("creator", creatorId);
    const creator = getCreator(creatorId);

    return Response.json(
      {
        session,
        creator: {
          id: creator?.id,
          phone: creator?.phone,
          brandName: creator?.brandName,
          slogan: creator?.slogan,
          intro: creator?.intro,
          province: creator?.province,
          city: creator?.city,
          district: creator?.district,
          logoImageUrl: creator?.logoUrl || "",
        },
      },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}
