import { getObject } from "./storage";
import sharp from "sharp";
import type { CreatorProfile, RedbookAlgorithmSettings } from "./types";

export type CopyResult = { title: string; body: string };
export type UpgradeCopyResult = CopyResult & { visualFacts: string[]; usedTags: string[] };

function displayDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return "";
  return `${year}年${month}月${day}日`;
}

function publicScheduleSentences(creator: CreatorProfile) {
  if (creator.noBookings) return [];
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  return (creator.busyPeriods || [])
    .filter((period) => period.endDate >= today)
    .slice(0, 3)
    .map((period) => period.startDate === period.endDate
      ? `${displayDate(period.startDate)}，我会在线下和大家见面。`
      : `${displayDate(period.startDate)}至${displayDate(period.endDate)}，我会在线下和大家见面。`)
    .filter(Boolean);
}

function topicLine(labels: string[]) {
  return [...new Set(labels.map((item) => item.trim()).filter(Boolean))]
    .slice(0, 5)
    .map((item) => `#${item.replaceAll(/[\s#]+/g, "")}`)
    .join(" ");
}

function finalizeCreatorCopy(creator: CreatorProfile, result: CopyResult, labels: string[]) {
  const normalized = normalizeCopy(result);
  const schedule = publicScheduleSentences(creator);
  const topics = topicLine(labels);
  const suffix = [...schedule, topics].filter(Boolean).join("\n\n");
  const suffixSeparatorLength = suffix ? 2 : 0;
  const bodyWithoutTrailingTopics = normalized.body.replace(/(?:\n\s*)?(?:#[^\s#]+\s*)+$/u, "").trim();
  const available = Math.max(1, 500 - normalized.title.length - suffix.length - suffixSeparatorLength);
  const minimum = Math.min(available, Math.max(1, 450 - normalized.title.length - suffix.length - suffixSeparatorLength));
  const core = expandCreatorBody(creator, trimAtSentence(bodyWithoutTrailingTopics, available), minimum, available);
  return { title: normalized.title, body: suffix ? `${core}\n\n${suffix}` : core };
}

function tag(creator: CreatorProfile, category: string, fallback: string) {
  return creator.tags.find((item) => item.category === category)?.label || fallback;
}

function tags(creator: CreatorProfile, category: string, limit = 3) {
  return creator.tags.filter((item) => item.category === category).slice(0, limit).map((item) => item.label);
}

export function selectGenerationTags(creator: CreatorProfile, variant = 0) {
  const inCategory = (category: string) => creator.tags.filter((item) => item.category === category).map((item) => item.label);
  const rotate = (items: string[], offset = 0) => items.length ? items[Math.abs(variant + offset) % items.length] : "";
  const selected = [
    rotate(inCategory("我的作品")),
    rotate(inCategory("我的风格"), 1),
    rotate([
      ...inCategory("现场体验"),
      ...inCategory("DIY材料包"),
      ...inCategory("我的身份"),
    ], 2),
  ].filter(Boolean);
  for (const item of creator.tags.map((tagItem) => tagItem.label)) {
    if (selected.length >= 3) break;
    if (!selected.includes(item)) selected.push(item);
  }
  return selected.slice(0, 3);
}

function render(template: string, values: Record<string, string>) {
  return Object.entries(values).reduce(
    (result, [key, value]) => result.replaceAll(`{${key}}`, value),
    template,
  );
}

function neutralizeClaims(value: string) {
  return value
    .replaceAll(/1[3-9]\d{9}/g, "")
    .replaceAll(/(?:微信|vx|V信)[:：]?\s*[A-Za-z0-9_-]{4,}/gi, "")
    .replaceAll(/全网第一|行业第一|世界第一/g, "有自己的特点")
    .replaceAll(/最强|最佳|绝对/g, "更适合")
    .replaceAll(/百分百|100%/g, "更有可能")
    .replaceAll(/必买|闭眼入/g, "可以了解")
    .replaceAll(/根治|永久有效/g, "带来改善");
}

function trimAtSentence(value: string, maxLength: number) {
  if (value.length <= maxLength) return value;
  const sliced = value.slice(0, Math.max(0, maxLength - 1));
  const boundary = Math.max(
    sliced.lastIndexOf("。"),
    sliced.lastIndexOf("！"),
    sliced.lastIndexOf("？"),
    sliced.lastIndexOf("；"),
  );
  return `${boundary >= Math.floor(maxLength * 0.55) ? sliced.slice(0, boundary + 1) : sliced}。`;
}

function expandCreatorBody(
  creator: CreatorProfile,
  value: string,
  minimumLength: number,
  maximumLength: number,
) {
  if (value.length >= minimumLength) return value;
  const work = tag(creator, "我的作品", "作品");
  const style = tag(creator, "我的风格", "自己的风格");
  const customer = tag(creator, "我的客群", "愿意认真感受作品的人");
  const brand = creator.brandName || creator.userName || "我的创作";
  const additions = [
    `我愿意把选择和取舍讲清楚：哪些细节来自反复尝试，哪些部分为了真实使用被保留下来。对我来说，制作过程比一句漂亮口号更能说明${work}。`,
    `我也会继续记录它在不同光线、空间和使用方式里的状态，让${work}回到具体生活，而不是只停在一张照片里。`,
    `如果你第一次接触${brand}，可以先从这件${work}开始认识我。它保留了${style}的表达，也留出了让${customer}自己感受和判断的空间。`,
    `我希望每一次分享都能多留下一点有用的信息：看得见的细节、可以理解的过程，以及作品真正进入生活之后的感受。`,
  ];
  let expanded = value.trim();
  for (const addition of additions) {
    if (expanded.length >= minimumLength) break;
    if (expanded.includes(addition.slice(0, 16))) continue;
    const separator = expanded ? "\n\n" : "";
    const room = maximumLength - expanded.length - separator.length;
    if (room < 2) break;
    expanded += `${separator}${trimAtSentence(addition, room)}`;
  }
  return trimAtSentence(expanded, maximumLength);
}

export function normalizeCopy(result: CopyResult): CopyResult {
  const title = neutralizeClaims(String(result.title || "").replace(/[<>\r\n]/g, "").trim()).slice(0, 60);
  const available = Math.max(1, 500 - title.length);
  const body = trimAtSentence(
    neutralizeClaims(String(result.body || "").replace(/[<>]/g, "").trim()),
    available,
  );
  if (!title || !body) throw new Error("生成结果不完整");
  return { title, body };
}

export function generateInternalCopy(
  creator: CreatorProfile,
  settings: RedbookAlgorithmSettings,
  variant: number,
  trendTerms: string[] = [],
  selectedTags = selectGenerationTags(creator, variant),
) {
  const work = tag(creator, "我的作品", "作品");
  const customer = tag(creator, "我的客群", "喜欢原创的人");
  const style = tag(creator, "我的风格", "有自己气质的");
  const identity = tag(creator, "我的身份", "创意人");
  const brand = creator.brandName || creator.userName || "这个品牌";
  const experience = tags(creator, "现场体验", 1);
  const kits = tags(creator, "DIY材料包", 1);
  const values = { 作品: work, 客群: customer, 风格: style, 身份: identity, 品牌: brand };
  const choose = (items: string[], offset = 0) => items[(variant + offset) % items.length];
  const title = render(choose(settings.titleTemplates), values);
  const parts = [`我是${identity}，也是${brand}的创作者。${render(choose(settings.openingTemplates, 1), values)}`];

  if (creator.intro) parts.push(`我通常这样介绍自己：${trimAtSentence(neutralizeClaims(creator.intro), 150)}`);
  if (creator.boothDescription) parts.push(`这次展位会呈现：${neutralizeClaims(creator.boothDescription)}`);
  parts.push(`我一直在创作${work}。从构思、取舍到最后呈现，我更在意作品是否保留${style}的气质，也希望它进入真实生活后依然耐看、好用，让${customer}能感受到细节而不是只看到一串卖点。`);
  if (experience.length) parts.push(`在线下，我可以提供${experience.join("、")}，希望让作品不只停留在观看。`);
  if (kits.length) parts.push(`如果你想把过程带回家，我也准备了${kits.join("、")}。`);
  if (trendTerms.length) parts.push(`最近大家也在关注“${trendTerms.slice(0, 1).join("、")}”，我更想把这种关注放回作品本身，用真实细节和使用场景来回应。`);
  parts.push(`这次我没有把所有信息一次说完，而是先从眼前这件${work}开始。它怎样被制作、适合怎样的场景、又会被谁带走，这些都比夸张的形容更值得慢慢分享。`);
  parts.push(render(choose(settings.closingTemplates, 2), values));

  return finalizeCreatorCopy(creator, { title, body: parts.join("\n\n") }, [...selectedTags, ...trendTerms]);
}

export function generateUpgradeFallback(
  creator: CreatorProfile,
  settings: RedbookAlgorithmSettings,
  variant: number,
  trendTerms: string[] = [],
  selectedTags = selectGenerationTags(creator, variant),
) {
  const base = generateInternalCopy(creator, settings, variant + 3, trendTerms, selectedTags);
  return {
    ...base,
    visualFacts: ["代表图片已由平台保存，本地版本不推测无法确认的图片细节"],
    usedTags: selectedTags,
  };
}

function assetKey(url: string) {
  if (!url.startsWith("/api/assets/")) throw new Error("代表图片地址无效");
  return url.slice("/api/assets/".length).split("/").map(decodeURIComponent).join("/");
}

export function isUpgradeConfigured() {
  return Boolean(
    (process.env.DOUBAO_API_KEY || process.env.ARK_API_KEY) &&
    (process.env.DOUBAO_MODEL || process.env.ARK_MODEL_ENDPOINT),
  );
}

function parseModelJson(value: string, allowedTags: Set<string>): UpgradeCopyResult {
  const block = value.slice(value.indexOf("{"), value.lastIndexOf("}") + 1);
  const cleaned = (block || value).trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const parsed = JSON.parse(cleaned) as {
    title?: unknown;
    body?: unknown;
    visualFacts?: unknown;
    usedTags?: unknown;
  };
  const copy = normalizeCopy({ title: String(parsed.title || ""), body: String(parsed.body || "") });
  const visualFacts = Array.isArray(parsed.visualFacts)
    ? parsed.visualFacts.map((item) => String(item || "").trim()).filter(Boolean).slice(0, 8)
    : [];
  const usedTags = Array.isArray(parsed.usedTags)
    ? [...new Set(parsed.usedTags.map((item) => String(item || "").trim()).filter((item) => allowedTags.has(item)))].slice(0, 12)
    : [];
  return { ...copy, visualFacts, usedTags };
}

async function requestDoubao(
  endpoint: string,
  apiKey: string,
  model: string,
  messages: unknown[],
) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({
      model,
      temperature: 0.55,
      max_tokens: 900,
      response_format: { type: "json_object" },
      messages,
    }),
    signal: AbortSignal.timeout(3500),
  });
  if (!response.ok) throw new Error(`升级生成服务暂时不可用（${response.status}）`);
  const payload = await response.json() as { choices?: Array<{ message?: { content?: string | Array<{ text?: string }> } }> };
  const content = payload.choices?.[0]?.message?.content;
  return Array.isArray(content) ? content.map((item) => item.text || "").join("") : content || "";
}

export async function generateUpgradeCopy(
  creator: CreatorProfile,
  settings: RedbookAlgorithmSettings,
  selectedTags = selectGenerationTags(creator),
  trendTerms: string[] = [],
  onStage?: (stage: "writing" | "checking") => void,
) {
  const apiKey = process.env.DOUBAO_API_KEY || process.env.ARK_API_KEY || "";
  const model = process.env.DOUBAO_MODEL || process.env.ARK_MODEL_ENDPOINT || "";
  if (!apiKey || !model) throw new Error("升级生成暂未开放，请联系客服");
  const image = await getObject(assetKey(creator.workUrls[0]));
  if (!image) throw new Error("代表图片暂时无法读取");
  const optimizedImage = await sharp(image.body)
    .rotate()
    .resize({ width: 512, height: 512, fit: "inside", withoutEnlargement: true })
    .flatten({ background: "#ffffff" })
    .jpeg({ quality: 70, mozjpeg: true })
    .toBuffer();
  const endpoint = process.env.DOUBAO_API_URL || "https://ark.cn-beijing.volces.com/api/v3/chat/completions";
  const profile = {
    brandName: creator.brandName,
    intro: creator.intro.slice(0, 600),
    boothDescription: creator.boothDescription,
    selectedTags,
    localTrendTerms: trendTerms,
    scheduleRule: creator.noBookings
      ? "近期无计划，不写入日期"
      : "约期由程序统一追加，模型正文中不要重复日期",
  };
  const allowedTags = new Set(selectedTags);
  const systemPrompt = `${settings.systemPrompt.slice(0, 2400)}\n\n合规规则：\n${settings.complianceRules.slice(0, 1200)}\n\n不可修改的生成规则：
必须以用户本人第一人称“我/我们”讲述，像创意人亲自发布笔记；禁止使用第三方介绍口吻，不得把用户或品牌写成“他们”“该品牌”“创作者表示”。

生成质量规则：
1. 先识别图片中可以直接确认的主体、形态、颜色、纹理和构图，只记录可靠事实，不推测材质、价格和功效。
2. visualFacts输出1至4条可靠图片事实，正文自然使用能够确认的事实，不得只描述标签。
3. usedTags只能从给定的最多3个标签中选择。
4. 标签必须被转化为自然表达，不得把标签逐项堆叠成清单。
5. 标题建议12至25字；模型输出的标题与正文目标总长度380至435字，绝对不得超过455字，程序会补足至450字并追加活动计划和话题标签。
6. 内容必须有开头重点、图片与作品细节、品牌气质、适合人群或场景、自然互动结尾。

只返回JSON：{"visualFacts":["图片事实"],"usedTags":["原始标签"],"title":"标题","body":"正文"}`;
  onStage?.("writing");
  const firstText = await requestDoubao(endpoint, apiKey, model, [
    { role: "system", content: systemPrompt },
    {
      role: "user",
      content: [
        { type: "text", text: `请结合以下用户资料和代表图片生成文案。不得输出资料之外的事实。\n${JSON.stringify(profile)}` },
        { type: "image_url", image_url: { url: `data:image/jpeg;base64,${optimizedImage.toString("base64")}` } },
      ],
    },
  ]);
  onStage?.("checking");
  const result = parseModelJson(firstText, allowedTags);
  if (result.title.length + result.body.length < 160) throw new Error("生成正文长度不足");
  const finalized = finalizeCreatorCopy(creator, result, result.usedTags.length ? result.usedTags : selectedTags);
  return { ...result, ...finalized };
}
