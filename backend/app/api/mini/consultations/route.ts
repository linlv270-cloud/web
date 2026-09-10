import { miniPrincipalFromRequest, requireMiniActor } from "../../../../lib/mini-auth";
import { listConsultations } from "../../../../lib/mini-program";

export async function GET(request: Request) {
  const denied = requireMiniActor(request, "consumer");
  if (denied) return denied;
  return Response.json(
    { threads: listConsultations(miniPrincipalFromRequest(request)!) },
    { headers: { "cache-control": "no-store" } },
  );
}

export function POST(request: Request) {
  const denied = requireMiniActor(request, "consumer");
  if (denied) return denied;
  return Response.json(
    { error: "在线咨询已关闭，请在“联系TDE”查看官方联系方式" },
    { status: 410, headers: { "cache-control": "no-store" } },
  );
}
