import { NextRequest } from "next/server";
import { run } from "../../../../../lib/database";
import { apiError } from "../../../../../lib/http";
import { requireAdmin } from "../../../../../lib/auth";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const denied = requireAdmin(request);
    if (denied) return denied;

    const { id: idStr } = await params;
    const id = Number(idStr);
    const body = await request.json();
    const { name, cost, sort_order, active } = body;

    const fields: string[] = [];
    const values: any[] = [];

    if (name !== undefined) { fields.push("name = ?"); values.push(name); }
    if (cost !== undefined) { fields.push("cost = ?"); values.push(cost); }
    if (sort_order !== undefined) { fields.push("sort_order = ?"); values.push(sort_order); }
    if (active !== undefined) { fields.push("active = ?"); values.push(active ? 1 : 0); }

    if (fields.length === 0) {
      return Response.json({ error: "没有要更新的字段" }, { status: 400 });
    }

    fields.push("updated_at = CURRENT_TIMESTAMP");
    values.push(id);

    run(`UPDATE venue_tags SET ${fields.join(", ")} WHERE id = ?`, ...values);

    return Response.json({ success: true });
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const denied = requireAdmin(request);
    if (denied) return denied;

    const { id: idStr } = await params;
    const id = Number(idStr);
    run("DELETE FROM venue_tags WHERE id = ?", id);

    return Response.json({ success: true });
  } catch (error) {
    return apiError(error);
  }
}
