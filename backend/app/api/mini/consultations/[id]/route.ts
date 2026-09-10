import { miniPrincipalFromRequest, requireMiniActor } from "../../../../../lib/mini-auth";
import { getConsultation } from "../../../../../lib/mini-program";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = requireMiniActor(request, "consumer");
  if (denied) return denied;
  const thread = getConsultation(miniPrincipalFromRequest(request)!, Number((await params).id));
  return thread
    ? Response.json({ thread }, { headers: { "cache-control": "no-store" } })
    : Response.json({ error: "咨询不存在" }, { status: 404 });
}

export function POST(request: Request) {
  const denied = requireMiniActor(request, "consumer");
  if (denied) return denied;
  return Response.json({ error: "在线咨询已关闭" }, { status: 410 });
}

export function PATCH(request: Request) {
  const denied = requireMiniActor(request, "consumer");
  if (denied) return denied;
  return Response.json({ error: "在线咨询已关闭" }, { status: 410 });
}
