import { requireAdmin } from "../../../../../lib/auth";
import { apiError } from "../../../../../lib/http";
import { getVizContactText, setVizContactText } from "../../../../../lib/visualization";

export async function GET(request: Request) {
  try {
    const denied = requireAdmin(request);
    if (denied) return denied;
    return Response.json({ text: getVizContactText() });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const denied = requireAdmin(request);
    if (denied) return denied;
    const data = await request.json();
    const text = String(data.text || "");
    if (!text.trim()) throw new Error("联络文字不能为空");
    setVizContactText(text);
    return Response.json({ ok: true, text });
  } catch (error) {
    return apiError(error);
  }
}
