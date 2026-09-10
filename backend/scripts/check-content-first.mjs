import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const failures = [];
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
const requireText = (content, value, context) => {
  if (!content.includes(value)) failures.push(`${context} 缺少：${value}`);
};

const tokens = JSON.parse(read("design-system/qideng-tokens.json"));
const tokenWxss = read("miniprogram/styles/qideng-tokens.wxss");
const viSpec = read("docs/miniapp-vi-standard.md");
const appConfig = JSON.parse(read("miniprogram/app.json"));
const appWxss = read("miniprogram/app.wxss");
const home = read("miniprogram/pages/index/index.wxml");
const tabs = read("miniprogram/components/consumer-tabs/consumer-tabs.ts");
const creatorRegisterStyles = read("miniprogram/pages/creator-register/creator-register.wxss");
const creatorProfileStyles = read("miniprogram/pages/creator-profile/creator-profile.wxss");

for (const role of ["display", "section", "card", "body", "secondary", "caption", "micro"]) {
  if (!tokens.type?.[role]) failures.push(`设计令牌缺少字体角色：${role}`);
  requireText(tokenWxss, `--type-${role}:`, "小程序令牌");
  requireText(tokenWxss, `--line-${role}:`, "小程序令牌");
  requireText(tokenWxss, `--weight-${role}:`, "小程序令牌");
}

requireText(viSpec, "Atmospheric Content-first / Sculpted Detail", "VI 规范");
requireText(viSpec, "只允许 `400 / 500`", "VI 规范");
requireText(viSpec, "实际加载 `Qideng Editorial`", "VI 规范");
requireText(viSpec, "体验卡片、体验项目封面和申请代表图固定 `4:5`", "VI 规范");
requireText(appWxss, '@import "./styles/qideng-tokens.wxss"', "小程序全局样式");
requireText(appWxss, "font-family: var(--font-sans)", "小程序全局样式");
requireText(appWxss, ".serif { font-family: var(--font-editorial)", "小程序编辑字体约束");
requireText(appWxss, "overflow-x: hidden", "小程序手机宽度约束");
requireText(appWxss, ".field { min-width: 0; max-width: 100%", "小程序表单宽度约束");
requireText(creatorRegisterStyles, "grid-template-columns: minmax(0, 1fr)", "新遇官申请手机号窄屏约束");
requireText(creatorRegisterStyles, ".register-content", "新遇官申请页面宽度约束");
requireText(creatorProfileStyles, ".location-field { width: 100%; min-width: 0; max-width: 100%", "新遇官资料城市字段宽度约束");

if (appConfig.pages?.[0] !== "pages/index/index") failures.push("内容发现首页必须是小程序首个页面");
if (appConfig.window?.navigationStyle !== "custom") failures.push("品牌安全表头要求使用 custom navigationStyle");
if (appConfig.window?.backgroundColor?.toUpperCase() !== String(tokens.colors.paper).toUpperCase()) failures.push("小程序窗口背景必须与 --paper 令牌一致");

for (const label of ["发现", "自在", "结伴", "我的"]) requireText(tabs, `label: "${label}"`, "消费者底部导航");
for (const label of ["本周精选", "今日发现", "更多探索", "或许喜欢的", "发现新遇"]) requireText(home, label, "内容发现首页");
requireText(home, "<brand-header", "内容发现首页");
requireText(home, "immersive", "内容发现首页全幅表头");
requireText(home, '<consumer-tabs active="home"', "内容发现首页");

if (failures.length) {
  console.error("内容发现版合同检查未通过：");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log("内容发现版合同检查通过：固定字阶、品牌表头、发现首页和四项消费者导航均已锁定。");
}
