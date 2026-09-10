import { tagCategoryNames } from "../../../lib/catalog";
import { getPublicPlatformSettings } from "../../../lib/public-settings";
import { listTags } from "../../../lib/repository";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(
    { tags: listTags().filter((tag) => tagCategoryNames.includes(tag.category)), settings: getPublicPlatformSettings() },
    { headers: { "cache-control": "no-store" } },
  );
}
