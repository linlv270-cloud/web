import { publicMediaKey } from "../../../../lib/portrait";
import { getObject } from "../../../../lib/storage";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const portrait = url.searchParams.get("portrait") || "";
  const key = url.searchParams.get("key") || "";
  const allowed = publicMediaKey(portrait, key);
  if (!allowed) return new Response("Not found", { status: 404 });
  const object = await getObject(key);
  if (!object) return new Response("Not found", { status: 404 });
  return new Response(object.body, {
    headers: {
      "content-type": object.contentType,
      etag: object.etag,
      "cache-control": "public, max-age=86400, immutable",
      "x-content-type-options": "nosniff",
    },
  });
}
