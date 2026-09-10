import { requireSuperAdmin } from "../../../../lib/auth";
import { apiError } from "../../../../lib/http";
import { createTag, retireTag, reviewTag } from "../../../../lib/repository";

export async function POST(request: Request) {
  try {
    const denied = requireSuperAdmin(request); if (denied) return denied;
    const data = await request.json();
    return Response.json({ tag: createTag(data.label, data.category) });
  } catch (error) { return apiError(error); }
}

export async function PATCH(request: Request) {
  try { const denied = requireSuperAdmin(request); if (denied) return denied; const data = await request.json(); return Response.json({ tags: reviewTag(Number(data.id), data.status, data.replacementTagId ? Number(data.replacementTagId) : undefined, String(data.note || "")) }); }
  catch (error) { return apiError(error); }
}

export async function DELETE(request: Request) {
  try { const denied = requireSuperAdmin(request); if (denied) return denied; const data = await request.json(); return Response.json({ tags: retireTag(Number(data.id)) }); }
  catch (error) { return apiError(error); }
}
