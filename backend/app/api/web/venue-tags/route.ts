import { all } from "../../../../lib/database";

export async function GET() {
  const tags = all<{ id: number; category: string; name: string; cost: number; sort_order: number }>(
    "SELECT id, category, name, cost, sort_order FROM venue_tags WHERE active = 1 ORDER BY category, sort_order, id",
  );

  const grouped = {
    venue: tags.filter(t => t.category === 'venue'),
    footfall: tags.filter(t => t.category === 'footfall'),
    audience: tags.filter(t => t.category === 'audience'),
  };

  return Response.json({ tags: grouped }, { headers: { "cache-control": "public, max-age=300" } });
}
