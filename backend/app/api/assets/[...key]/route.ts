import { adminCanManageCreator, creatorIdFromRequest, isAdminRequest } from "../../../../lib/auth";
import { one } from "../../../../lib/database";
import { getObject } from "../../../../lib/storage";
import { miniPrincipalFromRequest } from "../../../../lib/mini-auth";

export async function GET(request: Request, { params }: { params: Promise<{ key: string[] }> }) {
  const key = (await params).key.map(decodeURIComponent).join("/"); const parts = key.split("/");
  let allowed = false;
  if (parts[0] === "creators") {
    const ownerId = Number(parts[1]); const viewerId = creatorIdFromRequest(request);
    allowed ||= viewerId === ownerId || adminCanManageCreator(request, ownerId);
  }
  if (parts[0] === "web-creators") {
    const ownerId = Number(parts[1]);
    const principal = miniPrincipalFromRequest(request);
    allowed ||= Boolean(principal && principal.actorType === "creator" && principal.actorId === ownerId);
  }
  if (parts[0] !== "creators") allowed ||= isAdminRequest(request);
  if (parts[0] === "themes") allowed ||= Boolean(creatorIdFromRequest(request));
  if (parts[0] === "platform" && parts[1] === "showcase") allowed = true;
  if (parts[0] === "platform" && parts[1] === "mini") allowed = true;
  if (parts[0] === "activities") allowed = true;
  if (parts[0] === "workshop") allowed = true;
  if (!allowed) return new Response("Not found", { status: 404 });
  const object = await getObject(key); if (!object) return new Response("Not found", { status: 404 });
  const publicAsset = parts[0] === "activities" || parts[0] === "workshop" || (parts[0] === "platform" && ["showcase", "mini"].includes(parts[1]));
  return new Response(object.body, { headers: { "content-type": object.contentType, etag: object.etag, "cache-control": publicAsset ? "public, max-age=86400, immutable" : "private, max-age=3600", "x-content-type-options": "nosniff" } });
}
