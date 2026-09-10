import { mkdirSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";

const categories = [
  ["CITY / WEEKEND", "#E5B93F", "#171717"],
  ["HAND / CRAFT", "#D86B4B", "#171717"],
  ["HERITAGE", "#597A50", "#FFFFFF"],
  ["ART / DESIGN", "#5378A8", "#FFFFFF"],
  ["LIVE / SOUND", "#735C92", "#FFFFFF"],
  ["FOOD / DRINK", "#B74942", "#FFFFFF"],
  ["YOUTH / STREET", "#258079", "#FFFFFF"],
  ["FAMILY / PET", "#C66E87", "#171717"],
  ["GIFT / SEASON", "#AA873D", "#171717"],
  ["BRAND / EVENT", "#555B63", "#FFFFFF"],
];

const output = path.join(process.cwd(), "public", "posters");
mkdirSync(output, { recursive: true });

for (const [index, [label, background, ink]] of categories.entries()) {
  const offset = 80 + index * 18;
  const bars = Array.from({ length: 7 }, (_, bar) => {
    const x = 760 + bar * 48;
    const height = 220 + ((bar + index) % 4) * 120;
    return `<rect x="${x}" y="${1320 - height}" width="22" height="${height}" fill="none" stroke="${ink}" stroke-width="5" opacity="0.72"/>`;
  }).join("");
  const svg = `
    <svg width="1200" height="1500" viewBox="0 0 1200 1500" xmlns="http://www.w3.org/2000/svg">
      <rect width="1200" height="1500" fill="${background}"/>
      <rect x="${offset}" y="110" width="${1040 - offset}" height="5" fill="${ink}"/>
      <rect x="${offset}" y="1385" width="${1040 - offset}" height="5" fill="${ink}"/>
      <rect x="${offset}" y="220" width="500" height="500" fill="none" stroke="${ink}" stroke-width="7"/>
      <rect x="${offset + 95}" y="315" width="500" height="500" fill="none" stroke="${ink}" stroke-width="4" opacity="0.72"/>
      <path d="M ${offset} 1010 L 660 1010 L 660 1260 L ${offset} 1260 Z" fill="none" stroke="${ink}" stroke-width="7"/>
      ${bars}
      <text x="${offset}" y="86" fill="${ink}" font-family="Arial, sans-serif" font-size="24" font-weight="700">QIDENG SELECTED ${String(index + 1).padStart(2, "0")}</text>
      <text x="${offset}" y="970" fill="${ink}" font-family="Arial, sans-serif" font-size="62" font-weight="700">${label}</text>
      <text x="${offset}" y="1360" fill="${ink}" font-family="Arial, sans-serif" font-size="20">CURATED ACTIVITY INVITATION</text>
    </svg>`;
  await sharp(Buffer.from(svg)).jpeg({ quality: 90, mozjpeg: true }).toFile(path.join(output, `category-${index + 1}.jpg`));
}
