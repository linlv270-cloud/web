import crypto from "node:crypto";
import sharp from "sharp";
import { creatorIdFromRequest } from "../../../lib/auth";
import { apiError } from "../../../lib/http";
import { attachUpload, getCreator } from "../../../lib/repository";
import { assetUrl, deleteObject, putObject } from "../../../lib/storage";

export const runtime = "nodejs";
const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
const MAX_INPUT_PIXELS = 60_000_000;

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const file = form.get("file");
    const kind = String(form.get("kind") || "work");
    const creatorId = creatorIdFromRequest(request);
    if (!(file instanceof File)) throw new Error("请选择图片");
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type))
      throw new Error("仅支持 JPG、PNG 或 WebP 图片");
    if (file.size > MAX_UPLOAD_BYTES) throw new Error("图片不能超过 20MB");
    if (!creatorId) return Response.json({ error: "请先登录" }, { status: 401 });
    const previousWorkUrl = kind === "work" ? getCreator(creatorId)?.workUrls[0] || "" : "";
    const source = Buffer.from(await file.arrayBuffer());
    const metadata = await sharp(source, { limitInputPixels: MAX_INPUT_PIXELS }).metadata();
    if (!metadata.width || !metadata.height) throw new Error("无法识别图片");
    const png = file.type === "image/png" && kind === "logo";
    const pipeline = sharp(source, { limitInputPixels: MAX_INPUT_PIXELS }).rotate();
    const body = kind === "work"
      ? await pipeline.resize(1200, 1200, { fit: "cover" }).webp({ quality: 82, effort: 5 }).toBuffer()
      : png
        ? await pipeline.resize({ width: 1200, height: 1200, fit: "inside", withoutEnlargement: true }).png({ compressionLevel: 9 }).toBuffer()
        : await pipeline.resize({ width: 1200, height: 1200, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 84, mozjpeg: true }).toBuffer();
    const owner = `creators/${creatorId}`;
    const extension = kind === "work" ? "webp" : png ? "png" : "jpg";
    const key = `${owner}/${kind}-${crypto.randomUUID()}.${extension}`;
    await putObject(key, body);
    const creator = attachUpload(creatorId, kind === "logo" ? "logo" : "work", key);
    if (previousWorkUrl) {
      const previousKey = previousWorkUrl
        .replace(/^\/api\/assets\//, "")
        .split("/")
        .map(decodeURIComponent)
        .join("/");
      if (previousKey && previousKey !== key)
        await deleteObject(previousKey).catch(() => undefined);
    }
    return Response.json({ creator, url: assetUrl(key) });
  } catch (error) {
    return apiError(error);
  }
}
