import { NextRequest } from "next/server";
import { requireAdmin } from "../../../../../../../lib/auth";
import { apiError } from "../../../../../../../lib/http";
import { createDesignDraft, listDesignDrafts } from "../../../../../../../lib/repository";
import { adminPrincipalFromRequest } from "../../../../../../../lib/auth";

/** 获取会话全部草稿版本 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const denied = requireAdmin(request);
    if (denied) return denied;
    const { id: idStr } = await params;
    return Response.json({ drafts: listDesignDrafts(Number(idStr)) });
  } catch (error) {
    return apiError(error);
  }
}

/** 抽卡：一次点击 = 随机组合标签 + 豆包生成提示词与结构化设计描述，消耗操作员自己的 Key */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const denied = requireAdmin(request);
    if (denied) return denied;
    const { id: idStr } = await params;
    const principal = adminPrincipalFromRequest(request);
    const data = await request.json();
    const draft = await createDesignDraft({
      session_id: Number(idStr),
      operator_id: Number(data.operator_id),
      created_by: principal?.label || "运营台",
    });
    return Response.json({ draft });
  } catch (error) {
    return apiError(error);
  }
}
