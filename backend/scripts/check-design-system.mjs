import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const tokenSource = path.join(root, "design-system/qideng-tokens.json");
const tokenDesignCss = path.join(root, "design-system/qideng-tokens.css");
const tokenWxss = path.join(root, "miniprogram/styles/qideng-tokens.wxss");
const tokenCss = path.join(root, "app/design-system.css");
const tokenMiniTs = path.join(root, "miniprogram/utils/design-tokens.ts");
const tokenAppTs = path.join(root, "app/design-system-values.ts");
const editorialFont = path.join(root, "public/fonts/qideng-editorial-subset.woff");
const editorialFontModule = path.join(root, "miniprogram/utils/editorial-font.ts");
const failures = [];
const notes = [];

const read = (file) => fs.readFileSync(file, "utf8");
const walk = (dir, extensions) => {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(file, extensions);
    return extensions.some((extension) => file.endsWith(extension)) ? [file] : [];
  });
};
const fail = (message) => failures.push(message);
const pass = (message) => notes.push(message);

if (!fs.existsSync(tokenSource)) fail("缺少项目内设计令牌源：design-system/qideng-tokens.json");
else {
  const tokens = JSON.parse(read(tokenSource));
  if (tokens.version !== "3.0.0") fail(`设计系统版本必须为 3.0.0，当前为 ${tokens.version}`);
  for (const role of ["display", "section", "card", "body", "secondary", "caption", "micro"]) {
    if (!tokens.type?.[role]) fail(`字体令牌缺少 ${role}`);
  }
  if (tokens.type && Object.values(tokens.type).some((role) => role.weight > 500)) fail("产品字体令牌字重不能超过 500");
  if (!String(tokens.fonts?.editorial || "").startsWith('"Qideng Editorial"')) fail("编辑字体令牌必须优先使用实际加载的 Qideng Editorial");
  if (tokens.layout?.imageRatio !== "4 / 5") fail("体验封面比例必须固定为 4 / 5");
  const kebab = (value) => value.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
  const generatedSources = [tokenDesignCss, tokenWxss, tokenCss, tokenMiniTs, tokenAppTs].filter((file) => fs.existsSync(file)).map(read).join("\n");
  for (const [name, value] of Object.entries(tokens.colors || {})) {
    if (!generatedSources.includes(`--${kebab(name)}: ${value};`)) fail(`生成令牌缺少颜色 --${kebab(name)}`);
  }
  for (const [name, value] of Object.entries(tokens.type || {})) {
    if (!generatedSources.includes(`--type-${name}: ${value.px}px;`) && !generatedSources.includes(`--type-${name}: ${value.rpx}rpx;`)) fail(`生成令牌缺少字号 --type-${name}`);
  }
}

for (const file of [tokenDesignCss, tokenWxss, tokenCss, tokenMiniTs, tokenAppTs]) {
  if (!fs.existsSync(file)) fail(`缺少生成后的令牌文件：${path.relative(root, file)}`);
}

const wxssFiles = walk(path.join(root, "miniprogram"), [".wxss"]);
const cssFiles = [path.join(root, "app/globals.css")];
const sources = [...wxssFiles, ...cssFiles].filter((file) => fs.existsSync(file));
const runtimeFiles = [
  ...walk(path.join(root, "miniprogram"), [".ts", ".wxml"]),
  ...walk(path.join(root, "app"), [".ts", ".tsx"]),
].filter((file) => !file.endsWith("design-tokens.ts") && !file.endsWith("design-system-values.ts"));
const retiredCopy = ["兴趣是试着玩出来的", "陪玩官", "自助玩", "陪你玩"];

const retiredColors = [
  "#39b980", "#219568", "#dff6ec", "#ffd23f", "#4d8dff", "#e8f1ff", "#f45b5b", "#ffeaea",
  "#202124", "#fffdf6", "#fffaf0", "#6c6f76", "#f45b5b", "#197a52", "#d9363e",
  "#b99bd8", "#d5c3eb", "#cbb4e3", "#dccdf0", "#f5effb",
];
const normalizedRetired = retiredColors.map((color) => color.toLowerCase());
const hardWeightPattern = /font-weight\s*:\s*(?:200|300|350|550|650|700|750|800|850|900|bold)\b/gi;
const hardSizePattern = /font-size\s*:\s*(?:[1-9]\d*(?:\.\d+)?)(?:px|rpx|vw|vh|rem)\b/gi;
// Ignore HTML numeric entities such as &#123; while still catching CSS/JS colors.
const rawColorPattern = /(?<!&)#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})\b|rgba?\(/gi;
const rawWeightPattern = /font-weight\s*:\s*(?!var\(--weight-)(?:\d+|bold)\b/gi;
const heavyShadowPattern = /box-shadow\s*:\s*(?!none|inset\s+0\s+0\s+0\s+\d+(?:px|rpx)\s+var\(--line\))[^;{}]*\b(?:6|7|8|9|1\d|2\d)r?px\s+(?:6|7|8|9|1\d|2\d)r?px/gi;
const viewportScalePattern = /font-size\s*:\s*clamp\s*\(/gi;
const inkBoundaryPattern = /(?:border(?:-(?:top|right|bottom|left))?|border-color)\s*:[^;{}]*var\(--ink\)/gi;
const thickFramePattern = /border\s*:\s*(?:[3-9]|\d{2,})(?:\.\d+)?rpx\s+solid/gi;

for (const file of sources) {
  const content = read(file);
  const relative = path.relative(root, file);
  const isMiniProgramStyle = relative.startsWith(`miniprogram${path.sep}`);
  const lower = content.toLowerCase();
  const componentStyles = content.replace(/@font-face\s*\{[^}]*\}/gis, "");
  for (const color of normalizedRetired) {
    if (lower.includes(color)) fail(`${relative} 使用了已退役视觉颜色 ${color}`);
  }
  if (content.match(hardWeightPattern)) fail(`${relative} 存在非系统字重；请使用 400/500/600 对应令牌`);
  if (componentStyles.match(rawWeightPattern)) fail(`${relative} 存在未引用令牌的字重`);
  if (content.match(viewportScalePattern)) fail(`${relative} 使用了随视口缩放的字号；请使用固定字阶`);
  if (content.match(heavyShadowPattern)) fail(`${relative} 存在厚重偏移阴影；内容优先界面只允许无阴影或细微层次`);
  if (isMiniProgramStyle && content.match(inkBoundaryPattern)) fail(`${relative} 使用了 --ink 作为边界；边框只能使用 --line / --line-strong 或状态色`);
  if (isMiniProgramStyle && content.match(thickFramePattern)) fail(`${relative} 存在超过 2rpx 的完整描边；主要卡片和控件只允许细线边界`);
  if (!file.endsWith("qideng-tokens.wxss") && !file.endsWith("qideng-tokens.css") && content.match(rawColorPattern)) fail(`${relative} 存在页面级颜色值；请引用 --* 语义令牌`);
  if (!file.endsWith("qideng-tokens.wxss") && !file.endsWith("qideng-tokens.css")) {
    const rawRadius = [...content.matchAll(/border-radius\s*:\s*([^;{}]+)/gi)].find((match) => {
      const value = match[1].trim();
      return !value.startsWith("var(--radius-") && !/^0(?:px|rpx)?(?:\s|$)/.test(value) && !/^50%(?:\s|$)/.test(value);
    });
    if (rawRadius) fail(`${relative} 存在页面级圆角值（${rawRadius[0].trim()}）；请引用 --radius-* 令牌`);
  }

  // New rules: hardcoded text sizes are allowed only in the generated token files.
  if (!file.endsWith("qideng-tokens.wxss") && !file.endsWith("qideng-tokens.css") && content.match(hardSizePattern)) {
    const hardcoded = [...content.matchAll(hardSizePattern)].map((match) => match[0]).slice(0, 3).join(", ");
    fail(`${relative} 存在页面级硬编码字号（${hardcoded}）；请引用 --type-* 令牌`);
  }
}

for (const file of runtimeFiles) {
  const content = read(file);
  const relative = path.relative(root, file);
  if (content.match(rawColorPattern)) fail(`${relative} 存在运行时硬编码颜色；请引用生成的 QIDENG_COLORS 或 WXML 绑定`);
  for (const phrase of retiredCopy) {
    if (content.includes(phrase)) fail(`${relative} 恢复了 new1.0 已退役文案：${phrase}`);
  }
}

const appWxss = read(path.join(root, "miniprogram/app.wxss"));
for (const required of ["@import \"./styles/qideng-tokens.wxss\"", "font-family: var(--font-sans)", "--page-gutter: var(--layout-page-gutter)"]) {
  if (!appWxss.includes(required)) fail(`miniprogram/app.wxss 缺少全局设计系统接入：${required}`);
}
const globals = read(path.join(root, "app/globals.css"));
if (!globals.includes('@import "./design-system.css"')) fail("运营台未接入唯一设计令牌");
if (!globals.includes('@font-face') || !globals.includes('/fonts/qideng-editorial-subset.woff')) fail("运营台没有加载 Qideng Editorial 字体文件");
if (!fs.existsSync(editorialFont) || fs.statSync(editorialFont).size < 1024) fail("缺少可用的 Qideng Editorial WOFF 字体子集");
if (!fs.existsSync(editorialFontModule)) fail("小程序缺少内嵌字体模块");
else if (!read(editorialFontModule).includes('data:font/woff;base64,')) fail("小程序字体模块没有内嵌 WOFF 数据");
const miniApp = read(path.join(root, "miniprogram/app.ts"));
for (const required of ["wx.loadFontFace", 'family: "Qideng Editorial"', "QIDENG_EDITORIAL_FONT_SOURCE", "global: true"]) {
  if (!miniApp.includes(required)) fail(`小程序没有完成全局字体加载：${required}`);
}
const brandHeader = read(path.join(root, "miniprogram/components/brand-header/brand-header.wxml"));
for (const required of ["奇灯", "COCOC", "在城市里，发现一次新遇"]) {
  if (!brandHeader.includes(required)) fail(`品牌表头缺少 new1.0 品牌信号：${required}`);
}

const posterCard = read(path.join(root, "miniprogram/components/poster-card/poster-card.wxss"));
if (!/\.poster-card\.featured \.poster-title\s*\{[^}]*font-size:\s*var\(--type-card\)/s.test(posterCard)) {
  fail("精选图片卡片标题必须使用 Card 字阶，不能放大成页面主标题");
}
if (/\.poster-title\s*\{[^}]*font-family:\s*var\(--font-editorial\)/s.test(posterCard)) fail("用户上传的体验标题不得使用轻量宋体子集");
const mineView = read(path.join(root, "miniprogram/pages/mine/mine.wxml"));
if (/class=["'][^"']*\b(?:profile-line|avatar)\b/.test(mineView) || mineView.includes("城市里的你")) {
  fail("“我的”页不得恢复无真实资料来源的头像、‘奇’字或‘城市里的你’占位组合");
}
const projectDetailView = read(path.join(root, "miniprogram/pages/project-detail/project-detail.wxml"));
const projectDetailLogic = read(path.join(root, "miniprogram/pages/project-detail/project-detail.ts"));
if (!projectDetailView.includes("{{contactLabel}}") || !projectDetailLogic.includes('contactLabel: "联系新遇官"')) {
  fail("结伴详情必须显示受状态控制的“联系新遇官”入口");
}
const cardImageSources = [
  "miniprogram/components/poster-card/poster-card.ts",
  "miniprogram/utils/content-discovery.ts",
  "miniprogram/pages/creator-project-preview/creator-project-preview.ts",
].map((file) => read(path.join(root, file))).join("\n");
for (const forbiddenFallback of ["home-hero.jpg", "home-diy-banner.jpg", "entry.jpg"]) {
  if (cardImageSources.includes(forbiddenFallback)) {
    fail(`体验卡片不得使用宣传横幅或横向图片作为兜底：${forbiddenFallback}`);
  }
}
for (const requiredFallback of ["companion-fallback.jpg", "self-play-fallback.jpg"]) {
  if (!cardImageSources.includes(requiredFallback)) fail(`体验卡片缺少四比五无文字兜底图：${requiredFallback}`);
}

if (!failures.length) {
  pass(`已扫描 ${wxssFiles.length} 个小程序样式文件、${cssFiles.length} 个 Web 样式文件和 ${runtimeFiles.length} 个正式运行时文件。`);
  pass("所有运行时界面使用统一令牌、固定字阶和内容优先装饰规则。");
  console.log("设计系统检查通过：");
  for (const note of notes) console.log(`- ${note}`);
  process.exit(0);
}

console.error("设计系统检查未通过：");
for (const item of failures) console.error(`- ${item}`);
process.exitCode = 1;
