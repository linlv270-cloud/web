import { miniSelfPlay } from "../../../../../lib/mini-program";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  return Response.json(
    miniSelfPlay({
      city: searchParams.get("city") || "",
      businessArea: searchParams.get("businessArea") || "",
      tag: searchParams.get("tag") || "",
    }),
    { headers: { "cache-control": "public, max-age=60, stale-while-revalidate=300" } },
  );
}
