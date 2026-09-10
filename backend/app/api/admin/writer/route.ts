import { requireSuperAdmin } from "../../../../lib/auth";
import { apiError } from "../../../../lib/http";
import { setCopyGenerationLimit } from "../../../../lib/repository";
import type { CopyMode } from "../../../../lib/types";

export async function PATCH(request: Request) {
  try {
    const denied = requireSuperAdmin(request);
    if (denied) return denied;
    const data = await request.json();
    return Response.json({
      creator: setCopyGenerationLimit(Number(data.creatorId), String(data.mode) as CopyMode, data.limit),
    });
  } catch (error) {
    return apiError(error);
  }
}
