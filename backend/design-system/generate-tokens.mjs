import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const tokens = JSON.parse(fs.readFileSync(path.join(here, "qideng-tokens.json"), "utf8"));

const kebab = (value) => value.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
const sourceComment = "Generated from design-system/qideng-tokens.json. Do not edit by hand.";

const cssLines = [`/* ${sourceComment} */`, ":root {", `  --font-sans: ${tokens.fonts.sans};`, `  --font-editorial: ${tokens.fonts.editorial};`];
for (const [name, value] of Object.entries(tokens.colors)) cssLines.push(`  --${kebab(name)}: ${value};`);
for (const [name, value] of Object.entries(tokens.type)) {
  cssLines.push(`  --type-${name}: ${value.px}px;`);
  cssLines.push(`  --line-${name}: ${value.linePx}px;`);
  cssLines.push(`  --weight-${name}: ${value.weight};`);
}
for (const [name, value] of Object.entries(tokens.spacing)) cssLines.push(`  --space-${name}: ${value.px}px;`);
for (const [name, value] of Object.entries(tokens.radii)) cssLines.push(`  --radius-${name}: ${value.px === 999 ? "9999px" : `${value.px}px`};`);
for (const [name, value] of Object.entries(tokens.layout)) {
  if (name !== "imageRatio") cssLines.push(`  --layout-${kebab(name)}: ${value.px}px;`);
}
cssLines.push(`  --motion-fast: ${tokens.motion.fastMs}ms;`);
cssLines.push(`  --motion-standard: ${tokens.motion.standardMs}ms;`);
cssLines.push(`  --motion-slow: ${tokens.motion.slowMs}ms;`);
cssLines.push(`  --ease-out: ${tokens.motion.easeOut};`);
cssLines.push(`  --ease-standard: ${tokens.motion.easeStandard};`);
cssLines.push(`  --image-ratio: ${tokens.layout.imageRatio};`);
appendAliases(cssLines);
cssLines.push("}");

const wxssLines = [`/* ${sourceComment} */`, "page {", `  --font-sans: ${tokens.fonts.sans};`, `  --font-editorial: ${tokens.fonts.editorial};`];
for (const [name, value] of Object.entries(tokens.colors)) wxssLines.push(`  --${kebab(name)}: ${value};`);
for (const [name, value] of Object.entries(tokens.type)) {
  wxssLines.push(`  --type-${name}: ${value.rpx}rpx;`);
  wxssLines.push(`  --line-${name}: ${value.lineRpx}rpx;`);
  wxssLines.push(`  --weight-${name}: ${value.weight};`);
}
for (const [name, value] of Object.entries(tokens.spacing)) wxssLines.push(`  --space-${name}: ${value.rpx}rpx;`);
for (const [name, value] of Object.entries(tokens.radii)) wxssLines.push(`  --radius-${name}: ${value.rpx}rpx;`);
for (const [name, value] of Object.entries(tokens.layout)) {
  if (name !== "imageRatio") wxssLines.push(`  --layout-${kebab(name)}: ${value.rpx}rpx;`);
}
wxssLines.push(`  --motion-fast: ${tokens.motion.fastMs}ms;`);
wxssLines.push(`  --motion-standard: ${tokens.motion.standardMs}ms;`);
wxssLines.push(`  --motion-slow: ${tokens.motion.slowMs}ms;`);
wxssLines.push(`  --ease-out: ${tokens.motion.easeOut};`);
wxssLines.push(`  --ease-standard: ${tokens.motion.easeStandard};`);
wxssLines.push(`  --image-ratio: ${tokens.layout.imageRatio};`);
appendAliases(wxssLines);
wxssLines.push("}");

function appendAliases(lines) {
  lines.push("  /* Compatibility aliases resolve historical component names to the same system. */");
  lines.push("  --type-card-title: var(--type-card);");
  lines.push("  --weight-regular: var(--weight-body);");
  lines.push("  --weight-medium: var(--weight-card);");
  lines.push("  --weight-semibold: var(--weight-card);");
  lines.push("  --radius: var(--radius-default);");
  lines.push("  --header-height: var(--layout-mini-header);");
  lines.push("  --nav-height: var(--layout-bottom-nav);");
  lines.push("  --creator: var(--warning);");
  lines.push("  --green: var(--accent);");
  lines.push("  --green-dark: var(--accent-pressed);");
  lines.push("  --green-soft: var(--accent-soft);");
  lines.push("  --yellow: var(--warning);");
  lines.push("  --blue: var(--info);");
  lines.push("  --blue-soft: var(--info-soft);");
  lines.push("  --red: var(--danger);");
  lines.push("  --red-soft: var(--danger-soft);");
  lines.push("  --ink-soft: var(--muted);");
  lines.push("  --paper-light: var(--surface-soft);");
  lines.push("  --white: var(--surface);");
  lines.push("  --card: var(--surface);");
  lines.push("  --coral: var(--highlight);");
  lines.push("  --amber-light: var(--warning-soft);");
}

const appValues = `/* ${sourceComment} */\nexport const QIDENG_COLORS = ${JSON.stringify(tokens.colors, null, 2)} as const;\nexport const QIDENG_LAYOUT = ${JSON.stringify(tokens.layout, null, 2)} as const;\n`;
const outputs = [
  [path.join(here, "qideng-tokens.css"), `${cssLines.join("\n")}\n`],
  [path.join(root, "app", "design-system.css"), `${cssLines.join("\n")}\n`],
  [path.join(root, "app", "design-system-values.ts"), appValues],
  [path.join(root, "miniprogram", "styles", "qideng-tokens.wxss"), `${wxssLines.join("\n")}\n`],
  [path.join(root, "miniprogram", "utils", "design-tokens.ts"), appValues],
];

for (const [file, content] of outputs) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

console.log(`Design tokens generated: ${outputs.length} files`);
