import crypto from "node:crypto";
import type { DesignBrief } from "./types";

// ===== API Key 加密（AES-256-GCM）=====

const DESIGN_SECRET_ENV = "QIDENG_DESIGN_KEY_SECRET";

function designSecret(): Buffer {
  const secret = process.env[DESIGN_SECRET_ENV] || "dev-only-design-secret-do-not-use-in-prod";
  if (!process.env[DESIGN_SECRET_ENV] && process.env.NODE_ENV === "production") {
    throw new Error(`${DESIGN_SECRET_ENV} 未配置，禁止在生产环境使用默认密钥`);
  }
  return crypto.scryptSync(secret, "tde-design-v1", 32);
}

export function encryptDesignKey(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", designSecret(), iv);
  const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString("base64")}:${tag.toString("base64")}:${encrypted.toString("base64")}`;
}

export function decryptDesignKey(stored: string): string {
  const [version, ivB64, tagB64, dataB64] = stored.split(":");
  if (version !== "v1" || !ivB64 || !tagB64 || !dataB64) {
    throw new Error("API Key 密文格式不正确");
  }
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    designSecret(),
    Buffer.from(ivB64, "base64"),
  );
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

export function maskDesignKey(plain: string): string {
  if (!plain) return "";
  if (plain.length <= 8) return "****";
  return `${plain.slice(0, 4)}****${plain.slice(-4)}`;
}

// ===== 豆包调用（OpenAI 兼容 /chat/completions）=====

type DoubaoOptions = {
  baseUrl: string;
  apiKey: string;
  model: string;
  messages: Array<{ role: "system" | "user"; content: string }>;
  temperature?: number;
  timeoutMs?: number;
};

export async function callDoubaoChat(options: DoubaoOptions): Promise<string> {
  const {
    baseUrl,
    apiKey,
    model,
    messages,
    temperature = 0.8,
    timeoutMs = 90_000,
  } = options;
  const endpoint = `${baseUrl.replace(/\/$/, "")}/chat/completions`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        temperature,
        response_format: { type: "json_object" },
      }),
      signal: controller.signal,
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(`豆包接口返回 ${response.status}：${detail.slice(0, 200) || "请检查 API Key 和模型配置"}`);
    }
    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data.choices?.[0]?.message?.content || "";
    if (!content) throw new Error("豆包接口未返回内容");
    return content;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("豆包接口响应超时，请重试");
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

// ===== 结构化设计描述生成 =====

const SYSTEM_PROMPT = `你是 TDE 市集海报的「结构化设计描述器」。你只输出一个 JSON 对象，不输出任何其他文字、解释或代码块标记。

输入：节气信息（档期）+ 标签组合（策划字段）。
输出 JSON 必须严格符合下面的结构，字段名不可增删改：

{
  "prompt": "一段完整的提示词文本（中文，200-400字），用于交给策划/设计 skill：包含节气档期、主题、风格、客群、主理人身份、作品品类、限定礼物、体验项目、活动档期，以及视觉执行要点。要求稳定、精准、可直接执行。",
  "brief": {
    "theme": "主题名（4-6字，优先取标签 theme_name，否则按节气提炼）",
    "slogan": "一句宣传语（8-16字，押韵或对仗，贴合节气意象）",
    "subtitle": "副标题（如：TDE × 立春 · 城市手作市集）",
    "style_key": "风格，只能从标签 style 中选一个",
    "grid_key": "orthogonal | curve | collage 三选一",
    "palette": {"background": "#六位十六进制", "primary": "#...", "accent": "#...", "text": "#..."},
    "title_font": "serif | sans | display | hand 四选一",
    "body_font": "serif | sans 二选一",
    "elements": [
      {"kind":"title","text":"主题名","font":"serif","size":88,"color":"primary","x":10,"y":28,"align":"left"},
      {"kind":"subtitle","text":"副标题","font":"sans","size":24,"color":"text","x":10,"y":60,"align":"left"},
      {"kind":"slogan","text":"宣传语","font":"sans","size":32,"color":"accent","x":10,"y":72,"align":"center"},
      {"kind":"body","text":"主理人身份、作品品类、限定礼物、体验项目，用顿号分隔的要点句","font":"sans","size":19,"color":"text","x":10,"y":82,"align":"left"},
      {"kind":"badge","text":"档期：XX（取自标签 schedule）","font":"sans","size":18,"color":"accent","x":10,"y":92,"align":"left"}
    ],
    "note": "一句设计说明"
  }
}

规则：
1. 画布为 3:4 竖版（1000×1333），元素坐标 x/y 是百分比整数（0-100），元素从左到右、从上到下排布，不得超出画布。
2. brief.palette 必须是具体色值；elements 里 color 只允许填 "background" / "primary" / "accent" / "text" 四个 key 之一，不允许直接写色值。
3. TDE 主视觉（三个字母 TDE）由渲染引擎固定放置，elements 里禁止出现 kind=tde。
4. 风格决定字体倾向：复古→display/serif，国风→serif，日式/极简→sans，赛博→display。
5. elements 必须包含 title、subtitle、slogan、body、badge 五种 kind，共 5-8 个元素。
6. body 文本必须包含标签里的主理人身份、作品品类、限定礼物、体验项目信息；badge 文本必须包含档期信息。
7. slogan 贴合节气意象（如立春用“东风醒物、好物相逢”这类）。
8. prompt 与 brief 内容必须一致，不得相互矛盾。`;

export type TagComboItem = { category: string; category_name: string; value: string };

export function buildBriefUserPrompt(term: { name: string; month_day: string; theme_hint: string }, combo: TagComboItem[]): string {
  const lines = [
    `节气档期：${term.name}（参考日期 ${term.month_day}，意象：${term.theme_hint}）`,
    "标签组合：",
    ...combo.map((item) => `- ${item.category_name}：${item.value}`),
  ];
  return lines.join("\n");
}

export type BriefGenerationResult = {
  prompt: string;
  brief: DesignBrief;
};

function pickText(content: unknown, key: string, fallback: string): string {
  const raw = String(content || "").trim();
  return raw ? raw : fallback;
}

export function parseBriefJson(content: string): BriefGenerationResult {
  let data: unknown;
  try {
    data = JSON.parse(content);
  } catch {
    throw new Error("AI 返回内容不是有效 JSON，请重新生成");
  }
  const root = data as {
    prompt?: unknown;
    brief?: Record<string, unknown>;
  };
  const brief = (root.brief || {}) as Record<string, unknown>;
  const palette = (brief.palette || {}) as Record<string, unknown>;
  const elements = Array.isArray(brief.elements) ? brief.elements : [];
  const requiredKinds = ["title", "subtitle", "slogan", "body", "badge"];
  for (const kind of requiredKinds) {
    if (!elements.some((item) => (item as { kind?: string }).kind === kind)) {
      throw new Error(`AI 输出缺少 ${kind} 元素，请重新生成`);
    }
  }
  const result: BriefGenerationResult = {
    prompt: pickText(root.prompt, "prompt", ""),
    brief: {
      theme: pickText(brief.theme, "theme", "TDE 市集"),
      slogan: pickText(brief.slogan, "slogan", "好物相逢"),
      subtitle: pickText(brief.subtitle, "subtitle", "TDE 城市手作市集"),
      style_key: pickText(brief.style_key, "style_key", "极简留白"),
      grid_key: ["orthogonal", "curve", "collage"].includes(String(brief.grid_key))
        ? (String(brief.grid_key) as DesignBrief["grid_key"])
        : "orthogonal",
      palette: {
        background: pickText(palette.background, "background", "#F4F3EE"),
        primary: pickText(palette.primary, "primary", "#1A1B1C"),
        accent: pickText(palette.accent, "accent", "#B74942"),
        text: pickText(palette.text, "text", "#333333"),
      },
      title_font: ["serif", "sans", "display", "hand"].includes(String(brief.title_font))
        ? (String(brief.title_font) as DesignBrief["title_font"])
        : "serif",
      body_font: ["serif", "sans"].includes(String(brief.body_font))
        ? (String(brief.body_font) as DesignBrief["body_font"])
        : "sans",
      elements: elements.slice(0, 8).map((item) => {
        const el = item as Record<string, unknown>;
        const kind = String(el.kind || "body");
        const color = ["background", "primary", "accent", "text"].includes(String(el.color))
          ? String(el.color)
          : "text";
        const align = ["left", "center", "right"].includes(String(el.align))
          ? (String(el.align) as "left" | "center" | "right")
          : "left";
        return {
          kind: kind as DesignBrief["elements"][number]["kind"],
          text: String(el.text || "").slice(0, 120),
          font: String(el.font || "sans"),
          size: Math.min(140, Math.max(10, Number(el.size) || 20)),
          color,
          x: Math.min(90, Math.max(2, Number(el.x) || 10)),
          y: Math.min(95, Math.max(2, Number(el.y) || 50)),
          align,
          rotate: Number(el.rotate) || 0,
        };
      }),
      note: pickText(brief.note, "note", ""),
    },
  };
  if (!result.prompt) throw new Error("AI 输出缺少提示词文本，请重新生成");
  return result;
}

/**
 * 一键生成：输入节气 + 标签组合 + 操作员豆包配置，返回提示词 + 结构化设计描述。
 * 消耗操作员自己的 Key 算力（BYOK）。
 */
export async function generateDesignBrief(input: {
  term: { name: string; month_day: string; theme_hint: string };
  combo: TagComboItem[];
  apiKey: string;
  baseUrl: string;
  model: string;
}): Promise<BriefGenerationResult> {
  if (!input.apiKey) throw new Error("该操作员未配置 API Key，请联系管理员");
  if (!input.model) throw new Error("该操作员未配置模型，请联系管理员");
  const userContent = buildBriefUserPrompt(input.term, input.combo);
  const raw = await callDoubaoChat({
    baseUrl: input.baseUrl,
    apiKey: input.apiKey,
    model: input.model,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userContent },
    ],
  });
  return parseBriefJson(raw);
}
