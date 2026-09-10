import crypto from "node:crypto";
import sharp from "sharp";
import { requireSuperAdmin } from "../../../../lib/auth";
import { apiError } from "../../../../lib/http";
import { assetUrl, deleteObject, putObject } from "../../../../lib/storage";

export const runtime = "nodejs";

function assetKey(url: string) {
  if (!url.startsWith("/api/assets/platform/showcase/")) throw new Error("展示图片地址无效");
  return url.slice("/api/assets/".length).split("/").map(decodeURIComponent).join("/");
}

export async function POST(request: Request) {
  try {
    const denied = requireSuperAdmin(request);
    if (denied) return denied;
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw new Error("请选择需要上传的展示图片");
    if (!['image/jpeg', 'image/webp'].includes(file.type)) throw new Error("图片格式不符合要求：仅支持 JPG 或 WebP");
    if (file.size > 1024 * 1024) throw new Error("图片文件过大：单张不能超过 1MB");
    const source = Buffer.from(await file.arrayBuffer());
    const metadata = await sharp(source, { limitInputPixels: 25000000 }).metadata();
    if (!metadata.width || !metadata.height) throw new Error("无法读取图片尺寸，请更换有效图片");
    if (metadata.width < 750 || metadata.height < 1000) throw new Error(`图片分辨率不足：当前 ${metadata.width}×${metadata.height}，最低需要 750×1000`);
    const ratio = metadata.width / metadata.height;
    if (Math.abs(ratio - 0.75) > 0.008) throw new Error(`图片比例不符合要求：当前约 ${ratio.toFixed(2)}，需要 3:4`);
    const body = await sharp(source, { limitInputPixels: 25000000 })
      .rotate()
      .toColorspace("srgb")
      .resize({ width: 1200, height: 1600, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 84 })
      .toBuffer();
    const key = `platform/showcase/${crypto.randomUUID()}.webp`;
    await putObject(key, body);
    return Response.json({ url: assetUrl(key) });
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const denied = requireSuperAdmin(request);
    if (denied) return denied;
    const data = await request.json();
    await deleteObject(assetKey(String(data.url || "")));
    return Response.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}
