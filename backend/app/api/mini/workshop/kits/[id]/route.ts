import { getWorkshopKit } from "../../../../../../lib/mini-program";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  const { searchParams } = new URL(request.url);
  const detail = getWorkshopKit(id, Number(searchParams.get("venueId") || 0));
  if (!detail) return Response.json({ error: "材料包不存在或已经下线" }, { status: 404 });
  return Response.json(detail, { headers: { "cache-control": "public, max-age=60, stale-while-revalidate=300" } });
}
