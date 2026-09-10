import { requireMiniActor } from "../../../../../lib/mini-auth";

export function POST(request: Request) {
  const denied = requireMiniActor(request, "consumer");
  if (denied) return denied;
  return Response.json(
    { error: "问题反馈已改为“联系TDE”固定联系方式" },
    { status: 410, headers: { "cache-control": "no-store" } },
  );
}
