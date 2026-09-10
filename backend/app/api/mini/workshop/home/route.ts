import { miniWorkshopHome } from "../../../../../lib/mini-program";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  return Response.json(miniWorkshopHome({ city: searchParams.get("city") || "" }), {
    headers: { "cache-control": "public, max-age=60, stale-while-revalidate=300" },
  });
}
