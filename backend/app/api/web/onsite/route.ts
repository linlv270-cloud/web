import crypto from "node:crypto";
import { all, one, run, transaction } from "../../../../lib/database";
import { miniPrincipalFromRequest } from "../../../../lib/mini-auth";
import { onsiteContentLabels, onsiteTemplateMap, onsiteTemplates, templateForContent } from "../../../../lib/onsite";
import { assetUrl, getObject } from "../../../../lib/storage";

function requireCreator(request: Request) {
  const principal = miniPrincipalFromRequest(request);
  if (!principal || principal.actorType !== "creator")
    return Response.json({ error: "请先登录" }, { status: 401, headers: { "cache-control": "no-store" } });
  return principal.actorId;
}

function uniqueStrings(value: unknown) {
  return Array.isArray(value) ? [...new Set(value.map((item) => String(item).trim()).filter(Boolean))] : [];
}

function validContent(value: unknown) {
  const selected = uniqueStrings(value);
  if (!selected.length) throw new Error("请选择现场内容");
  if (selected.some((item) => !onsiteContentLabels.includes(item as (typeof onsiteContentLabels)[number])))
    throw new Error("现场内容不正确");
  return selected;
}

function selectedContent(creatorId: number) {
  return all<{ content_label: string }>(
    "SELECT content_label FROM creator_onsite_contents WHERE creator_id = ? ORDER BY sort_order, content_label",
    creatorId,
  ).map((row) => row.content_label);
}

function experienceFromProjects(creatorId: number) {
  const projects = all<Record<string, unknown>>(
    "SELECT id, operation_draft, updated_at FROM workshop_projects WHERE creator_id = ? AND reference LIKE 'B1-EXPERIENCE-%' AND status != 'archived' ORDER BY updated_at DESC, id DESC",
    creatorId,
  );
  for (const row of projects) {
    try {
      const draft = JSON.parse(String(row.operation_draft || "{}")) as Record<string, unknown>;
      const value = draft.experience && typeof draft.experience === "object"
        ? draft.experience as Record<string, unknown>
        : null;
      if (!value) continue;
      const media = Array.isArray(value.media)
        ? value.media
          .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
          .map((item, index) => ({
            role: String(item.role || ["creation", "scene", "detail"][index] || "detail"),
            key: String(item.key || "").trim(),
          }))
          .filter((item) => item.key)
          .slice(0, 3)
        : (Array.isArray(value.mediaKeys)
          ? [...new Set(value.mediaKeys.map((item) => String(item).trim()).filter(Boolean))]
            .slice(0, 3)
            .map((key, index) => ({ role: ["creation", "scene", "detail"][index] || "detail", key }))
          : []);
      const mediaKeys = media.map((item) => item.key);
      return {
        projectId: Number(row.id),
        contentLabel: String(value.contentLabel || ""),
        fields: value.fields && typeof value.fields === "object" ? value.fields : {},
        choices: value.choices && typeof value.choices === "object" ? value.choices : {},
        rawText: value.rawText && typeof value.rawText === "object" ? value.rawText : {},
        media,
        mediaKeys,
        mediaUrls: Object.fromEntries(media.map((item) => [item.key, assetUrl(item.key)])),
        updatedAt: String(row.updated_at || ""),
      };
    } catch {}
  }
  return null;
}

function validMedia(value: unknown, creatorId: number) {
  const media = Array.isArray(value)
    ? value
      .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
      .map((item, index) => ({
        role: String(item.role || ["creation", "scene", "detail"][index] || "detail"),
        key: String(item.key || "").trim(),
      }))
      .filter((item) => item.key)
    : [];
  if (media.length > 3) throw new Error("体验图片最多上传三张");
  const keys = [...new Set(media.map((item) => item.key))];
  if (media.some((item) => !["creation", "scene", "detail"].includes(item.role)))
    throw new Error("体验图片用途不正确");
  if (new Set(media.map((item) => item.role)).size !== media.length)
    throw new Error("每种体验图片用途只能上传一张");
  if (keys.length !== media.length)
    throw new Error("同一张图片不能重复使用");
  for (const key of keys) {
    if (!key.startsWith(`web-creators/${creatorId}/`)) throw new Error("不能使用其他账号上传的图片");
  }
  return media;
}

function serializeProject(row: Record<string, unknown>) {
  let draft: Record<string, unknown> = {};
  try {
    draft = JSON.parse(String(row.operation_draft || "{}")) || {};
  } catch {}
  return {
    id: Number(row.id),
    name: String(row.title || ""),
    mainType: String(draft.mainType || ""),
    templateId: String(draft.templateId || ""),
    template: String(draft.template || ""),
    fields: draft.fields && typeof draft.fields === "object" ? draft.fields : {},
    choices: draft.choices && typeof draft.choices === "object" ? draft.choices : {},
    rawText: draft.rawText && typeof draft.rawText === "object" ? draft.rawText : {},
    status: String(row.status || "draft"),
    updatedAt: String(row.updated_at || ""),
  };
}

export async function GET(request: Request) {
  const creatorId = requireCreator(request);
  if (creatorId instanceof Response) return creatorId;
  const projects = all<Record<string, unknown>>(
    "SELECT id, title, operation_draft, status, updated_at FROM workshop_projects WHERE creator_id = ? AND status != 'archived' ORDER BY sort_order, updated_at DESC, id",
    creatorId,
  );
  return Response.json({
    contentLabels: onsiteContentLabels,
    selectedContent: selectedContent(creatorId),
    mappings: onsiteTemplateMap,
    templates: onsiteTemplates,
    projects: projects.map(serializeProject),
    experience: experienceFromProjects(creatorId),
  }, { headers: { "cache-control": "no-store" } });
}

export async function POST(request: Request) {
  try {
    const creatorId = requireCreator(request);
    if (creatorId instanceof Response) return creatorId;
    const data = await request.json() as Record<string, unknown>;
    const action = String(data.action || "");

    if (action === "saveContent") {
      const selected = validContent(data.contentLabels);
      const existingProjects = all<{ id: number; operation_draft: string }>(
        "SELECT id, operation_draft FROM workshop_projects WHERE creator_id = ? AND status != 'archived'",
        creatorId,
      );
      const conflicts: Array<{ id: number; name: string; mainType: string }> = [];
      for (const project of existingProjects) {
        try {
          const draft = JSON.parse(project.operation_draft || "{}");
          if (draft.mainType && !selected.includes(String(draft.mainType))) {
            conflicts.push({ id: project.id, name: String(draft.projectName || ""), mainType: String(draft.mainType) });
          }
        } catch {}
      }
      transaction(() => {
        run("DELETE FROM creator_onsite_contents WHERE creator_id = ?", creatorId);
        selected.forEach((label, index) => run(
          "INSERT INTO creator_onsite_contents(creator_id, content_label, sort_order, updated_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)",
          creatorId, label, index,
        ));
      });
      return Response.json({ success: true, selectedContent: selected, conflicts });
    }

    if (action === "saveExperience") {
      const contentLabel = String(data.contentLabel || "").trim();
      if (!onsiteContentLabels.includes(contentLabel as (typeof onsiteContentLabels)[number]))
        throw new Error("体验标签不正确");
      const template = templateForContent(contentLabel);
      const fields = data.fields && typeof data.fields === "object" ? data.fields as Record<string, unknown> : {};
      const choices = data.choices && typeof data.choices === "object" ? data.choices as Record<string, unknown> : {};
      const rawText = data.rawText && typeof data.rawText === "object" ? data.rawText : {};
      const templateFields = onsiteTemplates[template] || [];
      const missing = templateFields.find((field) => {
        const value = field.kind === "choice" ? choices[field.key] : fields[field.key];
        return !String(value || "").trim();
      });
      if (missing) throw new Error(`请完成：${missing.sentence}`);
      const media = validMedia(data.media, creatorId);
      if (!media.length) throw new Error("请上传体验图片");
      for (const item of media) {
        if (!(await getObject(item.key))) throw new Error("图片已失效，请重新上传");
      }
      const existing = all<{ id: number; operation_draft: string }>(
        "SELECT id, operation_draft FROM workshop_projects WHERE creator_id = ? AND reference LIKE 'B1-EXPERIENCE-%' AND status != 'archived' ORDER BY updated_at DESC, id DESC",
        creatorId,
      );
      const target = existing[0];
      let draft: Record<string, unknown> = {};
      if (target) {
        try { draft = JSON.parse(target.operation_draft || "{}") || {}; } catch {}
      }
      draft.experience = {
        version: 2,
        contentLabel,
        templateId: template,
        fields,
        choices,
        rawText,
        media,
        mediaKeys: media.map((item) => item.key),
      };
      const serialized = JSON.stringify(draft);
      if (target) {
        run("UPDATE workshop_projects SET operation_draft = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND creator_id = ?", serialized, target.id, creatorId);
        return Response.json({ success: true, experience: experienceFromProjects(creatorId) });
      }
      const reference = `B1-EXPERIENCE-${creatorId}-${crypto.randomUUID()}`;
      const result = run(
        "INSERT INTO workshop_projects(reference, creator_id, title, operation_draft, status, sort_order) VALUES (?, ?, '我的体验', ?, 'draft', 0)",
        reference, creatorId, serialized,
      );
      return Response.json({
        success: true,
        experience: {
          projectId: Number(result.lastInsertRowid),
          contentLabel,
          fields,
          choices,
          rawText,
          media,
          mediaKeys: media.map((item) => item.key),
          mediaUrls: Object.fromEntries(media.map((item) => [item.key, assetUrl(item.key)])),
        },
      });
    }

    if (action === "saveProject") {
      const name = String(data.name || "").trim();
      if (!name) throw new Error("请填写项目名称");
      const selected = selectedContent(creatorId);
      if (!selected.length) throw new Error("请先保存现场内容");
      const mainType = String(data.mainType || "").trim();
      if (!selected.includes(mainType)) throw new Error("项目主类型必须来自已选择的现场内容");
      const template = templateForContent(mainType);
      const fields = data.fields && typeof data.fields === "object" ? data.fields : {};
      const choices = data.choices && typeof data.choices === "object" ? data.choices : {};
      const rawText = data.rawText && typeof data.rawText === "object" ? data.rawText : {};
      const templateFields = onsiteTemplates[template] || [];
      const missing = templateFields.filter((field) => {
        const value = field.kind === "choice" ? (choices as Record<string, unknown>)[field.key] : (fields as Record<string, unknown>)[field.key];
        return !String(value || "").trim();
      });
      if (missing.length) throw new Error(`请完成：${missing[0].sentence}`);
      const projectId = Number(data.projectId || 0);
      const draft = JSON.stringify({
        version: 1,
        projectName: name,
        mainType,
        templateId: template,
        template,
        fields,
        choices,
        rawText,
        order: templateFields.map((field) => field.key),
      });
      if (projectId) {
        const owned = one<{ id: number }>("SELECT id FROM workshop_projects WHERE id = ? AND creator_id = ? AND status != 'archived'", projectId, creatorId);
        if (!owned) throw new Error("项目不存在");
        run(
          "UPDATE workshop_projects SET title = ?, operation_draft = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND creator_id = ?",
          name, draft, projectId, creatorId,
        );
      } else {
        const reference = `B1-${creatorId}-${crypto.randomUUID()}`;
        const result = run(
          "INSERT INTO workshop_projects(reference, creator_id, title, operation_draft, status, sort_order) VALUES (?, ?, ?, ?, 'draft', COALESCE((SELECT MAX(sort_order) + 1 FROM workshop_projects WHERE creator_id = ?), 0))",
          reference, creatorId, name, draft, creatorId,
        );
        return Response.json({ success: true, project: { id: Number(result.lastInsertRowid), name, mainType, templateId: template } });
      }
      return Response.json({ success: true, project: { id: projectId, name, mainType, templateId: template } });
    }

    throw new Error("不支持的操作");
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "保存失败" }, { status: 400 });
  }
}
