import { apiError } from "../../../../lib/http";
import { miniPrincipalFromRequest } from "../../../../lib/mini-auth";
import {
  confirmDiscoveryInsights,
  DISCOVERY_VERSION,
  generateDiscoveryInsights,
  getDiscoveryBundle,
  saveDiscoveryAnswer,
} from "../../../../lib/discovery";
import { getObject } from "../../../../lib/storage";
import type { DiscoveryQuestionKey } from "../../../../lib/types";

function requireCreator(request: Request) {
  const principal = miniPrincipalFromRequest(request);
  if (!principal || principal.actorType !== "creator")
    return Response.json({ error: "请先登录" }, { status: 401, headers: { "cache-control": "no-store" } });
  return principal.actorId;
}

export async function GET(request: Request) {
  const creatorId = requireCreator(request);
  if (creatorId instanceof Response) return creatorId;
  try {
    return Response.json(getDiscoveryBundle(creatorId), {
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const creatorId = requireCreator(request);
    if (creatorId instanceof Response) return creatorId;
    const body = (await request.json()) as Record<string, unknown>;
    const action = String(body?.action || "");

    if (action === "saveAnswer") {
      const questionKey = String(body.questionKey || "");
      const allowedKeys = new Set(getDiscoveryBundle(creatorId).questions.map((item) => item.key));
      if (!allowedKeys.has(questionKey as DiscoveryQuestionKey)) throw new Error("问答题目无效");
      const mediaInput: unknown[] = Array.isArray(body.media) ? body.media.slice(0, 3) : [];
      const media: Array<{ key: string; visibility?: "private" | "public" }> = [];
      for (const item of mediaInput) {
        if (!item || typeof item !== "object") continue;
        const mediaRecord = item as Record<string, unknown>;
        const key = String(mediaRecord.key || "").trim();
        if (!key) continue;
        if (!key.startsWith(`web-creators/${creatorId}/`)) throw new Error("不能使用其他账号上传的图片");
        if (!(await getObject(key))) throw new Error("图片已失效，请重新上传");
        media.push({ key, visibility: mediaRecord.visibility === "public" ? "public" : "private" });
      }
      return Response.json(saveDiscoveryAnswer({
        creatorId,
        questionKey: questionKey as Parameters<typeof saveDiscoveryAnswer>[0]["questionKey"],
        version: String(body.version || DISCOVERY_VERSION),
        selections: body.selections,
        originalText: body.originalText,
        media,
      }), { headers: { "cache-control": "no-store" } });
    }

    if (action === "complete") {
      return Response.json(generateDiscoveryInsights(creatorId), {
        headers: { "cache-control": "no-store" },
      });
    }

    if (action === "regenerateInsights") {
      return Response.json(generateDiscoveryInsights(creatorId), {
        headers: { "cache-control": "no-store" },
      });
    }

    if (action === "confirmInsights") {
      return Response.json(confirmDiscoveryInsights({
        creatorId,
        traits: body.traits as Parameters<typeof confirmDiscoveryInsights>[0]["traits"],
        displayTitle: body.displayTitle as Parameters<typeof confirmDiscoveryInsights>[0]["displayTitle"],
        representativeLine: body.representativeLine as Parameters<typeof confirmDiscoveryInsights>[0]["representativeLine"],
        emotions: body.emotions as Parameters<typeof confirmDiscoveryInsights>[0]["emotions"],
      }), { headers: { "cache-control": "no-store" } });
    }

    return Response.json(
      { error: "当前页面版本与服务不一致，请刷新页面后重试", code: "UNSUPPORTED_ACTION" },
      { status: 400, headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}
