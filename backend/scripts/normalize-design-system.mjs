import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(file);
    return /\.(wxss|css)$/.test(file) ? [file] : [];
  });
}

const files = [
  ...walk(path.join(root, "miniprogram")),
  path.join(root, "app/globals.css"),
].filter((file) => !file.includes("qideng-tokens."));

const colors = new Map(Object.entries({
  "#fffdf6": "var(--surface)",
  "#fffaf0": "var(--surface-soft)",
  "#fff": "var(--surface)",
  "#ffffff": "var(--surface)",
  "#fbfbfa": "var(--paper)",
  "#f7f5f0": "var(--paper)",
  "#f5f5f3": "var(--surface-soft)",
  "#f6f6f4": "var(--surface-soft)",
  "#f1efea": "var(--surface-soft)",
  "#eff0ed": "var(--surface-soft)",
  "#eeeef0": "var(--surface-soft)",
  "#eef0e8": "var(--surface-soft)",
  "#e7e8e4": "var(--line)",
  "#e4e0d4": "var(--line)",
  "#e0ded7": "var(--line)",
  "#d8dad5": "var(--line-strong)",
  "#cfcfcb": "var(--line-strong)",
  "#bfbfbb": "var(--line-strong)",
  "#383a37": "var(--ink)",
  "#202124": "var(--ink)",
  "#20201f": "var(--ink)",
  "#191918": "var(--night)",
  "#171717": "var(--ink)",
  "#111": "var(--ink)",
  "#111111": "var(--ink)",
  "#101713": "var(--night)",
  "#050806": "var(--night)",
  "#2f2f2e": "var(--night)",
  "#30332f": "var(--night)",
  "#203027": "var(--night)",
  "#555853": "var(--text)",
  "#555b63": "var(--text)",
  "#6c6f76": "var(--muted)",
  "#858883": "var(--muted)",
  "#8a8a87": "var(--muted)",
  "#888": "var(--muted)",
  "#999": "var(--muted)",
  "#b8b8b8": "var(--faint)",
  "#bdbdb8": "var(--faint)",
  "#d6d6d6": "var(--faint)",
  "#aaaca8": "var(--faint)",
  "#a8aaa4": "var(--faint)",
  "#e78370": "var(--accent)",
  "#d88472": "var(--accent)",
  "#d96f5b": "var(--accent-pressed)",
  "#be6d5c": "var(--accent-pressed)",
  "#fff0ec": "var(--accent-soft)",
  "#f5e4de": "var(--accent-soft)",
  "#39b980": "var(--success)",
  "#219568": "var(--success)",
  "#3d9078": "var(--success)",
  "#3b8f75": "var(--success)",
  "#2d775f": "var(--success)",
  "#1c674f": "var(--success)",
  "#17633f": "var(--success)",
  "#dff6ec": "var(--success-soft)",
  "#e6efe9": "var(--success-soft)",
  "#e1f1e8": "var(--success-soft)",
  "#eef7f3": "var(--success-soft)",
  "#f1f7f4": "var(--success-soft)",
  "#ffd23f": "var(--warning)",
  "#e5b93f": "var(--warning)",
  "#e0b52d": "var(--warning)",
  "#b47a10": "var(--warning)",
  "#fff1b8": "var(--warning-soft)",
  "#fff3b4": "var(--warning-soft)",
  "#fff4c2": "var(--warning-soft)",
  "#fff5cc": "var(--warning-soft)",
  "#fff6d0": "var(--warning-soft)",
  "#fff8dc": "var(--warning-soft)",
  "#fff2cf": "var(--warning-soft)",
  "#f4ebdd": "var(--warning-soft)",
  "#4d8dff": "var(--info)",
  "#245ac7": "var(--info)",
  "#c9dbff": "var(--info-soft)",
  "#e8f1ff": "var(--info-soft)",
  "#e8eef2": "var(--info-soft)",
  "#f45b5b": "var(--danger)",
  "#d84242": "var(--danger)",
  "#c94f58": "var(--danger)",
  "#c94d4d": "var(--danger)",
  "#b66f68": "var(--danger)",
  "#b42318": "var(--danger)",
  "#9b2d34": "var(--danger)",
  "#8a3037": "var(--danger)",
  "#bb5c51": "var(--danger)",
  "#ffeaea": "var(--danger-soft)",
  "#f5e5e2": "var(--danger-soft)",
  "#f7e5e6": "var(--danger-soft)",
  "#f8dfe1": "var(--danger-soft)",
  "#dcb1b4": "var(--danger-soft)",
  "#fff8df": "var(--warning-soft)",
  "#fbf8ee": "var(--warning-soft)",
  "#ebede9": "var(--surface-soft)",
  "#dfe0dc": "var(--line)",
  "#9e9e9a": "var(--faint)",
  "#8a6f20": "var(--warning)",
  "#765000": "var(--warning)",
  "#746126": "var(--warning)",
  "#806400": "var(--warning)",
  "#9a7000": "var(--warning)",
  "#9c7900": "var(--warning)",
  "#735600": "var(--warning)",
  "#b58a19": "var(--warning)",
  "#c9aa45": "var(--warning)",
  "#c99c37": "var(--warning)",
  "#e2ae24": "var(--warning)",
  "#b7e8d0": "var(--success-soft)",
  "#a5e2c3": "var(--success-soft)",
  "#b9d2c5": "var(--success-soft)",
  "#8ebfa5": "var(--success)",
  "#8ebba9": "var(--success)",
  "#d8f0e7": "var(--success-soft)",
  "#f2f8f5": "var(--success-soft)",
  "#c9dbff": "var(--info-soft)",
  "#aaa": "var(--muted)",
  "#444": "var(--text)",
  "#eeeeeb": "var(--surface-soft)",
  "#ececeb": "var(--surface-soft)",
  "#f6f6f4": "var(--surface-soft)",
}));

const sortedColors = [...colors.keys()].sort((a, b) => b.length - a.length);
const colorPattern = new RegExp(`(${sortedColors.map((color) => color.replace("#", "\\#")).join("|")})(?![0-9a-f])`, "gi");
const weightPattern = /font-weight\s*:\s*(?:650|700|750|800|850|900|bold)\b/gi;
const alphaColors = new Map(Object.entries({
  "rgba(255,255,255,0.96)": "var(--surface-translucent)",
  "rgba(255,255,255,0.94)": "var(--surface-translucent)",
  "rgba(255,255,255,0.98)": "var(--surface-translucent)",
  "rgba(255,255,255,0.97)": "var(--surface-translucent)",
  "rgba(255,255,255,0.9)": "var(--dark-text-soft)",
  "rgba(255,255,255,0.86)": "var(--dark-text-soft)",
  "rgba(255,255,255,0.84)": "var(--dark-text-soft)",
  "rgba(255,255,255,0.74)": "var(--dark-text-soft)",
  "rgba(255,255,255,0.7)": "var(--dark-text-soft)",
  "rgba(255,255,255,0.28)": "var(--dark-hairline)",
  "rgba(255,253,246,0.96)": "var(--paper-translucent)",
  "rgba(255,253,246,0.97)": "var(--paper-translucent)",
  "rgba(255,253,246,0.98)": "var(--paper-translucent)",
  "rgba(251,251,250,0.96)": "var(--paper-translucent)",
  "rgba(251,251,250,0.97)": "var(--paper-translucent)",
  "rgba(251,251,250,0.98)": "var(--paper-translucent)",
  "rgba(56,58,55,0.28)": "var(--scrim)",
  "rgba(52,54,51,0.28)": "var(--scrim)",
  "rgba(32,48,39,0.25)": "var(--line-strong)",
  "rgba(32,48,39,0.28)": "var(--line-strong)",
  "rgba(32,48,39,0.3)": "var(--line-strong)",
  "rgba(32,48,39,0.94)": "var(--night)",
  "rgba(32,33,36,0.35)": "var(--line-strong)",
  "rgba(231,131,112,0.35)": "var(--accent)",
  "rgba(231,131,112,0.52)": "var(--accent)",
  "rgba(231,131,112,0.55)": "var(--accent)",
  "rgba(217,183,82,0.55)": "var(--warning)",
  "rgba(229,185,63,0.55)": "var(--warning)",
  "rgba(246,245,237,0.2)": "var(--dark-hairline)",
  "rgba(246,245,237,0.6)": "var(--dark-text-soft)",
  "rgba(246,245,237,0.72)": "var(--dark-text-soft)",
  "rgba(246,245,237,0.78)": "var(--dark-text-soft)",
  "rgba(246,245,237,0.86)": "var(--dark-text-soft)",
  "rgba(31,33,30,0)": "var(--image-shade-clear)",
  "rgba(31,33,30,0.72)": "var(--image-shade)",
  "rgba(41,43,40,0.5)": "var(--scrim-strong)",
  "rgba(34,36,33,0.96)": "var(--night)",
  "rgba(34,36,33,0.5)": "var(--scrim-strong)",
  "rgba(34,36,33,0.28)": "var(--scrim)",
  "rgba(12,12,12,0.62)": "var(--scrim-strong)",
  "rgba(0,0,0,0.18)": "var(--line-strong)",
  "rgba(0,0,0,0.2)": "var(--line-strong)",
  "rgba(0,0,0,0.28)": "var(--line-strong)",
  "rgba(0,0,0,0.36)": "var(--scrim-strong)",
  "rgba(0,0,0,0.5)": "var(--scrim-strong)",
}));
const miniSizeMap = new Map([
  ["17", "var(--type-micro)"], ["18", "var(--type-micro)"], ["19", "var(--type-micro)"],
  ["20", "var(--type-micro)"], ["21", "var(--type-micro)"], ["22", "var(--type-micro)"],
  ["23", "var(--type-caption)"], ["24", "var(--type-caption)"],
  ["25", "var(--type-secondary)"], ["26", "var(--type-secondary)"],
  ["27", "var(--type-body)"], ["28", "var(--type-body)"],
  ["29", "var(--type-card)"], ["30", "var(--type-card)"], ["31", "var(--type-card)"], ["32", "var(--type-card)"],
  ["33", "var(--type-section)"], ["34", "var(--type-section)"], ["35", "var(--type-section)"], ["36", "var(--type-section)"],
  ["37", "var(--type-display)"], ["38", "var(--type-display)"], ["39", "var(--type-display)"], ["40", "var(--type-display)"],
  ["41", "var(--type-display)"], ["42", "var(--type-display)"], ["43", "var(--type-display)"], ["44", "var(--type-display)"],
  ["45", "var(--type-display)"], ["46", "var(--type-display)"], ["47", "var(--type-display)"], ["48", "var(--type-display)"],
  ["49", "var(--type-display)"], ["50", "var(--type-display)"],
  ["51", "var(--type-display)"], ["52", "var(--type-display)"], ["53", "var(--type-display)"], ["54", "var(--type-display)"],
  ["55", "var(--type-display)"], ["56", "var(--type-display)"], ["57", "var(--type-display)"], ["58", "var(--type-display)"],
  ["59", "var(--type-display)"], ["60", "var(--type-display)"], ["61", "var(--type-display)"], ["62", "var(--type-display)"],
  ["63", "var(--type-display)"], ["64", "var(--type-display)"],
]);
const webSizeMap = new Map([
  ["9", "var(--type-micro)"], ["10", "var(--type-micro)"], ["11", "var(--type-micro)"],
  ["12", "var(--type-caption)"], ["13", "var(--type-secondary)"],
  ["14", "var(--type-body)"], ["15", "var(--type-body)"],
  ["16", "var(--type-card)"], ["17", "var(--type-card)"],
  ["18", "var(--type-section)"], ["19", "var(--type-section)"], ["20", "var(--type-section)"],
  ["21", "var(--type-display)"], ["22", "var(--type-display)"], ["23", "var(--type-display)"], ["24", "var(--type-display)"],
  ["25", "var(--type-display)"], ["26", "var(--type-display)"], ["27", "var(--type-display)"], ["28", "var(--type-display)"],
  ["29", "var(--type-display)"], ["30", "var(--type-display)"], ["31", "var(--type-display)"], ["32", "var(--type-display)"], ["33", "var(--type-display)"], ["34", "var(--type-display)"], ["35", "var(--type-display)"], ["36", "var(--type-display)"], ["37", "var(--type-display)"], ["38", "var(--type-display)"], ["39", "var(--type-display)"], ["40", "var(--type-display)"], ["41", "var(--type-display)"], ["42", "var(--type-display)"], ["43", "var(--type-display)"], ["44", "var(--type-display)"], ["45", "var(--type-display)"], ["46", "var(--type-display)"], ["47", "var(--type-display)"], ["48", "var(--type-display)"], ["49", "var(--type-display)"], ["50", "var(--type-display)"], ["51", "var(--type-display)"], ["52", "var(--type-display)"], ["53", "var(--type-display)"], ["54", "var(--type-display)"], ["55", "var(--type-display)"], ["56", "var(--type-display)"], ["57", "var(--type-display)"], ["58", "var(--type-display)"], ["59", "var(--type-display)"], ["60", "var(--type-display)"], ["61", "var(--type-display)"], ["62", "var(--type-display)"], ["63", "var(--type-display)"], ["64", "var(--type-display)"],
]);

function replaceFontSize(content, isMini) {
  const map = isMini ? miniSizeMap : webSizeMap;
  return content.replace(/font-size\s*:\s*(\d+(?:\.\d+)?)(rpx|px)\b/gi, (match, number, unit) => {
    const replacement = map.get(number);
    return replacement ? `font-size: ${replacement}` : match;
  }).replace(/font-size\s*:\s*clamp\([^;]+\)/gi, "font-size: var(--type-display)");
}

for (const file of files) {
  let content = fs.readFileSync(file, "utf8");
  content = content.replace(/rgba\(([^)]+)\)/gi, (match, inner) => {
    const normalized = `rgba(${inner.split(",").map((part) => part.trim()).join(",")})`.replace(/,\./g, ",0.");
    return alphaColors.get(normalized) || match;
  });
  content = content.replace(colorPattern, (match) => colors.get(match.toLowerCase()) || match);
  content = content.replace(weightPattern, "font-weight: var(--weight-semibold)");
  content = content.replace(/font-weight\s*:\s*(\d+)\b/gi, (match, value) => {
    const weight = Number(value);
    return `font-weight: ${weight >= 600 ? "var(--weight-semibold)" : weight >= 500 ? "var(--weight-medium)" : "var(--weight-regular)"}`;
  });
  content = content.replace(/font-weight\s*:\s*400\b/gi, "font-weight: var(--weight-regular)");
  content = content.replace(/font-weight\s*:\s*500\b/gi, "font-weight: var(--weight-medium)");
  content = content.replace(/font-weight\s*:\s*600\b/gi, "font-weight: var(--weight-semibold)");
  content = content.replace(/font-weight\s*:\s*550\b/gi, "font-weight: var(--weight-medium)");
  content = content.replace(/font-weight\s*:\s*200\b/gi, "font-weight: var(--weight-regular)");
  content = content.replace(/font-family\s*:\s*Georgia,\s*serif\b/gi, "font-family: var(--font-editorial)");
  content = replaceFontSize(content, file.endsWith(".wxss"));
  content = content.replace(/(:\s*)white\b/gi, "$1var(--surface)");
  content = content.replace(/box-shadow\s*:\s*[^;{}]+;/gi, "box-shadow: none;");
  content = content.replace(/border:\s*4rpx\s+solid/g, "border: 2rpx solid");
  content = content.replace(/border:\s*3rpx\s+solid/g, "border: 2rpx solid");
  content = content.replace(/border-radius\s*:\s*([^;{}]+);/gi, (match, value) => {
    if (/var\(|50%|9999|inherit|initial|unset/.test(value)) return match;
    const values = value.trim().split(/\s+/);
    if (!values.every((item) => /^(?:\d+(?:\.\d+)?)(?:rpx|px)$/.test(item) || item === "0")) return match;
    const numbers = values.map((item) => Number.parseFloat(item));
    const unit = values.find((item) => /rpx|px/.test(item))?.match(/rpx|px/)?.[0] || "px";
    const max = Math.max(...numbers);
    if (values.length === 1 && max >= (unit === "rpx" ? 17 : 9)) return "border-radius: var(--radius-pill);";
    if (values.length === 1) return `border-radius: ${max >= (unit === "rpx" ? 8 : 4) ? "var(--radius-default)" : "var(--radius-sm)"};`;
    return `border-radius: ${values.map((item) => item === "0" ? "0" : Number.parseFloat(item) >= (unit === "rpx" ? 8 : 4) ? "var(--radius-default)" : "var(--radius-sm)").join(" ")};`;
  });
  fs.writeFileSync(file, content);
}

console.log(`Normalized ${files.length} style files to the Qideng design system.`);
