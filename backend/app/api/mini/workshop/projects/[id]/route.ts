import { getWorkshopProjectDetail, recordWorkshopProjectView } from "../../../../../../lib/mini-program";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  const detail = getWorkshopProjectDetail(id);
  if (!detail) return Response.json({ error: "体验不存在或已经下线" }, { status: 404 });
  recordWorkshopProjectView(id);
  return Response.json(detail, { headers: { "cache-control": "no-store" } });
}
