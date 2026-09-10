import { NextRequest } from "next/server";
import { requireSuperAdmin } from "../../../../../../lib/auth";
import { apiError } from "../../../../../../lib/http";
import { deleteDesignApiKey, updateDesignApiKey } from "../../../../../../lib/repository";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const denied = requireSuperAdmin(request);
    if (denied) return denied;
    const { id: idStr } = await params;
    const data = await request.json();
    updateDesignApiKey(Number(idStr), {
      operator_name: data.operator_name !== undefined ? String(data.operator_name) : undefined,
      base_url: data.base_url !== undefined ? String(data.base_url) : undefined,
      api_key: data.api_key !== undefined ? String(data.api_key) : undefined,
      model: data.model !== undefined ? String(data.model) : undefined,
      note: data.note !== undefined ? String(data.note) : undefined,
      enabled: data.enabled !== undefined ? (data.enabled ? 1 : 0) : undefined,
    });
    return Response.json({ success: true });
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const denied = requireSuperAdmin(request);
    if (denied) return denied;
    const { id: idStr } = await params;
    deleteDesignApiKey(Number(idStr));
    return Response.json({ success: true });
  } catch (error) {
    return apiError(error);
  }
}
