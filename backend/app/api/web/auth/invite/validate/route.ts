import { apiError } from "../../../../../../lib/http";
import { validateInviteCode } from "../../../../../../lib/repository";
import { rateLimit } from "../../../../../../lib/security";

export async function POST(request: Request) {
  try {
    const limited = rateLimit(
      request,
      "web-invite-validate",
      20,
      15 * 60000,
      request.headers.get("x-forwarded-for") || "",
    );
    if (limited) return limited;
    const data = await request.json().catch(() => ({}));
    const inviteCode = String(data.inviteCode || "").trim().toUpperCase();
    return Response.json(
      { valid: validateInviteCode(inviteCode) },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}
