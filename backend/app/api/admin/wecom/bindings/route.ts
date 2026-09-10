import { adminCanManageCreator, adminPrincipalFromRequest, requireAdmin } from "../../../../../lib/auth";
import { apiError } from "../../../../../lib/http";
import {
  approveCreatorWecomBinding,
  deleteCreatorWecomBinding,
  disableCreatorWecomBinding,
  getCreatorWecomBinding,
  rejectCreatorWecomBinding,
} from "../../../../../lib/wecom-bindings";
import { wecomRuntimeStatus } from "../../../../../lib/wecom";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const denied = requireAdmin(request);
    if (denied) return denied;
    const creatorId = Number(new URL(request.url).searchParams.get("creatorId") || 0);
    if (!creatorId || !adminCanManageCreator(request, creatorId))
      return Response.json({ error: "该账号不能管理此新遇官" }, { status: 403 });
    return Response.json({ binding: getCreatorWecomBinding(creatorId), runtime: wecomRuntimeStatus() });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const denied = requireAdmin(request);
    if (denied) return denied;
    const principal = adminPrincipalFromRequest(request)!;
    const data = await request.json() as Record<string, unknown>;
    const creatorId = Number(data.creatorId || 0);
    if (!creatorId || !adminCanManageCreator(request, creatorId))
      return Response.json({ error: "该账号不能管理此新遇官" }, { status: 403 });
    const action = String(data.action || "approve");
    if (action === "approve" || action === "rebind") {
      const binding = await approveCreatorWecomBinding(creatorId, principal, data.wecomUserId);
      return Response.json({ binding, runtime: wecomRuntimeStatus() });
    }
    if (action === "reject")
      return Response.json({ binding: rejectCreatorWecomBinding(creatorId, principal, data.reason) });
    if (action === "disable")
      return Response.json({ binding: await disableCreatorWecomBinding(creatorId, principal) });
    if (action === "delete") {
      if (principal.role !== "super") return Response.json({ error: "只有超级管理员可以删除企业微信通知绑定" }, { status: 403 });
      return Response.json({ binding: await deleteCreatorWecomBinding(creatorId, principal) });
    }
    throw new Error("企业微信通知绑定操作不正确");
  } catch (error) {
    return apiError(error);
  }
}
