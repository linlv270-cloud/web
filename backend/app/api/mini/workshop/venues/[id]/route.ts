import { getWorkshopVenue } from "../../../../../../lib/mini-program";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  const detail = getWorkshopVenue(id);
  if (!detail) return Response.json({ error: "体验点不存在或已经下线" }, { status: 404 });
  return Response.json(detail, { headers: { "cache-control": "public, max-age=60, stale-while-revalidate=300" } });
}
