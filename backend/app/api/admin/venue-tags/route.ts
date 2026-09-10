import { NextRequest } from "next/server";
import { all, run } from "../../../../lib/database";
import { apiError } from "../../../../lib/http";
import { requireAdmin } from "../../../../lib/auth";

export async function GET(request: NextRequest) {
  try {
    const denied = requireAdmin(request);
    if (denied) return denied;

    const tags = all<any>(
      "SELECT id, category, name, cost, sort_order, active, created_at, updated_at FROM venue_tags ORDER BY category, sort_order, id",
    );

    return Response.json({ tags });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const denied = requireAdmin(request);
    if (denied) return denied;

    const body = await request.json();
    const { category, name, cost = 0, sort_order = 0 } = body;

    if (!category || !name) {
      return Response.json({ error: "分类和名称必填" }, { status: 400 });
    }

    const result = run(
      "INSERT INTO venue_tags(category, name, cost, sort_order) VALUES(?, ?, ?, ?)",
      category, name, cost, sort_order,
    );

    return Response.json({ id: result.lastInsertRowid, success: true });
  } catch (error) {
    return apiError(error);
  }
}
