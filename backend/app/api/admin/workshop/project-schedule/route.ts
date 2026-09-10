import { adminCanManageCreator, adminPrincipalFromRequest, requireAdmin } from "../../../../../lib/auth";
import { apiError } from "../../../../../lib/http";
import { one } from "../../../../../lib/database";
import { saveProjectSchedule } from "../../../../../lib/mini-program";

export async function POST(request: Request) {
  try {
    const denied = requireAdmin(request);
    if (denied) return denied;
    const principal = adminPrincipalFromRequest(request)!;
    const data = await request.json();
    const projectId = Number(data.projectId);
    const project = one<{ creator_id: number }>("SELECT creator_id FROM workshop_projects WHERE id = ?", projectId);
    if (!project) throw new Error("体验不存在");
    if (!adminCanManageCreator(request, project.creator_id)) return Response.json({ error: "该账号不能管理此新遇官" }, { status: 403 });
    return Response.json({ schedule: saveProjectSchedule(projectId, data, principal) });
  } catch (error) {
    return apiError(error);
  }
}

export const PATCH = POST;
