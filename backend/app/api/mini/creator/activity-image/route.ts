import crypto from "node:crypto";
import sharp from "sharp";
import { apiError } from "../../../../../lib/http";
import { miniPrincipalFromRequest, requireMiniActor } from "../../../../../lib/mini-auth";
import { getMiniActivity, setMiniActivityImage } from "../../../../../lib/mini-program";
import { deleteObject, putObject } from "../../../../../lib/storage";

export const runtime = "nodejs";
const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

export async function POST(request: Request) {
  try {
    const denied = requireMiniActor(request, "creator");
    if (denied) return denied;
    const creatorId = miniPrincipalFromRequest(request)!.actorId;
    const form = await request.formData();
    const activityId = Number(form.get("activityId"));
    const file = form.get("file");
    const current = getMiniActivity(activityId, true);
    if (!current || current.creatorId !== creatorId) throw new Error("活动不存在或不能修改");
    if (!(file instanceof File)) throw new Error("请选择图片");
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error("仅支持 JPG、PNG 或 WebP 图片");
    if (file.size > MAX_UPLOAD_BYTES) throw new Error("图片不能超过20MB");
    const body = await sharp(Buffer.from(await file.arrayBuffer()), { limitInputPixels: 60_000_000 })
      .rotate().resize(1440, 1800, { fit: "cover" }).webp({ quality: 84, effort: 5 }).toBuffer();
    const key = `activities/${activityId}/cover-${crypto.randomUUID()}.webp`;
    await putObject(key, body);
    const previousKey = current.imageUrl.startsWith("/api/assets/activities/")
      ? current.imageUrl.replace(/^\/api\/assets\//, "").split("/").map(decodeURIComponent).join("/")
      : "";
    const activity = setMiniActivityImage(activityId, creatorId, key);
    if (previousKey && previousKey !== key) await deleteObject(previousKey).catch(() => undefined);
    return Response.json({ activity });
  } catch (error) {
    return apiError(error);
  }
}

