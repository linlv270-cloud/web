import type { DesignBrief } from "./types";

/**
 * 自研 SVG 矢量海报渲染引擎（借鉴 LotGo「三层约束兜底随机」方法论）。
 *
 * 固定层：TDE 主视觉（透明镜子——容器与位置锁定，字形与装饰随风格更换）。
 * 约束层：风格底稿（字形/配色/装饰）+ 网格骨架（正交/曲线/拼贴）+ 元素区（brief.elements）。
 * 画布：1000×1333（3:4 竖版，市集海报主流）。
 * 输出：受控 SVG 字符串，同时供浏览器预览与印刷导出（PDF 转换器按同一契约解析）。
 */

export const POSTER_WIDTH = 1000;
export const POSTER_HEIGHT = 1333;

type StyleSheet = {
  tde: "retro" | "chinese" | "minimal" | "cyber" | "japanese" | "hand";
  bgTexture: "halftone" | "rice" | "linework" | "wash" | "grid" | "none";
  decors: string[];
  titleLayout: "center" | "left" | "vertical";
  accentShape: "seal" | "stamp" | "dot" | "frame" | "slash" | "circle";
};

const STYLE_SHEETS: Record<string, StyleSheet> = {
  "复古胶片": { tde: "retro", bgTexture: "halftone", decors: ["frame", "halftoneCircle"], titleLayout: "center", accentShape: "stamp" },
  "新中式国风": { tde: "chinese", bgTexture: "wash", decors: ["seal", "cloud"], titleLayout: "center", accentShape: "seal" },
  "日式侘寂": { tde: "japanese", bgTexture: "rice", decors: ["circle", "frame"], titleLayout: "center", accentShape: "circle" },
  "极简留白": { tde: "minimal", bgTexture: "none", decors: ["dot", "line"], titleLayout: "left", accentShape: "dot" },
  "赛博霓虹": { tde: "cyber", bgTexture: "grid", decors: ["scanline", "frame"], titleLayout: "left", accentShape: "frame" },
  "森系自然": { tde: "hand", bgTexture: "linework", decors: ["leaf", "circle"], titleLayout: "left", accentShape: "dot" },
  "文艺手账": { tde: "hand", bgTexture: "linework", decors: ["tape", "dot"], titleLayout: "left", accentShape: "stamp" },
  "港风海报": { tde: "retro", bgTexture: "halftone", decors: ["frame", "halftoneCircle"], titleLayout: "center", accentShape: "stamp" },
  "欧式古典": { tde: "retro", bgTexture: "linework", decors: ["frame", "circle"], titleLayout: "center", accentShape: "frame" },
  "孟菲斯撞色": { tde: "minimal", bgTexture: "halftone", decors: ["dot", "slash"], titleLayout: "left", accentShape: "slash" },
  "黑白版画": { tde: "chinese", bgTexture: "linework", decors: ["frame", "seal"], titleLayout: "center", accentShape: "seal" },
  "水墨写意": { tde: "chinese", bgTexture: "wash", decors: ["cloud", "seal"], titleLayout: "center", accentShape: "seal" },
};

const FALLBACK_STYLE: StyleSheet = { tde: "retro", bgTexture: "halftone", decors: ["frame"], titleLayout: "center", accentShape: "stamp" };

function resolveStyle(styleKey: string): StyleSheet {
  const key = String(styleKey || "").trim();
  if (STYLE_SHEETS[key]) return STYLE_SHEETS[key];
  if (/国风|中式|水墨|版画|敦煌|山海|节气/.test(key)) return STYLE_SHEETS["新中式国风"];
  if (/极简|留白|性冷淡/.test(key)) return STYLE_SHEETS["极简留白"];
  if (/赛博|霓虹|科技|电子/.test(key)) return STYLE_SHEETS["赛博霓虹"];
  if (/日式|侘寂|和风/.test(key)) return STYLE_SHEETS["日式侘寂"];
  if (/森系|自然|植物|田园/.test(key)) return STYLE_SHEETS["森系自然"];
  if (/复古|胶片|港风|古典|欧式/.test(key)) return STYLE_SHEETS["复古胶片"];
  return FALLBACK_STYLE;
}

function fontStack(kind: string): string {
  if (kind === "display") return `'Songti SC', 'SimSun', 'Noto Serif SC', serif`;
  if (kind === "hand") return `'Kaiti SC', 'STKaiti', 'KaiTi', 'Songti SC', serif`;
  if (kind === "sans") return `'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif`;
  return `'Songti SC', 'SimSun', 'Noto Serif SC', serif`;
}

/** 透明镜子：TDE 三字固定位置，字形随风格换 */
function tdeMark(sheet: StyleSheet, palette: DesignBrief["palette"]): string {
  const x = 500;
  const y = 158;
  const letterSpacing = 26;
  const fill = palette.primary;
  const stroke = palette.accent;
  const parts: string[] = [];
  const letters = ["T", "D", "E"];
  const startX = x - 46 - letterSpacing;
  letters.forEach((letter, index) => {
    const lx = startX + index * (92 + letterSpacing);
    if (sheet.tde === "retro") {
      parts.push(
        `<text x="${lx}" y="${y}" font-family="'Songti SC', 'SimSun', serif" font-size="128" font-weight="900" fill="${fill}" stroke="${stroke}" stroke-width="2" text-anchor="middle">${letter}</text>`,
      );
    } else if (sheet.tde === "chinese") {
      parts.push(
        `<text x="${lx}" y="${y}" font-family="'Songti SC', 'SimSun', serif" font-size="132" font-weight="700" fill="${fill}" text-anchor="middle">${letter}</text>`,
      );
      parts.push(
        `<rect x="${lx - 46}" y="${y - 92}" width="92" height="116" rx="8" fill="none" stroke="${stroke}" stroke-width="3"/>`,
      );
    } else if (sheet.tde === "cyber") {
      parts.push(
        `<text x="${lx}" y="${y}" font-family="'PingFang SC', sans-serif" font-size="124" font-weight="900" fill="${stroke}" text-anchor="middle">${letter}</text>`,
      );
      parts.push(
        `<text x="${lx}" y="${y}" font-family="'PingFang SC', sans-serif" font-size="124" font-weight="900" fill="none" stroke="${fill}" stroke-width="2" text-anchor="middle">${letter}</text>`,
      );
    } else if (sheet.tde === "japanese") {
      parts.push(
        `<text x="${lx}" y="${y}" font-family="'PingFang SC', sans-serif" font-size="120" font-weight="600" fill="${fill}" text-anchor="middle">${letter}</text>`,
      );
    } else if (sheet.tde === "hand") {
      parts.push(
        `<text x="${lx}" y="${y}" font-family="'Kaiti SC', 'STKaiti', serif" font-size="122" font-weight="700" fill="${fill}" text-anchor="middle">${letter}</text>`,
      );
      parts.push(
        `<circle cx="${lx + 46}" cy="${y - 84}" r="6" fill="${stroke}"/>`,
      );
    } else {
      parts.push(
        `<text x="${lx}" y="${y}" font-family="'PingFang SC', sans-serif" font-size="124" font-weight="800" fill="${fill}" text-anchor="middle">${letter}</text>`,
      );
    }
  });
  return parts.join("\n");
}

function gridBackdrop(gridKey: string, palette: DesignBrief["palette"]): string {
  const stroke = palette.accent;
  const soft = `${stroke}33`;
  if (gridKey === "curve") {
    return [
      `<path d="M -100 300 C 300 180, 700 480, 1100 320 L 1100 0 L -100 0 Z" fill="${palette.primary}0D"/>`,
      `<path d="M -100 520 C 320 380, 760 620, 1100 460 L 1100 1333 L -100 1333 Z" fill="${palette.primary}0A"/>`,
      `<path d="M -100 900 C 360 760, 720 1000, 1100 840" fill="none" stroke="${soft}" stroke-width="2"/>`,
    ].join("\n");
  }
  if (gridKey === "collage") {
    return [
      `<rect x="0" y="0" width="1000" height="420" fill="${palette.primary}0D"/>`,
      `<rect x="0" y="1180" width="1000" height="153" fill="${palette.accent}14"/>`,
      `<circle cx="120" cy="700" r="90" fill="none" stroke="${soft}" stroke-width="1.5"/>`,
      `<circle cx="880" cy="720" r="56" fill="none" stroke="${soft}" stroke-width="1.5"/>`,
    ].join("\n");
  }
  // orthogonal
  const lines: string[] = [];
  for (let i = 1; i < 10; i += 1) {
    lines.push(`<line x1="${i * 100}" y1="0" x2="${i * 100}" y2="1333" stroke="${soft}" stroke-width="1"/>`);
  }
  for (let i = 1; i < 13; i += 1) {
    lines.push(`<line x1="0" y1="${i * 100}" x2="1000" y2="${i * 100}" stroke="${soft}" stroke-width="1"/>`);
  }
  return lines.join("\n");
}

function decors(sheet: StyleSheet, palette: DesignBrief["palette"]): string {
  const parts: string[] = [];
  const accent = palette.accent;
  const primary = palette.primary;
  for (const decor of sheet.decors) {
    if (decor === "frame") {
      parts.push(`<rect x="36" y="36" width="928" height="1261" rx="6" fill="none" stroke="${primary}" stroke-width="3"/>`);
      parts.push(`<rect x="48" y="48" width="904" height="1237" rx="4" fill="none" stroke="${primary}" stroke-width="1"/>`);
    }
    if (decor === "halftoneCircle") {
      parts.push(`<circle cx="870" cy="380" r="150" fill="none" stroke="${accent}" stroke-width="1" stroke-dasharray="2 14"/>`);
    }
    if (decor === "seal") {
      parts.push(
        `<g transform="translate(826, 512)"><rect x="-34" y="-34" width="68" height="68" rx="6" fill="${accent}"/><text x="0" y="12" font-family="'Songti SC', serif" font-size="40" font-weight="700" fill="#FFFFFF" text-anchor="middle">集</text></g>`,
      );
    }
    if (decor === "circle") {
      parts.push(`<circle cx="130" cy="470" r="70" fill="none" stroke="${accent}" stroke-width="2"/>`);
      parts.push(`<circle cx="130" cy="470" r="46" fill="${accent}"/>`);
    }
    if (decor === "dot") {
      parts.push(`<circle cx="880" cy="560" r="10" fill="${accent}"/>`);
      parts.push(`<circle cx="120" cy="620" r="7" fill="${primary}"/>`);
    }
    if (decor === "line") {
      parts.push(`<line x1="80" y1="560" x2="240" y2="560" stroke="${accent}" stroke-width="6"/>`);
      parts.push(`<line x1="920" y1="900" x2="760" y2="900" stroke="${accent}" stroke-width="4"/>`);
    }
    if (decor === "slash") {
      parts.push(`<path d="M 780 300 L 920 160" stroke="${accent}" stroke-width="14"/>`);
      parts.push(`<path d="M 840 520 L 980 380" stroke="${primary}" stroke-width="8"/>`);
    }
    if (decor === "cloud") {
      parts.push(`<path d="M 120 1240 q 40 -60 90 -10 q 60 -40 80 30 Z" fill="${accent}22" stroke="${accent}" stroke-width="2"/>`);
    }
    if (decor === "scanline") {
      for (let i = 0; i < 8; i += 1) {
        parts.push(`<line x1="0" y1="${1040 + i * 34}" x2="1000" y2="${1040 + i * 34}" stroke="${primary}1A" stroke-width="2"/>`);
      }
    }
    if (decor === "leaf") {
      parts.push(`<circle cx="140" cy="300" r="26" fill="${accent}"/>`);
      parts.push(`<circle cx="150" cy="312" r="13" fill="${palette.background}"/>`);
    }
    if (decor === "tape") {
      parts.push(`<rect x="60" y="240" width="180" height="34" rx="4" fill="${accent}33" transform="rotate(-3 150 257)"/>`);
    }
  }
  return parts.join("\n");
}

function escapeXml(text: string): string {
  return String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderElement(
  element: DesignBrief["elements"][number],
  palette: DesignBrief["palette"],
  sheet: StyleSheet,
): string {
  const x = (element.x / 100) * POSTER_WIDTH;
  const y = (element.y / 100) * POSTER_HEIGHT;
  const color = palette[element.color as keyof DesignBrief["palette"]] || palette.text;
  const anchor = element.align;
  const fontFamily = fontStack(element.font);
  let text = escapeXml(element.text);
  if (element.kind === "title") {
    if (sheet.titleLayout === "vertical" && text.length <= 6) {
      const chars = text.split("");
      const lineHeight = element.size + 8;
      const startY = y - ((chars.length - 1) * lineHeight) / 2;
      return chars
        .map((char, index) => {
          return `<text x="${x}" y="${startY + index * lineHeight}" font-family="${fontFamily}" font-size="${element.size}" font-weight="900" fill="${color}" text-anchor="${anchor}">${escapeXml(char)}</text>`;
        })
        .join("\n");
    }
    return `<text x="${x}" y="${y}" font-family="${fontFamily}" font-size="${element.size}" font-weight="900" fill="${color}" text-anchor="${anchor}">${text}</text>`;
  }
  if (element.kind === "slogan") {
    return [
      `<line x1="${Math.max(60, x - element.size * 2.2)}" y1="${y + 10}" x2="${Math.min(940, x - 30)}" y2="${y + 10}" stroke="${color}" stroke-width="3"/>`,
      `<text x="${x}" y="${y}" font-family="${fontFamily}" font-size="${element.size}" font-weight="700" fill="${color}" text-anchor="middle">${text}</text>`,
      `<line x1="${Math.min(940, x + 30)}" y1="${y + 10}" x2="${Math.min(940, x + element.size * 2.2)}" y2="${y + 10}" stroke="${color}" stroke-width="3"/>`,
    ].join("\n");
  }
  if (element.kind === "badge") {
    return `<g><rect x="${x - 16}" y="${y - element.size - 12}" width="${element.size * text.length * 0.62 + 32}" height="${element.size + 24}" rx="18" fill="${palette.accent}"/>` +
      `<text x="${x + element.size * text.length * 0.31}" y="${y}" font-family="${fontFamily}" font-size="${element.size}" font-weight="700" fill="#FFFFFF" text-anchor="middle">${text}</text></g>`;
  }
  const rotate = element.rotate ? ` transform="rotate(${element.rotate} ${x} ${y})"` : "";
  return `<text x="${x}" y="${y}" font-family="${fontFamily}" font-size="${element.size}" font-weight="600" fill="${color}" text-anchor="${anchor}"${rotate}>${text}</text>`;
}

export type PosterOptions = {
  bleed?: boolean;
};

/**
 * 生成矢量海报 SVG。
 * brief：AI 输出的结构化设计描述；opts.bleed=true 时外扩 3mm 出血线（印刷导出用）。
 */
export function buildPosterSvg(brief: DesignBrief, options: PosterOptions = {}): string {
  const sheet = resolveStyle(brief.style_key);
  const palette = brief.palette;
  const parts: string[] = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${POSTER_WIDTH}" height="${POSTER_HEIGHT}" viewBox="0 0 ${POSTER_WIDTH} ${POSTER_HEIGHT}">`,
  );
  parts.push(
    `<metadata><tde-doc><cmyk-note>RGB 预览版。印刷请导出 CMYK PDF（文字已转曲）或导入 AI/CDR 转换分色。</cmyk-note><style>${escapeXml(brief.style_key)}</style><grid>${escapeXml(brief.grid_key)}</grid><theme>${escapeXml(brief.theme)}</theme></tde-doc></metadata>`,
  );
  parts.push(`<rect x="0" y="0" width="${POSTER_WIDTH}" height="${POSTER_HEIGHT}" fill="${palette.background}"/>`);
  parts.push(gridBackdrop(brief.grid_key, palette));
  parts.push(decors(sheet, palette));
  parts.push(`<g id="tde-mark">`);
  parts.push(tdeMark(sheet, palette));
  parts.push(`</g>`);
  const sorted = [...brief.elements].sort((a, b) => a.y - b.y || a.x - b.x);
  for (const element of sorted) {
    parts.push(renderElement(element, palette, sheet));
  }
  // 底部品牌条
  parts.push(`<text x="500" y="1292" font-family="'PingFang SC', sans-serif" font-size="20" letter-spacing="8" fill="${palette.text}" text-anchor="middle" opacity="0.85">T H E   D E S I G N   E X P O</text>`);
  if (options.bleed) {
    // 出血线：3mm 外扩（按 1000px≈297mm 近似，3mm≈10px）
    parts.push(
      `<rect x="-10" y="-10" width="${POSTER_WIDTH + 20}" height="${POSTER_HEIGHT + 20}" fill="none" stroke="#000000" stroke-width="1" stroke-dasharray="8 6"/>`,
    );
    parts.push(
      `<rect x="0" y="0" width="${POSTER_WIDTH}" height="${POSTER_HEIGHT}" fill="none" stroke="#FF0000" stroke-width="1"/>`,
    );
  }
  parts.push(`</svg>`);
  return parts.join("\n");
}
