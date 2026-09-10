import fs from "node:fs";
import { svgToCmykPdf } from "../lib/design-pdf";

// 最小复现：红底 + 白色方块 + 黑色大字
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="400" viewBox="0 0 300 400">
<rect x="0" y="0" width="300" height="400" fill="#F6F1E7"/>
<rect x="20" y="20" width="80" height="80" fill="#A94438"/>
<text x="60" y="200" font-family="'Songti SC', serif" font-size="60" font-weight="700" fill="#2F2A26" text-anchor="middle">春日</text>
<text x="150" y="350" font-family="'PingFang SC', sans-serif" font-size="28" fill="#3A3530" text-anchor="middle">副标题测试</text>
</svg>`;
const pdf = svgToCmykPdf(svg);
fs.writeFileSync("/tmp/mini.pdf", pdf);
console.log("mini PDF bytes:", pdf.length);

// 打印内容流便于人工检查
const s = pdf.toString("latin1");
const idx = s.indexOf("stream\n");
const end = s.indexOf("\nendstream", idx);
console.log(s.slice(idx + 7, idx + 7 + 1500));
