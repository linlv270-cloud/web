import { adminPrincipalFromRequest, requireSuperAdmin } from "../../../../lib/auth";
import { apiError } from "../../../../lib/http";
import { createAdminAccount, listAdminAccounts, updateAdminAccount } from "../../../../lib/repository";

export async function GET(request: Request) {
  const denied = requireSuperAdmin(request);
  return denied || Response.json({ accounts: listAdminAccounts() });
}

export async function POST(request: Request) {
  try {
    const denied = requireSuperAdmin(request);
    if (denied) return denied;
    const principal = adminPrincipalFromRequest(request)!;
    const data = await request.json();
    return Response.json({ accounts: createAdminAccount(data.name, data.phone, principal.label) }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const denied = requireSuperAdmin(request);
    if (denied) return denied;
    const principal = adminPrincipalFromRequest(request)!;
    const data = await request.json();
    return Response.json({ accounts: updateAdminAccount(Number(data.id), {
      status: data.status,
      inviteCode: data.inviteCode,
      name: data.name,
      phone: data.phone,
      password: data.password,
    }, principal.label) });
  } catch (error) {
    return apiError(error);
  }
}
