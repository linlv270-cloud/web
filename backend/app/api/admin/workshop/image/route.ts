import crypto from "node:crypto";
import sharp from "sharp";
import { adminCanManageCreator, adminPrincipalFromRequest, requireAdmin, requireSuperAdmin } from "../../../../../lib/auth";
import { one } from "../../../../../lib/database";
import { apiError } from "../../../../../lib/http";
import {
  setHomepageBannerImage,
  setWorkshopKitCover,
  setWorkshopProjectCover,
  setWorkshopVenueCover,
} from "../../../../../lib/mini-program";
import { assetUrl, putObject } from "../../../../../lib/storage";

export const runtime = "nodejs";
const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

type ImageKind = "venue" | "kit" | "project" | "banner";

function dimensions(kind: ImageKind) {
  if (kind === "banner") return { width: 1440, height: 640 };
  if (kind === "project") return { width: 1440, height: 1800 };
  return { width: 1440, height: 1080 };
}

export async function POST(request: Request) {
  try {
    const denied = requireAdmin(request);
    if (denied) return denied;
    const principal = adminPrincipalFromRequest(request)!;
    const form = await request.formData();
    const kind = String(form.get("kind") || "") as ImageKind;
    const id = Number(form.get("id") || 0);
    const file = form.get("file");
    if (!["venue", "kit", "project", "banner"].includes(kind)) throw new Error("图片类型不正确");
    if (!(file instanceof File)) throw new Error("请选择图片");
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) throw new Error("仅支持 JPG、PNG 或 WebP 图片");
    if (file.size > MAX_UPLOAD_BYTES) throw new Error("图片不能超过20MB");

    if (["venue", "kit", "banner"].includes(kind)) {
      const superDenied = requireSuperAdmin(request);
      if (superDenied) return superDenied;
    }
    if (kind === "project") {
      const project = one<{ creator_id: number }>("SELECT creator_id FROM workshop_projects WHERE id = ?", id);
      if (!project) throw new Error("体验不存在");
      if (!adminCanManageCreator(request, project.creator_id)) return Response.json({ error: "该账号不能管理此新遇官" }, { status: 403 });
    }
    const size = dimensions(kind);
    const body = await sharp(Buffer.from(await file.arrayBuffer()), { limitInputPixels: 60_000_000 })
      .rotate()
      .resize(size.width, size.height, { fit: "cover" })
      .webp({ quality: 84, effort: 5 })
      .toBuffer();
    const key = `workshop/${kind}/${id}-${crypto.randomUUID()}.webp`;
    await putObject(key, body);
    const target =
      kind === "venue" ? setWorkshopVenueCover(id, key)
        : kind === "kit" ? setWorkshopKitCover(id, key)
          : kind === "project" ? setWorkshopProjectCover(id, key, principal)
            : setHomepageBannerImage(id, key);
    return Response.json({ target, url: assetUrl(key) });
  } catch (error) {
    return apiError(error);
  }
}
