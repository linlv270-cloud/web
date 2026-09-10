import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const input = path.join(root, "public", "fonts", "qideng-editorial-subset.woff");
const output = path.join(root, "miniprogram", "utils", "editorial-font.ts");
const font = fs.readFileSync(input).toString("base64");
const source = `/* Generated from public/fonts/qideng-editorial-subset.woff. Do not edit by hand. */\nexport const QIDENG_EDITORIAL_FONT_SOURCE = 'url("data:font/woff;base64,${font}")';\n`;

fs.writeFileSync(output, source);
console.log(`Embedded editorial font: ${Math.round(font.length / 1024)} KiB base64`);
