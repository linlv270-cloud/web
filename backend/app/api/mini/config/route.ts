import { getMiniProgramSettings, listMiniActivities } from "../../../../lib/mini-program";

export async function GET() {
  return Response.json(
    { settings: getMiniProgramSettings(), availableCount: listMiniActivities().length },
    { headers: { "cache-control": "public, max-age=60, stale-while-revalidate=300" } },
  );
}
