import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const exists = (file) => fs.existsSync(path.join(root, file));

const failures = [];
const notes = [];

function fail(message) {
  failures.push(message);
}

function pass(message) {
  notes.push(message);
}

function walk(dir) {
  const full = path.join(root, dir);
  if (!fs.existsSync(full)) return [];
  return fs.readdirSync(full, { withFileTypes: true }).flatMap((entry) => {
    const relative = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(relative);
    return relative;
  });
}

const appJson = JSON.parse(read("miniprogram/app.json"));
const packageJson = JSON.parse(read("package.json"));
const versionSource = read("lib/version.ts");
const versionRoute = read("app/version/route.ts");

const retiredPages = [
  "pages/draw/draw",
  "pages/loading/loading",
  "pages/reveal/reveal",
  "pages/activity/activity",
  "pages/location/location",
  "pages/consult/consult",
];

for (const retiredWebPage of ["app/login/page.tsx", "app/join/page.tsx", "app/studio/page.tsx"]) {
  if (exists(retiredWebPage)) fail(`旧创作者密码网页仍存在：${retiredWebPage}`);
}
if (!read("app/page.tsx").includes('redirect("/admin/login")')) fail("网页根地址必须进入奇灯运营台登录页");
else pass("网页根地址只进入奇灯运营台，旧创作者密码页面已退休。");

const forbiddenPhrases = [
  "启灯",
  "奇灯试玩",
  "自由玩",
  "预约试玩",
  "可寄材料",
  "翻灯牌",
  "翻取",
  "翻到",
  "彼里市",
  "兴趣地图",
  "有趣是试着玩出来的",
  "兴趣是试着玩出来的",
  "陪玩官",
  "奇灯工坊",
  "奇灯兴趣试玩工坊",
  "可线上聊",
  "同城可见面",
];

const runtimeDirs = [
  "app",
  "lib",
  ...appJson.pages.map((page) => path.dirname(path.join("miniprogram", `${page}.wxml`))),
];

const runtimeFiles = [...new Set(runtimeDirs.flatMap((dir) => walk(dir)))]
  .filter((file) => /\.(ts|tsx|js|jsx|wxml|wxss|json|mjs|css)$/.test(file))
  .filter((file) => !file.includes(".next/"));

for (const page of retiredPages) {
  if (appJson.pages.includes(page)) fail(`小程序仍注册旧页面：${page}`);
  if (exists(path.join("miniprogram", "pages", page.split("/")[1]))) fail(`小程序包仍保留旧页面目录：${page}`);
}
if (!retiredPages.some((page) => appJson.pages.includes(page) || exists(path.join("miniprogram", "pages", page.split("/")[1]))))
  pass("旧抽取、加载、活动、地区和在线咨询页面已从小程序包移除。");

for (const page of appJson.pages) {
  for (const ext of ["json", "ts", "wxml", "wxss"]) {
    const file = `miniprogram/${page}.${ext}`;
    if (!exists(file)) fail(`已注册页面缺少文件：${file}`);
  }
}
pass(`已检查 ${appJson.pages.length} 个已注册小程序页面。`);

for (const file of runtimeFiles) {
  const content = read(file);
  for (const phrase of forbiddenPhrases) {
    if (content.includes(phrase)) fail(`运行时代码包含禁用词“${phrase}”：${file}`);
  }
  if (content.includes("忙碌") || /status\s*[:=]\s*["']busy["']/.test(content) || /value=["']busy["']/.test(content)) {
    fail(`运行时代码仍包含创作者 busy/忙碌 状态：${file}`);
  }
}
pass(`已扫描 ${runtimeFiles.length} 个运行时文件的正式业务文案。`);

const registeredPageText = appJson.pages
  .map((page) => ["wxml", "ts", "json"].map((ext) => read(`miniprogram/${page}.${ext}`)).join("\n"))
  .concat(read("miniprogram/components/brand-header/brand-header.wxml"))
  .join("\n");
if (!registeredPageText.includes("奇灯")) fail("已注册页面中没有出现正式名称：奇灯");
if (!registeredPageText.includes("在城市里，发现一次新遇")) fail("已注册页面中没有出现正式标语：在城市里，发现一次新遇");
if (!registeredPageText.includes("自在")) fail("已注册页面中没有出现玩法入口：自在");
if (!registeredPageText.includes("结伴")) fail("已注册页面中没有出现玩法入口：结伴");

if (packageJson.name !== "qideng-workshop-platform-new1") fail(`package name 应为 qideng-workshop-platform-new1，当前为 ${packageJson.name}`);
else pass("工程包名为 qideng-workshop-platform-new1。");
if (!/^\d+\.\d+\.\d+-new1$/.test(packageJson.version)) fail(`package version 应使用 new1 发布版本，当前为 ${packageJson.version}`);
if (!versionSource.includes(`APP_VERSION = "${packageJson.version}"`)) fail("lib/version.ts 的 APP_VERSION 必须与 package.json version 一致");
if (!versionRoute.includes("品牌：奇灯")) fail("/version 路由必须显示正式品牌名：奇灯");
if (versionRoute.includes("奇灯 AI 智能体")) fail("/version 路由仍包含旧项目名：奇灯 AI 智能体");
else pass("版本路由项目名与发布版本已校验。");

const deployFiles = ["deploy/README.md", "deploy/nginx.conf", "deploy/nginx-bootstrap.conf", "deploy/qideng-backup"];
for (const file of deployFiles) {
  const content = read(file);
  for (const forbidden of [
    "qideng-mini-program-platform",
    "qideng-workshop-platform",
    "/opt/qideng-workshop-platform",
    "admin.thedesignexpo.org.cn",
    "api.thedesignexpo.org.cn",
    "127.0.0.1:3125",
    "admin123456",
    "13900139000",
    "test123456",
  ]) {
    if (content.includes(forbidden)) fail(`部署文件仍包含不适用内容“${forbidden}”：${file}`);
  }
}
if (!read("deploy/README.md").includes("127.0.0.1:3001")) fail("部署说明缺少 TDE 统一服务端口");
if (!read("deploy/nginx.conf").includes("server_name tde.thedesignexpo.org.cn")) fail("Nginx 配置缺少 TDE 域名");
if (!read("deploy/nginx.conf").includes("server_name viz.thedesignexpo.org.cn")) fail("Nginx 配置缺少 viz 域名");
if (!read("deploy/nginx.conf").includes("root /opt/tde/frontend")) fail("Nginx 配置缺少静态目录");
pass("部署文件已锁定 /opt/tde、3001、tde/viz 域名和无凭据发布边界。");

const envExample = read(".env.example");
const requiredEnvKeys = [
  "DATA_DIR",
  "PUBLIC_SITE_URL",
  "ADMIN_USERNAME",
  "ADMIN_PASSWORD",
];
for (const key of requiredEnvKeys) {
  if (!new RegExp(`^${key}=`, "m").test(envExample)) fail(`.env.example 缺少 ${key}`);
}
if (envExample.includes("ADMIN_PASSWORD_HASH") || envExample.includes("ADMIN_PASSWORD_SALT"))
  fail(".env.example 不应再使用 ADMIN_PASSWORD_HASH/ADMIN_PASSWORD_SALT，请使用 ADMIN_USERNAME/ADMIN_PASSWORD");
if (envExample.includes("WECOM_KF_SECRET") || envExample.includes("WORKSHOP_WECOM_CONTACT_URL"))
  fail(".env.example 不应再要求企业微信客服配置；企业微信仅用于内部通知");
pass(".env.example 包含生产上线所需关键变量。");

const legacyActivityRoute = read("app/api/mini/activities/[id]/route.ts");
if (legacyActivityRoute.includes("recommendedContact") || legacyActivityRoute.includes("listCreatorContactChannels"))
  fail("旧活动详情接口仍可能暴露企业微信客服入口");
const retiredContactRoute = read("app/api/admin/workshop/contact/route.ts");
if (!retiredContactRoute.includes("status: 410") || !retiredContactRoute.includes("注册手机号直接联系"))
  fail("运营台旧企业微信客服联系编辑接口未明确退役");
const workshopAdminSource = read("app/components/MiniProgramAdminView.tsx");
if (/企业微信客服|微信客服链接|contactQr/.test(workshopAdminSource))
  fail("运营台仍包含消费者企业微信客服编辑控件");
const wecomSource = read("lib/wecom.ts");
if (/customer_service|\/kf\//.test(wecomSource)) fail("企业微信运行时代码仍包含消费者客服账号能力");
pass("消费者联系已固定为授权手机号直联，企业微信只保留内部通知。");

for (const legalFile of ["docs/privacy-policy-draft-2026-08-22.md", "docs/creator-service-agreement-draft-2026-08-22.md"]) {
  const content = read(legalFile);
  if (/\[(?:待补充|完整公司名称|个人信息联系渠道|官方微信)/.test(content)) fail(`${legalFile} 仍包含上线占位信息`);
  for (const required of ["行济诚生（北京）文化传播有限公司", "北京市顺义区杨镇地区格吉路7-342号", "kevin091120@126.com"])
    if (!content.includes(required)) fail(`${legalFile} 缺少运营主体上线信息：${required}`);
}
const miniLegal = read("miniprogram/pages/legal/legal.ts");
for (const required of ["行济诚生（北京）文化传播有限公司", "kevin091120@126.com", "30日内", "不少于6个月"])
  if (!miniLegal.includes(required)) fail(`小程序法律文本缺少上线信息：${required}`);
pass("隐私政策与服务协议已补齐运营主体、联系渠道、保存期限和第三方处理说明。");

if (failures.length) {
  console.error("上线体检未通过：");
  for (const item of failures) console.error(`- ${item}`);
  process.exitCode = 1;
} else {
  console.log("上线体检通过：");
  for (const item of notes) console.log(`- ${item}`);
}
