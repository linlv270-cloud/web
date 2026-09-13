import { getVizInterfaceSettings } from "../../../../lib/visualization";

export async function GET() {
  return Response.json(
    { settings: getVizInterfaceSettings() },
    { headers: { "cache-control": "no-store" } },
  );
}
