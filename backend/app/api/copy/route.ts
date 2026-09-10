import { creatorIdFromRequest } from "../../../lib/auth";
import { isUpgradeConfigured } from "../../../lib/copywriter";
import { startCopyWorker } from "../../../lib/copy-worker";
import { apiError } from "../../../lib/http";
import { getRedbookSettings } from "../../../lib/redbook-settings";
import {
  beginCopyGeneration,
  getCopyGeneration,
  getCreator,
  getInbox,
  listCreatorCopyGenerations,
} from "../../../lib/repository";
import { rateLimit } from "../../../lib/security";
import type { CopyMode } from "../../../lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const creatorId = creatorIdFromRequest(request);
  if (!creatorId) return Response.json({ error: "请先登录" }, { status: 401 });
  startCopyWorker();
  return Response.json({
    creator: getCreator(creatorId),
    messages: getInbox(creatorId),
    generations: listCreatorCopyGenerations(creatorId, 30),
  }, { headers: { "cache-control": "no-store" } });
}

export async function POST(request: Request) {
  try {
    const creatorId = creatorIdFromRequest(request);
    if (!creatorId) return Response.json({ error: "请先登录" }, { status: 401 });
    const limited = rateLimit(request, "copy-generation", 6, 60000, String(creatorId));
    if (limited) return limited;
    const data = await request.json();
    const mode = String(data.mode || "") as CopyMode;
    if (mode !== "free" && mode !== "upgrade") throw new Error("请选择生成方式");
    const creator = getCreator(creatorId)!;
    const settings = getRedbookSettings();
    if (!settings.enabled) throw new Error("文案生成功能暂未开放");
    const remaining = mode === "free"
      ? creator.copyQuota.freeRemaining
      : creator.copyQuota.upgradeRemaining;
    if (remaining < 1) throw new Error("请联系客服申请使用额度。");
    if (mode === "upgrade" && !isUpgradeConfigured())
      throw new Error("升级生成暂未开放，请联系客服");
    const provider = mode === "free" ? "internal" : "doubao";
    const model = mode === "free" ? "redbook-rules" : process.env.DOUBAO_MODEL || process.env.ARK_MODEL_ENDPOINT || "not-configured";
    const snapshot = {
      brandName: creator.brandName,
      userName: creator.userName,
      intro: creator.intro,
      boothDescription: creator.boothDescription,
      province: creator.province,
      city: creator.city,
      tags: creator.tags.map((tag) => ({ category: tag.category, label: tag.label })),
      noBookings: creator.noBookings,
      workUrl: creator.workUrls[0] || "",
      profileUpdatedAt: creator.updatedAt,
    };
    const taskId = beginCopyGeneration(creatorId, mode, snapshot, settings.version, provider, model);
    startCopyWorker();
    return Response.json({
      generation: getCopyGeneration(taskId),
      creator: getCreator(creatorId),
      messages: getInbox(creatorId),
      generations: listCreatorCopyGenerations(creatorId, 30),
    }, { status: 202, headers: { "cache-control": "no-store" } });
  } catch (error) {
    return apiError(error, "文章生成失败");
  }
}
