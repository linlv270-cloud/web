import { getMiniActivity, recordMiniActivityView } from "../../../../../lib/mini-program";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  const activity = getMiniActivity(id);
  if (!activity) return Response.json({ error: "活动不存在或已经下线" }, { status: 404 });
  recordMiniActivityView(id);
  return Response.json({ activity }, { headers: { "cache-control": "no-store" } });
}
