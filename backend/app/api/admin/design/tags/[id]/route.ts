import { NextRequest } from "next/server";
import { requireSuperAdmin } from "../../../../../../lib/auth";
import { apiError } from "../../../../../../lib/http";
import { updateDesignTagStatus } from "../../../../../../lib/repository";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const denied = requireSuperAdmin(request);
    if (denied) return denied;
    const { id: idStr } = await params;
    const data = await request.json();
    const status = String(data.status) === "archived" ? "archived" : "active";
    updateDesignTagStatus(Number(idStr), status);
    return Response.json({ success: true });
  } catch (error) {
    return apiError(error);
  }
}
