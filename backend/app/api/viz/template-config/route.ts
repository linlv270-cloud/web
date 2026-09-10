import { getVizTemplateConfig, resolveTemplateSubtitle } from "../../../../lib/viz-template";

export async function GET() {
  try {
    const config = getVizTemplateConfig();
    const resolvedSubtitle = resolveTemplateSubtitle(config);
    return Response.json({ config, resolvedSubtitle });
  } catch (error) {
    return Response.json({ error: "获取模板配置失败" }, { status: 500 });
  }
}
