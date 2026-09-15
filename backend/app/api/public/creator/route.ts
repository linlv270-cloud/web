import { getPublicPortrait } from "../../../../lib/portrait";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const publicRef = url.searchParams.get("portrait") || url.searchParams.get("id") || "";
  const portrait = getPublicPortrait(publicRef);
  if (!portrait)
    return Response.json({ error: "该主页暂未公开" }, { status: 404, headers: { "cache-control": "no-store" } });
  return Response.json({ portrait }, {
    headers: { "cache-control": "public, max-age=60, stale-while-revalidate=300" },
  });
}
