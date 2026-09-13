import { newReference } from "../../../../lib/database";
import { adminPrincipalFromRequest, requireAdmin, requireSuperAdmin } from "../../../../lib/auth";
import { apiError } from "../../../../lib/http";
import {
  createExecutionProject,
  isExecutionProjectSchemaReady,
  isProjectCodeAvailable,
  listExecutionProjects,
} from "../../../../lib/execution-projects";
import { ensureProjectCenterSchema, getProjectCenterDb, schemaNotReadyResponse } from "../../../../lib/project-center-api";
import { PROJECT_SOURCES, type ProjectPriority } from "../../../../lib/execution-project-types";

export const dynamic = "force-dynamic";

function text(value: unknown, max = 500) {
  return (typeof value === "string" || typeof value === "number") ? String(value).trim().slice(0, max) : "";
}

function optionalInteger(value: unknown) {
  if (value === undefined || value === null || value === "") return null;
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}

function validDate(value: string) {
  return Boolean(value) && Number.isFinite(new Date(value).getTime());
}

function validationError(error: string, fieldErrors: Record<string, string>) {
  return Response.json({ error, fieldErrors }, { status: 400, headers: { "cache-control": "no-store" } });
}

function parsePage(value: string | null, fallback: number, max: number) {
  const number = Number(value || fallback);
  return Number.isInteger(number) && number > 0 ? Math.min(number, max) : fallback;
}

export async function GET(request: Request) {
  const denied = requireAdmin(request);
  if (denied) return denied;
  if (!ensureProjectCenterSchema()) return schemaNotReadyResponse();
  const principal = adminPrincipalFromRequest(request)!;
  const url = new URL(request.url);
  const page = parsePage(url.searchParams.get("page"), 1, 1000000);
  const pageSize = parsePage(url.searchParams.get("pageSize"), 20, 100);
  return Response.json(listExecutionProjects(principal, {
    status: url.searchParams.get("status") || undefined,
    health: url.searchParams.get("health") || undefined,
    ownerId: optionalInteger(url.searchParams.get("ownerId")) || undefined,
    keyword: text(url.searchParams.get("keyword"), 80) || undefined,
    activityStartFrom: url.searchParams.get("activityStartFrom") || undefined,
    activityStartTo: url.searchParams.get("activityStartTo") || undefined,
    page,
    pageSize,
  }), { headers: { "cache-control": "no-store" } });
}

export async function POST(request: Request) {
  const denied = requireSuperAdmin(request);
  if (denied) return denied;
  if (!ensureProjectCenterSchema()) return schemaNotReadyResponse();
  try {
    const data = await request.json() as Record<string, unknown>;
    if ("auto" in data || "autoCreate" in data || "automatic" in data)
      return Response.json({ error: "项目中台只允许人工新建项目", errorCode: "MANUAL_CREATION_ONLY" }, { status: 400 });

    const required = [
      ["name", "项目名称"],
      ["venueName", "场地方名称"],
      ["venueContactName", "场地方联系人"],
      ["venueContactInfo", "联系方式"],
      ["activityDirection", "初步活动方向"],
      ["activityStartAt", "预计活动开始时间"],
      ["activityEndAt", "预计活动结束时间"],
      ["projectManagerId", "平台内部项目经理"],
      ["creationBasis", "创建依据"],
      ["confirmedItems", "已确认事项"],
      ["unconfirmedItems", "未确认事项"],
    ] as const;
    const fieldErrors: Record<string, string> = {};
    for (const [key, label] of required) if (!text(data[key])) fieldErrors[key] = `${label}不能为空`;
    if (fieldErrors.name || fieldErrors.venueName || fieldErrors.venueContactName || fieldErrors.venueContactInfo ||
      fieldErrors.activityDirection || fieldErrors.activityStartAt || fieldErrors.activityEndAt ||
      fieldErrors.projectManagerId || fieldErrors.creationBasis || fieldErrors.confirmedItems || fieldErrors.unconfirmedItems) {
      return validationError("请补充标记的项目字段", fieldErrors);
    }
    const source = text(data.source, 40);
    if (!PROJECT_SOURCES.includes(source as typeof PROJECT_SOURCES[number]))
      return validationError("项目来源不正确", { source: "请选择有效的项目来源" });
    const activityStartAt = text(data.activityStartAt, 80);
    const activityEndAt = text(data.activityEndAt, 80);
    if (!validDate(activityStartAt)) return validationError("活动开始时间格式不正确", { activityStartAt: "请输入有效的开始时间" });
    if (!validDate(activityEndAt)) return validationError("活动结束时间格式不正确", { activityEndAt: "请输入有效的结束时间" });
    if (new Date(activityEndAt).getTime() < new Date(activityStartAt).getTime())
      return validationError("活动结束时间不能早于开始时间", { activityEndAt: "结束时间不能早于开始时间" });
    const moveInAt = text(data.moveInAt, 80);
    const moveOutAt = text(data.moveOutAt, 80);
    if (moveInAt && !validDate(moveInAt)) return validationError("进场时间格式不正确", { moveInAt: "请输入有效的进场时间" });
    if (moveOutAt && !validDate(moveOutAt)) return validationError("撤场时间格式不正确", { moveOutAt: "请输入有效的撤场时间" });
    if (moveInAt && moveOutAt && new Date(moveOutAt).getTime() < new Date(moveInAt).getTime())
      return validationError("撤场时间不能早于进场时间", { moveOutAt: "撤场时间不能早于进场时间" });
    const codeInput = text(data.code, 80);
    if (codeInput && !/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(codeInput))
      return validationError("项目代号格式不正确", { code: "仅允许字母、数字、下划线和短横线" });

    const projectManagerId = optionalInteger(data.projectManagerId);
    if (!projectManagerId) return validationError("项目经理无效", { projectManagerId: "请选择有效的项目经理" });
    const manager = getProjectCenterDb().prepare(
      "SELECT id FROM admin_accounts WHERE id = ? AND status = 'active'",
    ).get(projectManagerId);
    if (!manager) return validationError("项目经理账号不存在或不可用", { projectManagerId: "请选择仍处于启用状态的账号" });

    const db = getProjectCenterDb();
    let code = text(data.code, 80);
    if (code && !isProjectCodeAvailable(code, db))
      return Response.json({ error: "项目代号已存在", errorCode: "PROJECT_CODE_CONFLICT", fieldErrors: { code: "项目代号已存在，请更换" } }, { status: 409 });
    if (!code) {
      do code = newReference("PRJ"); while (!isProjectCodeAvailable(code, db));
    }
    const principal = adminPrincipalFromRequest(request)!;
    const created = createExecutionProject({
      code,
      name: text(data.name, 160),
      source: source as typeof PROJECT_SOURCES[number],
      managerAdminId: projectManagerId,
      createdByAdminId: principal.id,
      createdByLabel: principal.label,
      sourceReferenceId: text(data.sourceReferenceId, 160),
      venueName: text(data.venueName, 160),
      venueContactName: text(data.venueContactName, 80),
      venueContactInfo: text(data.venueContactInfo, 160),
      venueAddress: text(data.venueAddress, 240),
      activityDirection: text(data.activityDirection, 1000),
      activityStartAt,
      activityEndAt,
      moveInAt: moveInAt || null,
      moveOutAt: moveOutAt || null,
      scaleDescription: text(data.scaleDescription, 500),
      cooperationMode: text(data.cooperationMode, 160),
      budgetRangeText: text(data.budgetRangeText, 160),
      knownConstraints: text(data.knownConstraints, 1000),
      priority: (["LOW", "NORMAL", "HIGH", "URGENT"].includes(text(data.priority, 20)) ? text(data.priority, 20) : "NORMAL") as ProjectPriority,
      creationBasis: text(data.creationBasis, 1000),
      confirmedItems: text(data.confirmedItems, 2000),
      unconfirmedItems: text(data.unconfirmedItems, 2000),
      notes: text(data.notes, 2000),
      sourceVenueId: optionalInteger(data.venueId),
      sourceDesignSessionId: optionalInteger(data.designSessionId),
      sourceDesignDraftId: optionalInteger(data.designDraftId),
      startsAt: activityStartAt,
      targetEndAt: activityEndAt,
    }, db);
    return Response.json({
      project: created.project,
      counts: { phases: created.phaseCount, milestones: created.milestoneCount, draftTasks: created.taskCount },
    }, { status: 201, headers: { "cache-control": "no-store" } });
  } catch (error) {
    if (error instanceof Error && /Project code already exists/.test(error.message))
      return Response.json({ error: "项目代号已存在", errorCode: "PROJECT_CODE_CONFLICT", fieldErrors: { code: "项目代号已存在，请更换" } }, { status: 409 });
    return apiError(error);
  }
}
