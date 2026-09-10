import { requireAdmin } from "../../../../../lib/auth";
import { apiError } from "../../../../../lib/http";
import { createDesignSession, listDesignSessions } from "../../../../../lib/repository";
import { adminPrincipalFromRequest } from "../../../../../lib/auth";

export async function GET(request: Request) {
  try {
    const denied = requireAdmin(request);
    if (denied) return denied;
    return Response.json({ sessions: listDesignSessions() });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const denied = requireAdmin(request);
    if (denied) return denied;
    const principal = adminPrincipalFromRequest(request);
    const data = await request.json();
    const session = createDesignSession({
      solar_term_id: Number(data.solar_term_id),
      title: String(data.title || ""),
      created_by: principal?.label || "运营台",
    });
    return Response.json({ session });
  } catch (error) {
    return apiError(error);
  }
}
