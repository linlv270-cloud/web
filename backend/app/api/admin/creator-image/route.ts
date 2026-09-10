import crypto from "node:crypto";
import sharp from "sharp";
import { adminCanManageCreator, adminPrincipalFromRequest, requireAdmin } from "../../../../lib/auth";
import { apiError } from "../../../../lib/http";
import { audit, getCreator, updateCreatorImages } from "../../../../lib/repository";
import { assetUrl, putObject } from "../../../../lib/storage";

export const runtime = "nodejs";
const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

type ImageSlot = "representative" | "logo" | "product" | "booth" | "history";

function slotToField(slot: ImageSlot) {
  return {
    representative: "representativeImageKey",
    logo: "logoImageKey",
    product: "productImageKey",
    booth: "boothImageKey",
    history: "historyImageKey",
  }[slot] as "representativeImageKey" | "logoImageKey" | "productImageKey" | "boothImageKey" | "historyImageKey";
}

function slotToKey(slot: ImageSlot, creatorId: number) {
  return `creators/${creatorId}/${slot}-${crypto.randomUUID()}.webp`;
}

export async function POST(request: Request) {
  try {
    const denied = requireAdmin(request);
    if (denied) return denied;
    const form = await request.formData();
    const creatorId = Number(form.get("creatorId"));
    const slot = String(form.get("kind") || "representative") as ImageSlot;
    const file = form.get("file");
    if (!adminCanManageCreator(request, creatorId)) return Response.json({ error: "该账号不能管理此用户" }, { status: 403 });
    if (!["representative", "logo", "product", "booth", "history"].includes(slot)) throw new Error("图片槽位不正确");
    if (!(file instanceof File)) throw new Error("请选择图片");
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) throw new Error("仅支持 JPG、PNG 或 WebP 图片");
    if (file.size > MAX_UPLOAD_BYTES) throw new Error("图片不能超过20MB");
    const before = getCreator(creatorId);
    const previousKey = before
      ? {
          representative: before.representativeImageKey || "",
          logo: before.logoKey || "",
          product: before.productImageKey || "",
          booth: before.boothImageKey || "",
          history: before.historyImageKey || "",
        }[slot]
      : "";
    const source = Buffer.from(await file.arrayBuffer());
    const body = await sharp(source, { limitInputPixels: 60_000_000 }).rotate().resize(1200, 1200, { fit: "cover" }).webp({ quality: 82, effort: 5 }).toBuffer();
    const key = slotToKey(slot, creatorId);
    await putObject(key, body);
    try {
      const imageUpdate: {
        representativeImageKey?: string;
        logoImageKey?: string;
        productImageKey?: string;
        boothImageKey?: string;
        historyImageKey?: string;
      } = {};
      imageUpdate[slotToField(slot)] = key;
      const creator = updateCreatorImages(creatorId, imageUpdate);
      const actor = adminPrincipalFromRequest(request)!;
      audit(actor.label, "managed_creator_image", {
        creatorId,
        slot,
        before: previousKey,
        after: key,
      });
      return Response.json({ creator, url: assetUrl(key), actor: actor.label, slot });
    } catch (error) {
      throw error;
    }
  } catch (error) {
    return apiError(error);
  }
}
