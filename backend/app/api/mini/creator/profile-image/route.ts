import crypto from "node:crypto";
import sharp from "sharp";
import { apiError } from "../../../../../lib/http";
import { getCreatorApplication, miniPrincipalFromRequest, requireMiniActor } from "../../../../../lib/mini-auth";
import { attachUpload, getCreator } from "../../../../../lib/repository";
import { deleteObject, putObject } from "../../../../../lib/storage";

export const runtime = "nodejs";

function assetKey(url: string) {
  return url.startsWith("/api/assets/")
    ? url.slice("/api/assets/".length).split("/").map(decodeURIComponent).join("/")
    : "";
}

export async function POST(request: Request) {
  try {
    const denied = requireMiniActor(request, "creator");
    if (denied) return denied;
    const creatorId = miniPrincipalFromRequest(request)!.actorId;
    const application = getCreatorApplication(creatorId);
    if (application && application.status !== "active") throw new Error("请在新遇官申请页更换申请代表图");
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw new Error("请选择图片");
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error("仅支持 JPG、PNG 或 WebP 图片");
    if (file.size > 20 * 1024 * 1024) throw new Error("图片不能超过20MB");
    const previous = assetKey(getCreator(creatorId)?.workUrls[0] || "");
    const body = await sharp(Buffer.from(await file.arrayBuffer()), { limitInputPixels: 60_000_000 })
      .rotate().resize(1440, 1800, { fit: "cover" }).webp({ quality: 84, effort: 5 }).toBuffer();
    const key = `creators/${creatorId}/mini-cover-${crypto.randomUUID()}.webp`;
    await putObject(key, body);
    const creator = attachUpload(creatorId, "work", key);
    if (previous && previous !== key) await deleteObject(previous).catch(() => undefined);
    return Response.json({ creator });
  } catch (error) {
    return apiError(error);
  }
}
