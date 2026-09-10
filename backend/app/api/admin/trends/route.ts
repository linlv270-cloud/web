import { requireSuperAdmin } from "../../../../lib/auth";
import { apiError } from "../../../../lib/http";
import {
  deleteTrendTerm,
  getTrendSettings,
  listTrendTerms,
  refreshTrendTerms,
  saveTrendTerm,
  updateTrendSettings,
} from "../../../../lib/repository";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const denied = requireSuperAdmin(request);
  return denied || Response.json(
    { settings: getTrendSettings(), terms: listTrendTerms() },
    { headers: { "cache-control": "no-store" } },
  );
}

export async function POST(request: Request) {
  try {
    const denied = requireSuperAdmin(request); if (denied) return denied;
    const data = await request.json();
    if (data.action === "refresh") return Response.json(refreshTrendTerms(data.full === true));
    if (data.action === "settings")
      return Response.json({ settings: updateTrendSettings(data.settings || {}), terms: listTrendTerms() });
    return Response.json({ settings: getTrendSettings(), terms: saveTrendTerm(data) });
  } catch (error) {
    return apiError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const denied = requireSuperAdmin(request); if (denied) return denied;
    const data = await request.json();
    return Response.json({ settings: getTrendSettings(), terms: saveTrendTerm(data) });
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const denied = requireSuperAdmin(request); if (denied) return denied;
    const data = await request.json();
    return Response.json({ settings: getTrendSettings(), terms: deleteTrendTerm(Number(data.id)) });
  } catch (error) {
    return apiError(error);
  }
}
