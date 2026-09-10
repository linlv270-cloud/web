import fs from "node:fs";
import path from "node:path";
import opentype from "opentype.js";

/**
 * SVG → CMYK 矢量 PDF 转换器（印刷版）。
 *
 * 契约：输入为本项目渲染引擎生成的受控 SVG（3:4 竖版，viewport 0 0 W H）。
 * 输出：矢量 PDF（颜色转 CMYK、文字转曲线 outline，印前无需字体、无限放大）。
 *
 * 中文矢量化的前提是系统存在中文字体文件；优先读取环境变量
 * QIDENG_PDF_FONT_PATH，其次项目 fonts/ 目录，再次 macOS 常见字体路径。
 */

type FontKind = "serif" | "sans";

const fontCache = new Map<FontKind, opentype.Font>();

function fontCandidates(kind: FontKind): string[] {
  const env = process.env.QIDENG_PDF_FONT_PATH;
  if (env) return [env];
  const projectFonts = path.join(process.cwd(), "fonts");
  if (kind === "sans") {
    return [
      path.join(projectFonts, "sans.ttf"),
      path.join(projectFonts, "sans.otf"),
      "/System/Library/Fonts/PingFang.ttc",
      "/System/Library/Fonts/Hiragino Sans GB.ttc",
      "/System/Library/Fonts/Supplemental/Arial Unicode.ttf",
    ];
  }
  return [
    path.join(projectFonts, "serif.ttf"),
    path.join(projectFonts, "serif.otf"),
    "/System/Library/Fonts/Supplemental/Songti.ttc",
    "/System/Library/Fonts/STSong.ttf",
    "/System/Library/Fonts/Supplemental/SimSun.ttf",
  ];
}

/**
 * ttc 容器切分：取出第 index 个字体为独立 sfnt。
 * macOS 部分 ttc 为共享表格式：多个字体的 sfnt 头+表目录连续排列在前，
 * 表数据区在文件后部被共享。因此需重建字体：拷贝头+目录，再把每个
 * 表记录指向的数据追加到新 buffer 并把 offset 重映射为相对值。
 */
function extractTtcFont(buffer: Buffer, index: number): Buffer {
  const numFonts = buffer.readUInt32BE(8);
  const offsets: number[] = [];
  for (let i = 0; i < numFonts; i += 1) {
    offsets.push(buffer.readUInt32BE(12 + i * 4));
  }
  if (index >= numFonts) throw new Error(`ttc 字体索引越界：${index}/${numFonts}`);
  const start = offsets[index];
  const numTables = buffer.readUInt16BE(start + 4);
  const headLen = 12 + numTables * 16;
  let sub = Buffer.from(buffer.subarray(start, start + headLen));
  for (let i = 0; i < numTables; i += 1) {
    const entry = 12 + i * 16;
    const tableOffset = sub.readUInt32BE(entry + 8);
    const tableLength = sub.readUInt32BE(entry + 12);
    if (!tableOffset || !tableLength) continue;
    const data = Buffer.from(buffer.subarray(tableOffset, tableOffset + tableLength));
    const aligned = sub.length % 4 === 0 ? sub.length : sub.length + (4 - (sub.length % 4));
    if (aligned > sub.length) sub = Buffer.concat([sub, Buffer.alloc(aligned - sub.length)]);
    const newOffset = sub.length;
    sub = Buffer.concat([sub, data]);
    sub.writeUInt32BE(newOffset, entry + 8);
  }
  return sub;
}

function fontBuffer(candidate: string): Buffer {
  const buffer = fs.readFileSync(candidate);
  if (buffer.length >= 4 && buffer.readUInt32BE(0) === 0x74746366) {
    return extractTtcFont(buffer, 0);
  }
  return buffer;
}

function loadFont(kind: FontKind): opentype.Font {
  const cached = fontCache.get(kind);
  if (cached) return cached;
  for (const candidate of fontCandidates(kind)) {
    if (!fs.existsSync(candidate)) continue;
    try {
      const font = opentype.parse(fontBuffer(candidate)) as opentype.Font;
      fontCache.set(kind, font);
      return font;
    } catch {
      // 尝试下一个候选
    }
  }
  throw new Error(
    `未找到可用的中文字体文件，无法生成印刷 PDF。请在服务器放置字体并配置环境变量 QIDENG_PDF_FONT_PATH（支持 .ttf/.otf/.ttc）。`,
  );
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const value = String(hex || "").replace("#", "").trim();
  if (value.length === 3) {
    return {
      r: parseInt(value[0] + value[0], 16),
      g: parseInt(value[1] + value[1], 16),
      b: parseInt(value[2] + value[2], 16),
    };
  }
  if (value.length !== 6) return { r: 0, g: 0, b: 0 };
  return {
    r: parseInt(value.slice(0, 2), 16),
    g: parseInt(value.slice(2, 4), 16),
    b: parseInt(value.slice(4, 6), 16),
  };
}

/** RGB → CMYK（标准近似公式），返回 [c, m, y, k] 0-1 */
function rgbToCmyk(hex: string): [number, number, number, number] {
  const { r, g, b } = hexToRgb(hex);
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const k = 1 - Math.max(rn, gn, bn);
  if (k >= 1) return [0, 0, 0, 1];
  const c = (1 - rn - k) / (1 - k);
  const m = (1 - gn - k) / (1 - k);
  const y = (1 - bn - k) / (1 - k);
  return [Number(c.toFixed(4)), Number(m.toFixed(4)), Number(y.toFixed(4)), Number(k.toFixed(4))];
}

function cmykCommand(hex: string, fill: boolean): string {
  const [c, m, y, k] = rgbToCmyk(hex);
  return `${c} ${m} ${y} ${k} ${fill ? "k" : "K"}`;
}

// ---- SVG 最小解析（受控结构）----

type SvgElement = {
  tag: string;
  attrs: Record<string, string>;
  content: string;
  children: SvgElement[];
};

const ATTR_RE = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*"([^"]*)"/g;


/** 仅提取 openStart..headEnd 区间内的属性（避免越过标签结束符） */
function attrOf(markup: string, start: number, end: number, re: RegExp): Record<string, string> {
  const out: Record<string, string> = {};
  re.lastIndex = start;
  let m: RegExpExecArray | null;
  while ((m = re.exec(markup))) {
    if (m.index > end) break;
    out[m[1]] = m[2];
  }
  return out;
}

function parseTag(markup: string, start: number): { element: SvgElement; end: number } | null {
  const openStart = markup.indexOf("<", start);
  if (openStart === -1) return null;
  const tagMatch = /^<\s*([a-zA-Z][a-zA-Z0-9]*)/.exec(markup.slice(openStart));
  if (!tagMatch) return null;
  const tag = tagMatch[1];
  const headEnd = markup.indexOf(">", openStart);
  if (headEnd === -1) return null;
  const attrs = attrOf(markup, openStart, headEnd, ATTR_RE);
  const head = markup.slice(openStart, headEnd + 1);
  if (/\/\s*>$/.test(head)) {
    return { element: { tag, attrs, content: "", children: [] }, end: headEnd + 1 };
  }
  const closeTag = `</${tag}`;
  const closeIndex = markup.toLowerCase().indexOf(closeTag.toLowerCase(), headEnd + 1);
  if (closeIndex === -1) return null;
  const inner = markup.slice(headEnd + 1, closeIndex);
  const children: SvgElement[] = [];
  const text = inner.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
  const childRe = /<[a-zA-Z][a-zA-Z0-9]*/g;
  let childMatch: RegExpExecArray | null;
  while ((childMatch = childRe.exec(inner))) {
    const parsed = parseTag(inner, childMatch.index);
    if (!parsed) continue;
    children.push(parsed.element);
  }
  const closeEnd = markup.indexOf(">", closeIndex);
  return {
    element: { tag, attrs, content: text, children },
    end: closeEnd + 1,
  };
}

function parseSvg(svg: string): SvgElement | null {
  const root = parseTag(svg, 0);
  return root?.element.tag === "svg" ? root.element : null;
}

// ---- PDF 内容流生成 ----

type Transform = { a: number; b: number; c: number; d: number; e: number; f: number };
const IDENTITY: Transform = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };

function parseTransform(value: string): Transform {
  let result = IDENTITY;
  const re = /(translate|rotate|scale|matrix)\s*\(([^)]*)\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(value || ""))) {
    const fn = m[1];
    const args = (m[2] || "").split(/[\s,]+/).filter(Boolean).map(Number);
    let t: Transform = IDENTITY;
    if (fn === "translate") {
      t = { ...IDENTITY, e: args[0] || 0, f: args[1] ?? args[0] ?? 0 };
    } else if (fn === "rotate") {
      const rad = ((args[0] || 0) * Math.PI) / 180;
      const cos = Math.cos(rad);
      const sin = Math.sin(rad);
      if (args.length >= 3) {
        const cx = args[1] || 0;
        const cy = args[2] || 0;
        t = {
          a: cos, b: sin, c: -sin, d: cos,
          e: cx - cos * cx + sin * cy,
          f: cy - sin * cx - cos * cy,
        };
      } else {
        t = { a: cos, b: sin, c: -sin, d: cos, e: 0, f: 0 };
      }
    } else if (fn === "scale") {
      t = { ...IDENTITY, a: args[0] ?? 1, d: args.length > 1 ? args[1] : (args[0] ?? 1) };
    } else if (fn === "matrix" && args.length >= 6) {
      t = { a: args[0], b: args[1], c: args[2], d: args[3], e: args[4], f: args[5] };
    }
    result = multiplyTransform(result, t);
  }
  return result;
}

function multiplyTransform(a: Transform, b: Transform): Transform {
  return {
    a: a.a * b.a + a.c * b.b,
    b: a.b * b.a + a.d * b.b,
    c: a.a * b.c + a.c * b.d,
    d: a.b * b.c + a.d * b.d,
    e: a.a * b.e + a.c * b.f + a.e,
    f: a.b * b.e + a.d * b.f + a.f,
  };
}

function applyTransform(x: number, y: number, t: Transform): { x: number; y: number } {
  return { x: t.a * x + t.c * y + t.e, y: t.b * x + t.d * y + t.f };
}

/** SVG path 数据 → PDF path 操作符（局部 SVG 坐标，y 向下；翻转由外层 cm 链完成） */
function svgPathToPdf(d: string): string {
  const tokens = d.match(/[a-zA-Z]|[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/g) || [];
  let out = "";
  let index = 0;
  let cx = 0;
  let cy = 0;
  let startX = 0;
  let startY = 0;
  let lastCmd = "";
  let hasOpenSubpath = false;
  const num = () => Number(tokens[index++]);
  const pt = (relative: boolean) => {
    const x = num();
    const y = num();
    const px = relative ? cx + x : x;
    const py = relative ? cy + y : y;
    return { x: px, y: py };
  };
  while (index < tokens.length) {
    let cmd = tokens[index++];
    if (!cmd || /[a-zA-Z]/.test(cmd) === false) continue;
    if (/[a-zA-Z]/.test(cmd) && cmd.length > 1) {
      index -= 1;
      cmd = lastCmd;
    }
    const relative = cmd === cmd.toLowerCase();
    const up = cmd.toUpperCase();
    if (up === "Z") {
      out += " h";
      cx = startX;
      cy = startY;
      lastCmd = "Z";
      continue;
    }
    if (up === "M") {
      // 新子路径开始前，闭合上一个未闭合子路径（兼容不自动闭合的渲染器）
      if (hasOpenSubpath) out += " h";
      hasOpenSubpath = false;
    }
    if (up === "M" || up === "L") {
      let first = up === "M";
      while (index < tokens.length && /[a-zA-Z]/.test(tokens[index] || "") === false) {
        const p = pt(relative);
        const f = p;
        out += ` ${first ? "m" : "l"} ${fmt(f.x)} ${fmt(f.y)}`;
        hasOpenSubpath = true;
        cx = p.x;
        cy = p.y;
        if (first) {
          startX = p.x;
          startY = p.y;
          first = false;
        }
      }
    } else if (up === "H" || up === "V") {
      while (index < tokens.length && /[a-zA-Z]/.test(tokens[index] || "") === false) {
        const value = num();
        const p = up === "H" ? { x: relative ? cx + value : value, y: cy } : { x: cx, y: relative ? cy + value : value };
        const f = p;
        out += ` l ${fmt(f.x)} ${fmt(f.y)}`;
        cx = p.x;
        cy = p.y;
      }
    } else if (up === "C") {
      while (index + 5 < tokens.length && /[a-zA-Z]/.test(tokens[index] || "") === false) {
        const p1 = pt(relative);
        const p2 = pt(relative);
        const p = pt(relative);
        const f1 = p1;
        const f2 = p2;
        const f = p;
        out += ` c ${fmt(f1.x)} ${fmt(f1.y)} ${fmt(f2.x)} ${fmt(f2.y)} ${fmt(f.x)} ${fmt(f.y)}`;
        cx = p.x;
        cy = p.y;
      }
    } else if (up === "Q") {
      while (index + 3 < tokens.length && /[a-zA-Z]/.test(tokens[index] || "") === false) {
        const q = pt(relative);
        const p = pt(relative);
        const x0 = cx;
        const y0 = cy;
        const c1x = x0 + (2 / 3) * (q.x - x0);
        const c1y = y0 + (2 / 3) * (q.y - y0);
        const c2x = p.x + (2 / 3) * (q.x - p.x);
        const c2y = p.y + (2 / 3) * (q.y - p.y);
        const f1 = { x: c1x, y: c1y };
        const f2 = { x: c2x, y: c2y };
        const f = p;
        out += ` c ${fmt(f1.x)} ${fmt(f1.y)} ${fmt(f2.x)} ${fmt(f2.y)} ${fmt(f.x)} ${fmt(f.y)}`;
        cx = p.x;
        cy = p.y;
      }
    } else if (up === "A") {
      // 弧线：受控引擎不使用，简单用直线近似端点
      const rx = num();
      const ry = num();
      num(); // x-axis-rotation
      num(); // large-arc
      num(); // sweep
      const p = pt(relative);
      const f = p;
      out += ` l ${fmt(f.x)} ${fmt(f.y)}`;
      cx = p.x;
      cy = p.y;
      void rx; void ry;
    }
    lastCmd = cmd;
  }
  if (hasOpenSubpath) out += " h";
  return out || " ";
}

function fmt(value: number): string {
  return String(Math.round(value * 100) / 100);
}


export function svgToCmykPdf(svg: string): Buffer {
  const root = parseSvg(svg);
  if (!root) throw new Error("无法解析 SVG");
  const width = Number(root.attrs.width) || 1000;
  const height = Number(root.attrs.height) || 1333;
  let stream = "";

  const walk = (element: SvgElement, parentTransform: Transform, parentFill: string, parentStroke: string) => {
    const transform = parseTransform(element.attrs.transform);
    const combined = multiplyTransform(parentTransform, transform);
    const fill = element.attrs.fill !== undefined ? element.attrs.fill : parentFill;
    const stroke = element.attrs.stroke !== undefined ? element.attrs.stroke : parentStroke;
    const fillOpacity = Number(element.attrs["fill-opacity"] || element.attrs.opacity || 1);
    const effectiveFill = fillOpacity < 1 && fill !== "none" && fill ? withOpacity(fill, fillOpacity) : fill;
    const fillWidth = Number(element.attrs["stroke-width"] || 1);

    if (element.tag === "text") {
      const fontKind: FontKind = /sans/i.test(element.attrs["font-family"] || "") ? "sans" : "serif";
      const fontSize = Number(element.attrs["font-size"] || 24);
      const anchor = element.attrs["text-anchor"] || "start";
      const x = Number(element.attrs.x || 0);
      const y = Number(element.attrs.y || 0);
      const font = loadFont(fontKind);
      const textWidth = font.getAdvanceWidth(element.content, fontSize);
      let startX = x;
      if (anchor === "middle") startX = x - textWidth / 2;
      if (anchor === "end") startX = x - textWidth;
      // 整串文字转曲线（getPath 已按 fontSize 缩放，基线位于 y=0，SVG y 向下）
      const fullPath = font.getPath(element.content, 0, 0, fontSize);
      const pathData = fullPath.toPathData(2);
      const parts = svgPathToPdf(pathData);
      stream += ` q 1 0 0 -1 0 ${fmt(height)} cm\n`;
      stream += ` q 1 0 0 1 ${fmt(startX)} ${fmt(y)} cm\n`;
      stream += ` q ${fmt(combined.a)} ${fmt(combined.b)} ${fmt(combined.c)} ${fmt(combined.d)} ${fmt(combined.e)} ${fmt(combined.f)} cm\n`;
      if (effectiveFill && effectiveFill !== "none") {
        stream += `${cmykCommand(effectiveFill, true)} ${parts} f\n`;
      }
      stream += " Q\n Q\n Q\n";
      return;
    }

    if (element.tag === "rect") {
      const x = Number(element.attrs.x || 0);
      const y = Number(element.attrs.y || 0);
      const w = Number(element.attrs.width || 0);
      const h = Number(element.attrs.height || 0);
      stream += ` q 1 0 0 -1 0 ${fmt(height)} cm\n q ${fmt(combined.a)} ${fmt(combined.b)} ${fmt(combined.c)} ${fmt(combined.d)} ${fmt(combined.e)} ${fmt(combined.f)} cm\n`;
      if (effectiveFill && effectiveFill !== "none") {
        stream += `${cmykCommand(effectiveFill, true)} ${fmt(x)} ${fmt(y)} ${fmt(w)} ${fmt(h)} re f\n`;
      }
      if (stroke && stroke !== "none" && fillWidth > 0) {
        stream += `${cmykCommand(stroke, false)} ${fmt(x)} ${fmt(y)} ${fmt(w)} ${fmt(h)} re S\n`;
      }
      stream += " Q\n Q\n";
      return;
    }

    if (element.tag === "circle") {
      const cx = Number(element.attrs.cx || 0);
      const cy = Number(element.attrs.cy || 0);
      const r = Number(element.attrs.r || 0);
      const kappa = 0.5522847498;
      const k = r * kappa;
      stream += ` q 1 0 0 -1 0 ${fmt(height)} cm\n q ${fmt(combined.a)} ${fmt(combined.b)} ${fmt(combined.c)} ${fmt(combined.d)} ${fmt(combined.e)} ${fmt(combined.f)} cm\n`;
      if (effectiveFill && effectiveFill !== "none") {
        stream += `${cmykCommand(effectiveFill, true)} ${fmt(cx - r)} ${fmt(cy)} m`;
        stream += ` ${fmt(cx - r)} ${fmt(cy + k)} ${fmt(cx - k)} ${fmt(cy + r)} ${fmt(cx)} ${fmt(cy + r)} c`;
        stream += ` ${fmt(cx + k)} ${fmt(cy + r)} ${fmt(cx + r)} ${fmt(cy + k)} ${fmt(cx + r)} ${fmt(cy)} c`;
        stream += ` ${fmt(cx + r)} ${fmt(cy - k)} ${fmt(cx + k)} ${fmt(cy - r)} ${fmt(cx)} ${fmt(cy - r)} c`;
        stream += ` ${fmt(cx - k)} ${fmt(cy - r)} ${fmt(cx - r)} ${fmt(cy - k)} ${fmt(cx - r)} ${fmt(cy)} c h f\n`;
      }
      stream += " Q\n Q\n";
      return;
    }

    if (element.tag === "line") {
      const x1 = Number(element.attrs.x1 || 0);
      const y1 = Number(element.attrs.y1 || 0);
      const x2 = Number(element.attrs.x2 || 0);
      const y2 = Number(element.attrs.y2 || 0);
      stream += ` q 1 0 0 -1 0 ${fmt(height)} cm\n q ${fmt(combined.a)} ${fmt(combined.b)} ${fmt(combined.c)} ${fmt(combined.d)} ${fmt(combined.e)} ${fmt(combined.f)} cm\n`;
      if (stroke && stroke !== "none") {
        stream += `${cmykCommand(stroke, false)} ${fmt(x1)} ${fmt(y1)} m ${fmt(x2)} ${fmt(y2)} l S\n`;
      }
      stream += " Q\n Q\n";
      return;
    }

    if (element.tag === "path") {
      const d = element.attrs.d || "";
      const parts = svgPathToPdf(d);
      const fillRule = element.attrs["fill-rule"] === "evenodd" ? "f*" : "f";
      stream += ` q 1 0 0 -1 0 ${fmt(height)} cm\n q ${fmt(combined.a)} ${fmt(combined.b)} ${fmt(combined.c)} ${fmt(combined.d)} ${fmt(combined.e)} ${fmt(combined.f)} cm\n`;
      if (effectiveFill && effectiveFill !== "none") {
        stream += `${cmykCommand(effectiveFill, true)} ${parts} ${fillRule}\n`;
      }
      if (stroke && stroke !== "none" && fillWidth > 0) {
        stream += `${cmykCommand(stroke, false)} ${parts} S\n`;
      }
      stream += " Q\n Q\n";
      return;
    }

    for (const child of element.children) {
      walk(child, combined, effectiveFill || "", stroke || "");
    }
  };

  for (const child of root.children) {
    walk(child, IDENTITY, "#1A1B1C", "none");
  }

  const objects: string[] = [];
  objects.push("<< /Type /Catalog /Pages 2 0 R >>");
  objects.push("<< /Type /Pages /Kids [3 0 R] /Count 1 >>");
  objects.push(
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${fmt(width)} ${fmt(height)}] /Contents 4 0 R /Resources << /ProcSet [/PDF] >> >>`,
  );
  const streamBytes = Buffer.from(stream, "utf8");
  objects.push(`<< /Length ${streamBytes.length} >>\nstream\n${stream}\nendstream`);

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((object, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefStart = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  for (const offset of offsets) {
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;
  return Buffer.from(pdf, "utf8");
}

/** 半透明色简化：混合到背景近似（CMYK 印前不支持透明，取 85% 实色近似） */
function withOpacity(hex: string, opacity: number): string {
  if (!hex.startsWith("#") || hex.length !== 7) return hex;
  const { r, g, b } = hexToRgb(hex);
  const blend = 0.85;
  const factor = opacity < 0.9 ? 1 - (1 - opacity) * blend : 1;
  const mix = (channel: number) => Math.round(channel * factor + 255 * (1 - factor));
  return `#${[mix(r), mix(g), mix(b)].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}
