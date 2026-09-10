import fs from "node:fs";
import { buildPosterSvg } from "../lib/poster-renderer";
import { svgToCmykPdf } from "../lib/design-pdf";
import type { DesignBrief } from "../lib/types";

const brief: DesignBrief = {
  theme: "春日拾光",
  slogan: "东风醒物 · 好物相逢",
  subtitle: "TDE × 立春 城市手作市集",
  style_key: "新中式国风",
  grid_key: "orthogonal",
  palette: { background: "#F6F1E7", primary: "#2F2A26", accent: "#A94438", text: "#3A3530" },
  title_font: "serif",
  body_font: "sans",
  elements: [
    { kind: "title", text: "春日拾光", font: "serif", size: 96, color: "primary", x: 50, y: 40, align: "center" },
    { kind: "subtitle", text: "TDE × 立春 城市手作市集", font: "sans", size: 26, color: "text", x: 50, y: 58, align: "center" },
    { kind: "slogan", text: "东风醒物 · 好物相逢", font: "serif", size: 34, color: "accent", x: 50, y: 74, align: "center" },
    { kind: "body", text: "手作人、非遗传承人 · 香薰蜡烛、陶瓷器物 · 节气限定贴纸 · 香道体验", font: "sans", size: 20, color: "text", x: 50, y: 84, align: "center" },
    { kind: "badge", text: "档期：周末两天", font: "sans", size: 18, color: "accent", x: 50, y: 93, align: "center" },
  ],
  note: "测试",
};

const svg = buildPosterSvg(brief);
const pdf = svgToCmykPdf(svg);
fs.writeFileSync("/tmp/test-poster.svg", svg);
fs.writeFileSync("/tmp/test-poster.pdf", pdf);
console.log("SVG bytes:", Buffer.byteLength(svg, "utf8"));
console.log("PDF bytes:", pdf.length);
console.log("PDF head:", pdf.slice(0, 8).toString("latin1"));
console.log("PDF has CMYK k op:", pdf.includes(" k\n") || pdf.includes(" k "));
console.log("PDF has cm:", pdf.includes(" cm"));
console.log("PDF %%EOF:", pdf.slice(-10).includes("%%EOF"));
