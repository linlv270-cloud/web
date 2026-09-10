import crypto from "node:crypto";
import sharp from "sharp";
import { requireSuperAdmin } from "../../../../../lib/auth";
import { apiError } from "../../../../../lib/http";
import { putObject, assetUrl } from "../../../../../lib/storage";

export const runtime = "nodejs";
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

export async function POST(request: Request) {
  try {
    const denied = requireSuperAdmin(request);
    if (denied) return denied;

    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw new Error("请选择图片");
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) throw new Error("仅支持 JPG、PNG 或 WebP 图片");
    if (file.size > MAX_UPLOAD_BYTES) throw new Error("图片不能超过5MB");

    const source = Buffer.from(await file.arrayBuffer());
    const body = await sharp(source, { limitInputPixels: 60_000_000 })
      .rotate()
      .resize(400, 400, { fit: "contain", background: { r: 255, g: 255, b: 255, alpha: 1 } })
      .png({ quality: 90 })
      .toBuffer();

    const key = `viz-template/qr-${crypto.randomUUID()}.png`;
    await putObject(key, body);

    return Response.json({ url: assetUrl(key), key });
  } catch (error) {
    return apiError(error);
  }
}
