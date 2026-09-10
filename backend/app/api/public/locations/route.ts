import { locationPayload } from "../../../../lib/locations";
export async function GET() { return Response.json({ provinces: locationPayload() }, { headers: { "cache-control": "public, max-age=86400" } }); }
