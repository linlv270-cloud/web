import crypto from "node:crypto";
import sharp from "sharp";
import { apiError } from "../../../../lib/http";
import { miniPrincipalFromRequest } from "../../../../lib/mini-auth";
import { assetUrl, putObject } from "../../../../lib/storage";

export const runtime = "nodejs";
const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

export async function POST(request: Request) {
  try {
    const principal = miniPrincipalFromRequest(request);
    if (!principal || principal.actorType !== "creator")
      return Response.json({ error: "请先登录" }, { status: 401, headers: { "cache-control": "no-store" } });
    const form = await request.formData();
    const file = form.get("file");
    const keyPrefix = `web-creators/${principal.actorId}`;
    if (!(file instanceof File)) throw new Error("请选择图片");
    if (file.type && !file.type.startsWith("image/") && file.type !== "application/octet-stream")
      throw new Error("仅支持图片文件");
    if (!file.size) throw new Error("图片内容为空");
    if (file.size > MAX_UPLOAD_BYTES) throw new Error("图片不能超过 20MB");

    const body = Buffer.from(await file.arrayBuffer());
    let normalized: Buffer;
    try {
      normalized = await sharp(body, { failOn: "error", limitInputPixels: 80_000_000 })
        .rotate()
        .resize({ width: 2400, height: 2400, fit: "inside", withoutEnlargement: true })
        .jpeg({ quality: 88, mozjpeg: true })
        .toBuffer();
    } catch {
      throw new Error("图片格式无法识别，请换用 JPG、PNG 或 WebP 图片");
    }
    const key = `${keyPrefix}/${crypto.randomUUID()}.jpg`;
    await putObject(key, normalized);

    return Response.json({ key, url: assetUrl(key) });
  } catch (error) {
    return apiError(error);
  }
}
