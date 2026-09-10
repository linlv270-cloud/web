import { apiError } from "../../../../../lib/http";
import { createMiniSession } from "../../../../../lib/mini-auth";
import { run, transaction } from "../../../../../lib/database";
import { getCreator, registerCreator, updateProfile } from "../../../../../lib/repository";
import { normalizePhone, rateLimit, validPhone } from "../../../../../lib/security";
import { isValidLocation } from "../../../../../lib/locations";
import { markCreatorSection, recordLegalConsent } from "../../../../../lib/legal";

export async function POST(request: Request) {
  try {
    const limited = rateLimit(request, "web-register-account", 5, 60 * 60000, request.headers.get("x-forwarded-for") || "");
    if (limited) return limited;
    const data = await request.json();
    const phone = normalizePhone(String(data.phone || ""));
    const confirmPhone = normalizePhone(String(data.confirmPhone || ""));
    const password = String(data.password || "");
    const confirmPassword = String(data.confirmPassword || "");
    const inviteCode = String(data.inviteCode || "").trim().toUpperCase();
    const province = String(data.province || "").trim();
    const city = String(data.city || "").trim();
    const district = String(data.district || "").trim();
    if (!validPhone(phone)) throw new Error("手机号格式不正确");
    if (phone !== confirmPhone) throw new Error("两次输入的手机号不一致");
    if (password.length < 8 || password.length > 72) throw new Error("密码需要为 8 至 72 个字符");
    if (password !== confirmPassword) throw new Error("两次输入的密码不一致");
    if (!province || !city || !district || !isValidLocation(province, city, district))
      throw new Error("请选择有效的省、市、区");
    if (data.agreed !== true) throw new Error("请先阅读并同意用户协议和隐私政策");

    const creatorId = transaction(() => {
      const id = registerCreator(phone, password, inviteCode, true, province, city, "", ["writer", "opportunity"], [], false, true);
      const profile: Record<string, unknown> = {};
      for (const key of ["userName", "brandName", "slogan", "intro", "province", "city", "district"]) {
        if (data[key] !== undefined) profile[key] = data[key];
      }
      if (Object.keys(profile).length) updateProfile(id, profile);
      run(
        `INSERT INTO consumer_accounts(openid, phone, province, city, district)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(openid) DO UPDATE SET phone = excluded.phone, province = excluded.province,
           city = excluded.city, district = excluded.district, updated_at = CURRENT_TIMESTAMP`,
        `web_${phone}`,
        phone,
        province,
        city,
        district,
      );
      recordLegalConsent(id, request);
      markCreatorSection(id, "account");
      return id;
    });
    const session = createMiniSession("creator", creatorId);
    const creator = getCreator(creatorId);
    return Response.json({
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
    }, { status: 201, headers: { "cache-control": "no-store" } });
  } catch (error) {
    return apiError(error);
  }
}
