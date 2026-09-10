import crypto from "node:crypto";
import sharp from "sharp";
import { one } from "../../../../../lib/database";
import { apiError } from "../../../../../lib/http";
import { miniPrincipalFromRequest, requireMiniActor } from "../../../../../lib/mini-auth";
import { setWorkshopProjectCover } from "../../../../../lib/mini-program";
import { assetUrl, putObject } from "../../../../../lib/storage";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const denied = requireMiniActor(request, "creator");
    if (denied) return denied;
    const creatorId = miniPrincipalFromRequest(request)!.actorId;
    const form = await request.formData();
    const projectId = Number(form.get("projectId") || 0);
    const project = one<{ creator_id: number }>("SELECT creator_id FROM workshop_projects WHERE id = ?", projectId);
    if (!project || project.creator_id !== creatorId) throw new Error("体验不存在或不能修改");
    const file = form.get("file");
    if (!(file instanceof File)) throw new Error("请选择图片");
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) throw new Error("仅支持 JPG、PNG 或 WebP 图片");
    if (file.size > 20 * 1024 * 1024) throw new Error("图片不能超过20MB");
    const body = await sharp(Buffer.from(await file.arrayBuffer()), { limitInputPixels: 60_000_000 })
      .rotate().resize(1440, 1800, { fit: "cover" }).webp({ quality: 84, effort: 5 }).toBuffer();
    const key = `workshop/project/${projectId}-${crypto.randomUUID()}.webp`;
    await putObject(key, body);
    const target = setWorkshopProjectCover(projectId, key);
    return Response.json({ target, url: assetUrl(key) });
  } catch (error) {
    return apiError(error);
  }
}
