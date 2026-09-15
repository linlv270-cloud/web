import sharp from "sharp";
// qrcode-terminal is already part of the existing miniprogram toolchain.
// Its small matrix generator lets the server keep the existing QR dependency boundary.
// @ts-expect-error qrcode-terminal ships CommonJS sources without TypeScript declarations.
import QRCode from "qrcode-terminal/vendor/QRCode/index.js";
// @ts-expect-error qrcode-terminal ships CommonJS sources without TypeScript declarations.
import QRErrorCorrectLevel from "qrcode-terminal/vendor/QRCode/QRErrorCorrectLevel.js";
import { getClaimedPortraitPresentation, type ClaimedPortraitPresentation } from "./portrait";
import { buildPublicPortraitUrl } from "./public-origin";
import { getObject } from "./storage";

export type PortraitVisualFormat = "share" | "a3" | "a4";

type VisualOutput = {
  body: Buffer;
  contentType: string;
  extension: string;
  filename: string;
};

const SHARE_WIDTH = 1080;
const SHARE_HEIGHT = 1350;
const PRINT_WIDTH = 1200;
const PRINT_HEIGHT = 1697;
const A3_PIXELS = { width: 3508, height: 4961 };
const A4_PIXELS = { width: 2480, height: 3508 };

function xml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function safeFilename(value: string) {
  return value
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80) || "主理人图鉴";
}

function wrapText(value: string, maxChars: number, maxLines: number) {
  const normalized = String(value || "").trim();
  if (!normalized) return [];
  const lines: string[] = [];
  for (const paragraph of normalized.split(/\r?\n/)) {
    let current = "";
    for (const char of paragraph.trim()) {
      if (current.length >= maxChars) {
        lines.push(current);
        current = "";
      }
      current += char;
    }
    if (current) lines.push(current);
    if (!paragraph.trim() && lines.length) lines.push("");
  }
  if (lines.length <= maxLines) return lines;
  const clipped = lines.slice(0, maxLines);
  clipped[maxLines - 1] = `${clipped[maxLines - 1].slice(0, Math.max(1, maxChars - 1))}…`;
  return clipped;
}

function textBlock(
  value: string,
  x: number,
  y: number,
  maxChars: number,
  maxLines: number,
  size: number,
  color: string,
  weight = 400,
) {
  const lines = wrapText(value, maxChars, maxLines);
  if (!lines.length) return "";
  return `<text x="${x}" y="${y}" fill="${color}" font-family="Noto Sans CJK SC, Noto Sans SC, Arial, sans-serif" font-size="${size}" font-weight="${weight}">${lines.map((line, index) =>
    `<tspan x="${x}" dy="${index ? size * 1.4 : 0}">${xml(line)}</tspan>`).join("")}</text>`;
}

function centeredText(value: string, x: number, y: number, size: number, color: string, weight = 700) {
  return `<text x="${x}" y="${y}" text-anchor="middle" fill="${color}" font-family="Noto Sans CJK SC, Noto Sans SC, Arial, sans-serif" font-size="${size}" font-weight="${weight}">${xml(value)}</text>`;
}

function imageTag(dataUri: string | null, x: number, y: number, width: number, height: number, label: string) {
  if (!dataUri) {
    return `<rect x="${x}" y="${y}" width="${width}" height="${height}" fill="#E8E5DE"/><text x="${x + width / 2}" y="${y + height / 2}" text-anchor="middle" fill="#77736D" font-family="Noto Sans CJK SC, Noto Sans SC, Arial, sans-serif" font-size="${Math.max(20, Math.round(width / 18))}" font-weight="700">TDE</text>`;
  }
  return `<image href="${dataUri}" x="${x}" y="${y}" width="${width}" height="${height}" preserveAspectRatio="xMidYMid slice" aria-label="${xml(label)}"/>`;
}

function qrMarkup(value: string, x: number, y: number, size: number) {
  const qrcode = new QRCode(-1, QRErrorCorrectLevel.M);
  qrcode.addData(value);
  qrcode.make();
  const moduleCount = qrcode.getModuleCount();
  const margin = 4;
  const cells: string[] = [];
  for (let row = 0; row < moduleCount; row += 1) {
    let start = -1;
    for (let col = 0; col <= moduleCount; col += 1) {
      const dark = col < moduleCount && qrcode.isDark(row, col);
      if (dark && start < 0) start = col;
      if ((!dark || col === moduleCount) && start >= 0) {
        cells.push(`M${start + margin} ${row + margin}h${col - start}v1H${start + margin}z`);
        start = -1;
      }
    }
  }
  const fullSize = moduleCount + margin * 2;
  return `<g transform="translate(${x} ${y}) scale(${size / fullSize})"><rect width="${fullSize}" height="${fullSize}" fill="#FFFFFF"/><path d="${cells.join(" ")}" fill="#1A1B1C"/></g>`;
}

async function dataUri(key: string) {
  if (!key) return null;
  const object = await getObject(key);
  if (!object) return null;
  return `data:${object.contentType};base64,${object.body.toString("base64")}`;
}

function tagChips(tags: Array<{ key: string; label: string }>, max: number, x: number, y: number, maxWidth: number, size: number) {
  let cursor = x;
  let row = y;
  const gap = 12;
  const chipHeight = size + 24;
  const selected = tags.slice(0, max);
  const parts: string[] = [];
  for (const tag of selected) {
    const chipWidth = Math.max(size * 2.8, tag.label.length * size * 0.95 + 30);
    if (cursor !== x && cursor + chipWidth > x + maxWidth) {
      cursor = x;
      row += chipHeight + 10;
    }
    parts.push(`<rect x="${cursor}" y="${row - size}" rx="8" width="${chipWidth}" height="${chipHeight}" fill="#FFF3B0" stroke="#1A1B1C" stroke-width="2"/><text x="${cursor + chipWidth / 2}" y="${row + 6}" text-anchor="middle" fill="#1A1B1C" font-family="Noto Sans CJK SC, Noto Sans SC, Arial, sans-serif" font-size="${size}" font-weight="700">${xml(tag.label)}</text>`);
    cursor += chipWidth + gap;
  }
  return parts.join("");
}

async function buildShareSvg(presentation: ClaimedPortraitPresentation, origin: string) {
  const hero = await dataUri(presentation.heroMediaKey);
  const publicUrl = buildPublicPortraitUrl(presentation.publicId, origin);
  const compact = presentation.brandName.length > 14
    || presentation.displayTitle.length > 18
    || presentation.representativeLine.length > 34;
  const brandSize = compact ? 46 : 62;
  const titleSize = compact ? 26 : 32;
  const lineSize = compact ? 22 : 26;
  const tagSize = compact ? 20 : 24;
  const brandLines = wrapText(presentation.brandName, compact ? 18 : 14, 2);
  const brandY = 780;
  const compactTagY = brandY + brandLines.length * brandSize * 1.4 - 8;
  const tags = tagChips(presentation.tags, 5, 60, compact ? compactTagY : 885, 680, tagSize);
  const compactTitleY = compactTagY + tagSize + 42;
  const compactLineY = compactTitleY + (presentation.displayTitle ? titleSize * 1.4 + 20 : 10);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${SHARE_WIDTH}" height="${SHARE_HEIGHT}" viewBox="0 0 ${SHARE_WIDTH} ${SHARE_HEIGHT}">
  <rect width="${SHARE_WIDTH}" height="${SHARE_HEIGHT}" fill="#F7F5F0"/>
  <rect width="${SHARE_WIDTH}" height="26" fill="#FFE600"/>
  <text x="60" y="88" fill="#1A1B1C" font-family="Noto Sans CJK SC, Noto Sans SC, Arial, sans-serif" font-size="24" font-weight="900">奇灯 / TDE 主理人图鉴</text>
  <text x="1020" y="88" text-anchor="end" fill="#6A6863" font-family="Noto Sans CJK SC, Noto Sans SC, Arial, sans-serif" font-size="20">${xml(presentation.guideNumber)}</text>
  <rect x="60" y="124" width="960" height="570" fill="#E8E5DE" stroke="#1A1B1C" stroke-width="4"/>
  ${imageTag(hero, 60, 124, 960, 570, presentation.brandName)}
  ${textBlock(presentation.brandName, 60, brandY, compact ? 18 : 14, 2, brandSize, "#1A1B1C", 900)}
  ${presentation.displayTitle ? textBlock(presentation.displayTitle, 60, compact ? compactTitleY : 940, compact ? 24 : 22, 1, titleSize, "#3E3B36", 700) : ""}
  ${presentation.representativeLine ? textBlock(presentation.representativeLine, 60, compact ? compactLineY : (presentation.displayTitle ? 1005 : 940), compact ? 30 : 28, compact ? 1 : 2, lineSize, "#5C5851", 500) : ""}
  ${tags}
  <line x1="60" y1="1080" x2="1020" y2="1080" stroke="#D9D5CC" stroke-width="3"/>
  ${qrMarkup(publicUrl, 810, 1100, 170)}
  <text x="60" y="1150" fill="#1A1B1C" font-family="Noto Sans CJK SC, Noto Sans SC, Arial, sans-serif" font-size="26" font-weight="800">扫码查看完整图鉴</text>
  ${textBlock("内容来自本人确认后的公开图鉴展示。", 60, 1196, 24, 2, 20, "#77736D", 400)}
  <text x="60" y="1300" fill="#77736D" font-family="Noto Sans CJK SC, Noto Sans SC, Arial, sans-serif" font-size="18">${xml(presentation.guideNumber)} · qideng.thedesignexpo.org.cn</text>
</svg>`;
}

async function buildPrintSvg(presentation: ClaimedPortraitPresentation, origin: string, format: "a3" | "a4") {
  const hero = await dataUri(presentation.heroMediaKey);
  const galleryKeys = format === "a3" ? presentation.galleryMediaKeys.slice(0, 4) : presentation.galleryMediaKeys.slice(0, 2);
  const gallery = await Promise.all(galleryKeys.map(dataUri));
  const publicUrl = buildPublicPortraitUrl(presentation.publicId, origin);
  const isA3 = format === "a3";
  const bodySize = isA3 ? 22 : 21;
  const sectionItems: Array<[string, string]> = [
    ["来这里可以做什么", presentation.supply.map((item) => item.label).join(" · ")],
    ["有一点不一样", presentation.difference],
    ["你可能会记住", presentation.memory],
    ["主理人自己说", presentation.creatorSaid.join("\n")],
  ];
  const sectionWidth = isA3 ? 24 : 34;
  const sectionLines = isA3 ? 3 : 2;
  const sectionMarkup = isA3
    ? sectionItems.filter(([, value]) => Boolean(wrapText(value, sectionWidth, sectionLines).length))
      .map(([title, value], index) => {
        const column = index % 2;
        const row = Math.floor(index / 2);
        const x = column === 0 ? 80 : 620;
        const y = 930 + row * 160;
        const lines = wrapText(value, sectionWidth, sectionLines);
        return `<text x="${x}" y="${y}" fill="#1A1B1C" font-family="Noto Sans CJK SC, Noto Sans SC, Arial, sans-serif" font-size="24" font-weight="900">${xml(title)}</text>${lines.map((line, lineIndex) => `<text x="${x}" y="${y + 36 + lineIndex * (bodySize * 1.35)}" fill="#5C5851" font-family="Noto Sans CJK SC, Noto Sans SC, Arial, sans-serif" font-size="${bodySize}">${xml(line)}</text>`).join("")}`;
      })
      .join("")
    : sectionItems.slice(0, 3).filter(([, value]) => Boolean(wrapText(value, sectionWidth, sectionLines).length))
      .map(([title, value], index) => {
        const y = 900 + index * 110;
        const lines = wrapText(value, sectionWidth, sectionLines);
        return `<text x="80" y="${y}" fill="#1A1B1C" font-family="Noto Sans CJK SC, Noto Sans SC, Arial, sans-serif" font-size="24" font-weight="900">${xml(title)}</text>${lines.map((line, lineIndex) => `<text x="80" y="${y + 32 + lineIndex * (bodySize * 1.35)}" fill="#5C5851" font-family="Noto Sans CJK SC, Noto Sans SC, Arial, sans-serif" font-size="${bodySize}">${xml(line)}</text>`).join("")}`;
      })
      .join("");
  const tagY = isA3 ? 1270 : 1245;
  const galleryY = isA3 ? 1380 : 1335;
  const galleryHeight = isA3 ? 100 : 70;
  const galleryWidth = gallery.length
    ? (PRINT_WIDTH - 160 - (gallery.length - 1) * 22) / gallery.length
    : 0;
  const galleryMarkup = gallery.map((item, index) =>
    imageTag(item, 80 + index * (galleryWidth + 22), galleryY, galleryWidth, galleryHeight, `图鉴补充图片 ${index + 1}`)).join("");
  const footerLineY = isA3 ? 1510 : 1460;
  const footerQrY = isA3 ? 1520 : 1480;
  const footerQrSize = isA3 ? 130 : 120;
  const footerTitleY = isA3 ? 1570 : 1530;
  const footerSubY = isA3 ? 1620 : 1575;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${PRINT_WIDTH}" height="${PRINT_HEIGHT}" viewBox="0 0 ${PRINT_WIDTH} ${PRINT_HEIGHT}">
  <rect width="${PRINT_WIDTH}" height="${PRINT_HEIGHT}" fill="#F7F5F0"/>
  <rect width="${PRINT_WIDTH}" height="42" fill="#FFE600"/>
  <text x="80" y="112" fill="#1A1B1C" font-family="Noto Sans CJK SC, Noto Sans SC, Arial, sans-serif" font-size="32" font-weight="900">奇灯 / TDE 主理人图鉴</text>
  <text x="${PRINT_WIDTH - 80}" y="112" text-anchor="end" fill="#6A6863" font-family="Noto Sans CJK SC, Noto Sans SC, Arial, sans-serif" font-size="24">${xml(presentation.guideNumber)}</text>
  <rect x="80" y="160" width="1040" height="${isA3 ? 430 : 420}" fill="#E8E5DE" stroke="#1A1B1C" stroke-width="5"/>
  ${imageTag(hero, 80, 160, 1040, isA3 ? 430 : 420, presentation.brandName)}
  ${textBlock(presentation.brandName, 80, isA3 ? 650 : 640, 16, 2, isA3 ? 62 : 60, "#1A1B1C", 900)}
  ${presentation.displayTitle ? textBlock(presentation.displayTitle, 80, isA3 ? 780 : 760, 30, 1, isA3 ? 32 : 30, "#3E3B36", 700) : ""}
  ${presentation.representativeLine ? textBlock(presentation.representativeLine, 80, presentation.displayTitle ? (isA3 ? 840 : 820) : (isA3 ? 780 : 760), 38, 2, isA3 ? 24 : 23, "#5C5851", 500) : ""}
  ${sectionMarkup}
  ${tagChips(presentation.tags, 6, 80, tagY, 1040, 24)}
  ${galleryMarkup}
  <line x1="80" y1="${footerLineY}" x2="${PRINT_WIDTH - 80}" y2="${footerLineY}" stroke="#D9D5CC" stroke-width="3"/>
  ${qrMarkup(publicUrl, PRINT_WIDTH - 80 - footerQrSize, footerQrY, footerQrSize)}
  <text x="80" y="${footerTitleY}" fill="#1A1B1C" font-family="Noto Sans CJK SC, Noto Sans SC, Arial, sans-serif" font-size="24" font-weight="800">扫码查看在线完整图鉴</text>
  <text x="80" y="${footerSubY}" fill="#77736D" font-family="Noto Sans CJK SC, Noto Sans SC, Arial, sans-serif" font-size="20">${xml(presentation.guideNumber)}</text>
</svg>`;
}

function jpegPdf(jpeg: Buffer, width: number, height: number, pageWidth: number, pageHeight: number) {
  const objects: Buffer[] = [];
  const text = (value: string) => Buffer.from(value, "latin1");
  objects.push(text("<< /Type /Catalog /Pages 2 0 R >>"));
  objects.push(text("<< /Type /Pages /Kids [3 0 R] /Count 1 >>"));
  objects.push(text(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`));
  objects.push(Buffer.concat([
    text(`<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`),
    jpeg,
    text("\nendstream"),
  ]));
  const content = `q ${pageWidth} 0 0 ${pageHeight} 0 0 cm /Im0 Do Q`;
  objects.push(text(`<< /Length ${Buffer.byteLength(content, "latin1")} >>\nstream\n${content}\nendstream`));
  const header = Buffer.from("%PDF-1.4\n%\xFF\xFF\xFF\xFF\n", "latin1");
  const chunks: Uint8Array[] = [header];
  const offsets: number[] = [];
  let offset = header.length;
  objects.forEach((object, index) => {
    const prefix = Buffer.from(`${index + 1} 0 obj\n`, "latin1");
    const suffix = Buffer.from("\nendobj\n", "latin1");
    offsets.push(offset);
    chunks.push(prefix, object, suffix);
    offset += prefix.length + object.length + suffix.length;
  });
  const xrefStart = offset;
  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const item of offsets) xref += `${String(item).padStart(10, "0")} 00000 n \n`;
  xref += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;
  chunks.push(Buffer.from(xref, "latin1"));
  return Buffer.concat(chunks);
}

function outputName(presentation: ClaimedPortraitPresentation, format: PortraitVisualFormat) {
  const suffix = format === "share" ? "share.png" : `${format.toUpperCase()}.pdf`;
  const guideNumber = safeFilename(presentation.guideNumber).replace(/^TDE-/i, "") || "PORTRAIT";
  return `TDE-${guideNumber}-${safeFilename(presentation.brandName)}-${suffix}`;
}

export async function renderPortraitVisual(
  creatorId: number,
  origin: string,
  format: PortraitVisualFormat,
): Promise<VisualOutput> {
  const presentation = getClaimedPortraitPresentation(creatorId);
  if (format === "share") {
    const svg = await buildShareSvg(presentation, origin);
    const body = await sharp(Buffer.from(svg)).png().toBuffer();
    return { body, contentType: "image/png", extension: "png", filename: outputName(presentation, format) };
  }
  const svg = await buildPrintSvg(presentation, origin, format);
  const dimensions = format === "a3" ? A3_PIXELS : A4_PIXELS;
  const jpeg = await sharp(Buffer.from(svg), { density: 300 })
    .resize(dimensions.width, dimensions.height, { fit: "fill" })
    .jpeg({ quality: 94, chromaSubsampling: "4:4:4" })
    .toBuffer();
  const page = format === "a3"
    ? { width: 841.89, height: 1190.55 }
    : { width: 595.28, height: 841.89 };
  const body = jpegPdf(jpeg, dimensions.width, dimensions.height, page.width, page.height);
  return { body, contentType: "application/pdf", extension: "pdf", filename: outputName(presentation, format) };
}
