import { one, run } from "./database";
import { cleanText, contentSafety } from "./security";
import type { RedbookAlgorithmSettings } from "./types";

export const defaultRedbookSettings: RedbookAlgorithmSettings = {
  enabled: true,
  name: "红薯算法",
  version: "2.0",
  systemPrompt: [
    "为创意人生成一篇真实、克制、适合小红书阅读的中文图文文案。",
    "正文必须以用户本人第一人称“我”或“我们”讲述，不使用第三方品牌介绍口吻。",
    "主题必须单一，明确目标人群和使用场景；开头直接进入重点，正文提供真实细节、使用价值或选择建议，结尾提出自然具体的问题。",
    "优先参考品牌介绍、作品标签、客群标签、风格标签、现场体验、DIY材料包、荣誉和加分项。",
    "升级生成必须先提取图片中可以直接确认的视觉事实，并把至少两项图片细节自然写入正文。",
    "从全部标签中选择与单一主题最相关的内容进行润色，不把标签逐项罗列成清单。",
    "只能使用资料中明确存在的事实。不得编造材质、价格、销量、客户评价、功效、活动名称和公开行程。",
    "标题与正文合计必须达到450字且不得超过500字，不输出联系方式，不使用绝对化承诺、夸大宣传、竞品拉踩或生硬求赞。",
  ].join("\n"),
  titleTemplates: [
    "{客群}会喜欢的{风格}{作品}",
    "把{作品}做成{风格}，是什么体验",
    "关于{作品}，这次认真说说{品牌}",
    "如果你也喜欢{风格}，看看这件{作品}",
    "一件{作品}，藏着{品牌}的日常",
    "适合{客群}的{作品}，不必太复杂",
  ],
  openingTemplates: [
    "如果你正在找{风格}的{作品}，这次想把它认真介绍给你。",
    "做{作品}的时候，我们最在意的不是热闹，而是它是否真正适合{客群}。",
    "这是一件很像{品牌}的作品：{风格}，也保留了清楚的使用场景。",
    "比起堆叠卖点，我们更想从一件{作品}开始，说说{品牌}在做什么。",
  ],
  closingTemplates: [
    "你更在意一件作品的风格，还是它真实的使用体验？",
    "如果是你，会把它放进怎样的生活场景里？",
    "你还想了解它的制作过程，还是更多使用方式？",
    "你更喜欢克制的表达，还是更鲜明的设计？",
  ],
  complianceRules: [
    "不虚构图片中无法确认的信息",
    "已提交的活动计划由程序追加为公开见面日期；选择近期无计划时不写日期",
    "不披露手机号、微信号等联系方式",
    "不使用第一、最强、百分百、必买、根治等绝对化或功效承诺",
    "不诱导站外交易，不拉踩竞品",
    "标题和正文合计不超过500字",
  ].join("\n"),
};

function parseStored(value: string | undefined): Partial<RedbookAlgorithmSettings> {
  try {
    return value ? JSON.parse(value) as Partial<RedbookAlgorithmSettings> : {};
  } catch {
    return {};
  }
}

function cleanTemplates(value: unknown, fallback: string[]) {
  if (!Array.isArray(value)) return fallback;
  const templates = value
    .map((item) => cleanText(item, 160))
    .filter(Boolean)
    .slice(0, 30);
  return templates.length ? templates : fallback;
}

export function getRedbookSettings(): RedbookAlgorithmSettings {
  const stored = parseStored(
    one<{ value: string }>("SELECT value FROM platform_settings WHERE key = 'redbook_algorithm'")?.value,
  );
  const migrateText = (value: string) => value
    .replaceAll("标题与正文目标合计430至490个中文字符", "标题与正文合计必须达到450字且不得超过500字")
    .replaceAll("不把已有约期写成公开活动", "已提交的活动计划由程序追加为公开见面日期；选择近期无计划时不写日期");
  return {
    enabled: stored.enabled !== false,
    name: cleanText(stored.name || defaultRedbookSettings.name, 30),
    version: cleanText(stored.version || defaultRedbookSettings.version, 20),
    systemPrompt: migrateText(cleanText(stored.systemPrompt || defaultRedbookSettings.systemPrompt, 4000)),
    titleTemplates: cleanTemplates(stored.titleTemplates, defaultRedbookSettings.titleTemplates),
    openingTemplates: cleanTemplates(stored.openingTemplates, defaultRedbookSettings.openingTemplates),
    closingTemplates: cleanTemplates(stored.closingTemplates, defaultRedbookSettings.closingTemplates),
    complianceRules: migrateText(cleanText(stored.complianceRules || defaultRedbookSettings.complianceRules, 3000)),
  };
}

export function updateRedbookSettings(input: Partial<RedbookAlgorithmSettings>) {
  const current = getRedbookSettings();
  const settings: RedbookAlgorithmSettings = {
    enabled: input.enabled ?? current.enabled,
    name: cleanText(input.name ?? current.name, 30) || current.name,
    version: cleanText(input.version ?? current.version, 20) || current.version,
    systemPrompt: cleanText(input.systemPrompt ?? current.systemPrompt, 4000) || current.systemPrompt,
    titleTemplates: cleanTemplates(input.titleTemplates, current.titleTemplates),
    openingTemplates: cleanTemplates(input.openingTemplates, current.openingTemplates),
    closingTemplates: cleanTemplates(input.closingTemplates, current.closingTemplates),
    complianceRules: cleanText(input.complianceRules ?? current.complianceRules, 3000) || current.complianceRules,
  };
  const safety = contentSafety(
    settings.name,
    settings.systemPrompt,
    settings.complianceRules,
    ...settings.titleTemplates,
    ...settings.openingTemplates,
    ...settings.closingTemplates,
  );
  if (safety) throw new Error(safety);
  run(
    `INSERT INTO platform_settings(key, value) VALUES ('redbook_algorithm', ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP`,
    JSON.stringify(settings),
  );
  return settings;
}
