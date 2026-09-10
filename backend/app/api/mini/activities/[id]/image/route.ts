import { miniPrincipalFromRequest } from "../../../../../../lib/mini-auth";
import { one } from "../../../../../../lib/database";
import { getObject } from "../../../../../../lib/storage";

function parseKeys(value: string) {
  try { return JSON.parse(value) as string[]; } catch { return []; }
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  const row = one<{ creator_id: number; status: string; image_key: string | null; work_keys: string }>(
    `SELECT a.creator_id, a.status, a.image_key, c.work_keys
     FROM activities a JOIN creators c ON c.id = a.creator_id WHERE a.id = ?`,
    id,
  );
  const principal = miniPrincipalFromRequest(request);
  const owner = principal?.actorType === "creator" && principal.actorId === row?.creator_id;
  if (!row || (row.status !== "published" && !owner)) return new Response("Not found", { status: 404 });
  const key = row.image_key || parseKeys(row.work_keys)[0];
  if (!key) return new Response("Not found", { status: 404 });
  const object = await getObject(key);
  if (!object) return new Response("Not found", { status: 404 });
  return new Response(object.body, {
    headers: {
      "content-type": object.contentType,
      etag: object.etag,
      "cache-control": row.status === "published" ? "public, max-age=3600" : "private, max-age=300",
      "x-content-type-options": "nosniff",
    },
  });
}

