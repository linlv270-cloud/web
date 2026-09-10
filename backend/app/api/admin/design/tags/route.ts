import { requireAdmin, requireSuperAdmin } from "../../../../../lib/auth";
import { apiError } from "../../../../../lib/http";
import {
  createDesignTag,
  listDesignTagCategories,
  listDesignTags,
  updateDesignTagCategoryPick,
} from "../../../../../lib/repository";

export async function GET(request: Request) {
  try {
    const denied = requireAdmin(request);
    if (denied) return denied;
    return Response.json({
      categories: listDesignTagCategories(),
      tags: listDesignTags(),
    });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const denied = requireSuperAdmin(request);
    if (denied) return denied;
    const data = await request.json();
    return Response.json({ tag: createDesignTag(String(data.category_key), String(data.value)) });
  } catch (error) {
    return apiError(error);
  }
}

/** 配置某类标签的抽取数量（参与组合的标签个数，1-5） */
export async function PATCH(request: Request) {
  try {
    const denied = requireSuperAdmin(request);
    if (denied) return denied;
    const data = await request.json();
    if (data.category_key) {
      updateDesignTagCategoryPick(String(data.category_key), Number(data.pick_count));
      return Response.json({ success: true });
    }
    return Response.json({ error: "缺少 category_key" }, { status: 400 });
  } catch (error) {
    return apiError(error);
  }
}
