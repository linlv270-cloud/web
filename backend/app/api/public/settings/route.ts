import { getPublicPlatformSettings } from "../../../../lib/public-settings";

export const dynamic = "force-dynamic";
export async function GET() {
  return Response.json({ settings: getPublicPlatformSettings() }, { headers: { "cache-control": "no-store" } });
}
