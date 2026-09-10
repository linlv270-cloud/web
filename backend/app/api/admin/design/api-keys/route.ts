import { requireAdmin, requireSuperAdmin } from "../../../../../lib/auth";
import { apiError } from "../../../../../lib/http";
import { createDesignApiKey, listDesignApiKeys } from "../../../../../lib/repository";
import { adminPrincipalFromRequest } from "../../../../../lib/auth";

export async function GET(request: Request) {
  try {
    const denied = requireAdmin(request);
    if (denied) return denied;
    const keys = listDesignApiKeys().map(({ api_key_encrypted: _omit, ...item }) => item);
    return Response.json({ keys });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const denied = requireSuperAdmin(request);
    if (denied) return denied;
    const principal = adminPrincipalFromRequest(request);
    const data = await request.json();
    const key = createDesignApiKey({
      operator_name: String(data.operator_name || ""),
      base_url: String(data.base_url || ""),
      api_key: String(data.api_key || ""),
      model: String(data.model || ""),
      note: String(data.note || ""),
      created_by: principal?.label || "超级管理员",
    });
    return Response.json({ key });
  } catch (error) {
    return apiError(error);
  }
}
