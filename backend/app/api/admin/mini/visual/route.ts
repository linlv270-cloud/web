import crypto from "node:crypto";
import sharp from "sharp";
import { requireSuperAdmin } from "../../../../../lib/auth";
import { apiError } from "../../../../../lib/http";
import { setMiniProgramVisual } from "../../../../../lib/mini-program";
import { putObject } from "../../../../../lib/storage";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const denied = requireSuperAdmin(request);
    if (denied) return denied;
    const form = await request.formData();
    const kind = String(form.get("kind") || "") as "hero" | "loading" | "reveal";
    const file = form.get("file");
    if (!['hero', 'loading', 'reveal'].includes(kind)) throw new Error("图片位置不正确");
    if (!(file instanceof File)) throw new Error("请选择图片");
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error("仅支持 JPG、PNG 或 WebP 图片");
    if (file.size > 20 * 1024 * 1024) throw new Error("图片不能超过20MB");
    const body = await sharp(Buffer.from(await file.arrayBuffer()), { limitInputPixels: 60_000_000 })
      .rotate().resize(1440, 1920, { fit: "cover" }).webp({ quality: 86, effort: 5 }).toBuffer();
    const key = `platform/mini/${kind}-${crypto.randomUUID()}.webp`;
    await putObject(key, body);
    return Response.json({ settings: setMiniProgramVisual(kind, key) });
  } catch (error) {
    return apiError(error);
  }
}
