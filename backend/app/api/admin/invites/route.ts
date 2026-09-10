import { requireSuperAdmin } from "../../../../lib/auth";
import { apiError } from "../../../../lib/http";
import { createInviteCode, toggleInviteCode } from "../../../../lib/repository";

export async function POST(request: Request) {
  try {
    const denied = requireSuperAdmin(request);
    if (denied) return denied;
    const data = await request.json().catch(() => ({}));
    return Response.json({ inviteCodes: createInviteCode(data.code) });
  } catch (error) {
    return apiError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const denied = requireSuperAdmin(request);
    if (denied) return denied;
    const data = await request.json();
    return Response.json({ inviteCodes: toggleInviteCode(Number(data.id), Boolean(data.active)) });
  } catch (error) {
    return apiError(error);
  }
}
