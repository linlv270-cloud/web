import { miniExplore } from "../../../../../lib/mini-program";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  return Response.json(miniExplore({
    city: searchParams.get("city") || "",
    district: searchParams.get("district") || "",
    businessArea: searchParams.get("businessArea") || "",
    date: searchParams.get("date") || "",
    tag: searchParams.get("tag") || "",
    mode: searchParams.get("mode") || "all",
  }), { headers: { "cache-control": "public, max-age=60, stale-while-revalidate=300" } });
}
