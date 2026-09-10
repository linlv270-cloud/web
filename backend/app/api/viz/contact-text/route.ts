import { getVizContactText } from "../../../../lib/visualization";

export async function GET() {
  return Response.json({ text: getVizContactText() });
}
