import { creatorIdFromRequest } from "../../../../lib/auth";
import { startCopyWorker } from "../../../../lib/copy-worker";
import { getCopyGeneration } from "../../../../lib/repository";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const creatorId = creatorIdFromRequest(request);
  if (!creatorId) return Response.json({ error: "请先登录" }, { status: 401 });
  startCopyWorker();
  const id = Number(new URL(request.url).searchParams.get("id"));
  const generation = getCopyGeneration(id);
  if (!generation || generation.creatorId !== creatorId)
    return Response.json({ error: "生成任务不存在" }, { status: 404 });
  return Response.json(
    {
      task: {
        id: generation.id,
        mode: generation.mode,
        status: generation.status,
        stage: generation.stage,
        error: generation.error,
        updatedAt: generation.updatedAt,
      },
    },
    { headers: { "cache-control": "no-store, max-age=0" } },
  );
}
