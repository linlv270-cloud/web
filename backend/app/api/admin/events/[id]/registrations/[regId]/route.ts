import { NextRequest } from "next/server";
import { run } from "../../../../../../../lib/database";
import { apiError } from "../../../../../../../lib/http";
import { adminPrincipalFromRequest, requireAdmin } from "../../../../../../../lib/auth";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string; regId: string }> }) {
  try {
    const denied = requireAdmin(request);
    if (denied) return denied;

    const { id, regId } = await params;
    const data = await request.json();
    const action = data.action;

    if (!["approve", "reject"].includes(action)) {
      return Response.json({ error: "无效操作" }, { status: 400 });
    }

    const status = action === "approve" ? "approved" : "rejected";
    const admin = adminPrincipalFromRequest(request);
    run(
      "UPDATE event_registrations SET status = ?, reviewed_at = CURRENT_TIMESTAMP, reviewed_by = ? WHERE id = ? AND event_id = ?",
      status,
      String(admin?.id || ""),
      Number(regId),
      Number(id),
    );

    return Response.json({ success: true });
  } catch (error) {
    return apiError(error);
  }
}
