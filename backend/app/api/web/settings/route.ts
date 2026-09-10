import { getPlatformSettings } from "../../../../lib/repository";

export async function GET() {
  const settings = getPlatformSettings();
  return Response.json(
    {
      contactText: settings.contactText,
      inviteContactText: settings.inviteContactText,
    },
    { headers: { "cache-control": "public, max-age=300" } },
  );
}
