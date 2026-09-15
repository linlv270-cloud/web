import { miniPrincipalFromRequest } from "../../../../../lib/mini-auth";
import { apiError } from "../../../../../lib/http";
import { PublicOriginConfigError, getPublicOrigin } from "../../../../../lib/public-origin";
import { renderPortraitVisual, type PortraitVisualFormat } from "../../../../../lib/portrait-visuals";

function creatorId(request: Request) {
  const principal = miniPrincipalFromRequest(request);
  if (!principal || principal.actorType !== "creator")
    return Response.json({ error: "请先登录" }, { status: 401, headers: { "cache-control": "no-store" } });
  return principal.actorId;
}

export async function GET(request: Request) {
  const id = creatorId(request);
  if (id instanceof Response) return id;
  const format = new URL(request.url).searchParams.get("format") as PortraitVisualFormat | null;
  if (!format || !["share", "a3", "a4"].includes(format))
    return Response.json({ error: "视觉输出格式不正确" }, { status: 400, headers: { "cache-control": "no-store" } });
  try {
    const output = await renderPortraitVisual(id, getPublicOrigin(request), format);
    return new Response(new Uint8Array(output.body), {
      headers: {
        "cache-control": "private, no-store",
        "content-type": output.contentType,
        "content-disposition": `attachment; filename="TDE-${output.extension}"; filename*=UTF-8''${encodeURIComponent(output.filename)}`,
        "x-content-type-options": "nosniff",
      },
    });
  } catch (error) {
    if (error instanceof PublicOriginConfigError)
      return Response.json({ error: error.message }, { status: 500, headers: { "cache-control": "no-store" } });
    return apiError(error);
  }
}
