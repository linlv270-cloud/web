import { NextRequest } from "next/server";
import { requireAdmin } from "../../../../../../lib/auth";
import { apiError } from "../../../../../../lib/http";
import { saveDesignDraftSvg } from "../../../../../../lib/repository";

/** 前端渲染完成后回存 SVG（所见即所得） */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const denied = requireAdmin(request);
    if (denied) return denied;
    const { id: idStr } = await params;
    const data = await request.json();
    saveDesignDraftSvg(Number(idStr), String(data.svg || ""));
    return Response.json({ success: true });
  } catch (error) {
    return apiError(error);
  }
}
