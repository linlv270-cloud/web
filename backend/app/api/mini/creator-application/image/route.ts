import crypto from "node:crypto";
import sharp from "sharp";
import { apiError } from "../../../../../lib/http";
import { getConsumerCreatorApplication, miniPrincipalFromRequest, requireMiniActor } from "../../../../../lib/mini-auth";
import { assetUrl, putObject } from "../../../../../lib/storage";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const denied = requireMiniActor(request, "consumer");
    if (denied) return denied;
    const consumerId = miniPrincipalFromRequest(request)!.actorId;
    if (getConsumerCreatorApplication(consumerId)?.status === "active")
      throw new Error("申请已通过，请在“我的”中更换申请代表图");
    const form = await request.formData();
    const target = form.get("target") === "logo" ? "logo" : "representative";
    const file = form.get("file");
    if (!(file instanceof File)) throw new Error("请选择图片");
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type))
      throw new Error("仅支持 JPG、PNG 或 WebP 图片");
    if (file.size > 20 * 1024 * 1024) throw new Error("图片不能超过20MB");
    const body = await sharp(Buffer.from(await file.arrayBuffer()), { limitInputPixels: 60_000_000 })
      .rotate()
      .resize(target === "logo" ? 800 : 1440, target === "logo" ? 800 : 1800, { fit: "cover" })
      .webp({ quality: 84, effort: 5 })
      .toBuffer();
    const key = `creator-applications/${consumerId}/${target}-${crypto.randomUUID()}.webp`;
    await putObject(key, body);
    return Response.json({ consumerId, imageKey: key, imageUrl: assetUrl(key), target });
  } catch (error) {
    return apiError(error);
  }
}
