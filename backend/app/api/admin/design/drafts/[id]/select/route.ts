import { NextRequest } from "next/server";
import { requireAdmin } from "../../../../../../../lib/auth";
import { apiError } from "../../../../../../../lib/http";
import { selectDesignDraft } from "../../../../../../../lib/repository";

/** 点「确定」：锁定草稿，会话进入 confirmed（进入工作流），导出由超管侧进行 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const denied = requireAdmin(request);
    if (denied) return denied;
    const { id: idStr } = await params;
    const draft = selectDesignDraft(Number(idStr));
    return Response.json({ draft });
  } catch (error) {
    return apiError(error);
  }
}
