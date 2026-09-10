import { miniCompanionPlay } from "../../../../../lib/mini-program";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  return Response.json(
    miniCompanionPlay({
      city: searchParams.get("city") || "",
      district: searchParams.get("district") || "",
      date: searchParams.get("date") || "",
      scene: searchParams.get("scene") || "",
      tag: searchParams.get("tag") || "",
      limit: searchParams.get("limit") || "",
    }),
    { headers: { "cache-control": "public, max-age=60, stale-while-revalidate=300" } },
  );
}
