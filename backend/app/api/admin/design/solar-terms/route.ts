import { requireAdmin } from "../../../../../lib/auth";
import { apiError } from "../../../../../lib/http";
import { listDesignSolarTerms } from "../../../../../lib/repository";

export async function GET(request: Request) {
  try {
    const denied = requireAdmin(request);
    if (denied) return denied;
    return Response.json({ terms: listDesignSolarTerms() });
  } catch (error) {
    return apiError(error);
  }
}
