import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const failures = [];
const notes = [];

function fail(message) {
  failures.push(message);
}

function pass(message) {
  notes.push(message);
}

function mustInclude(file, values, label = file) {
  const content = read(file);
  for (const value of values) {
    if (!content.includes(value)) fail(`${label} 缺少上线规则信号：${value}`);
  }
}

function mustMatch(file, patterns, label = file) {
  const content = read(file);
  for (const pattern of patterns) {
    if (!pattern.test(content)) fail(`${label} 缺少上线规则匹配：${pattern}`);
  }
}

mustInclude("miniprogram/components/brand-header/brand-header.wxml", [
  "奇灯",
  "在城市里，发现一次新遇",
  'mode="multiSelector"',
], "统一品牌表头");
mustInclude("miniprogram/components/brand-header/brand-header.wxss", [
  "position: fixed",
  "z-index: 9999",
  "--brand-safe-height",
  "box-sizing: border-box",
  "height: var(--brand-main-height)",
  "background: var(--paper)",
  "background: var(--night)",
], "表头安全层");
mustInclude("miniprogram/components/consumer-tabs/consumer-tabs.wxml", [
  "bindtap=\"open\"",
  "tab-icon",
], "消费者四栏底部导航");
mustInclude("miniprogram/components/consumer-tabs/consumer-tabs.ts", [
  'label: "发现"',
  'label: "自在"',
  'label: "结伴"',
  'label: "我的"',
  "/pages/index/index",
  "/pages/self-play/self-play",
  "/pages/companion/companion",
  "/pages/mine/mine",
], "消费者四栏导航逻辑");
mustInclude("miniprogram/app.json", [
  "pages/self-play/self-play",
  "pages/companion/companion",
  "pages/kit-detail/kit-detail",
  "pages/project-detail/project-detail",
], "自在与结伴独立页面");
mustInclude("miniprogram/components/consumer-tabs/consumer-tabs.wxss", [
  "grid-template-columns: repeat(4",
  "var(--accent-pressed)",
  "var(--accent-soft)",
  "env(safe-area-inset-bottom)",
  "background: var(--paper)",
  "background: var(--night)",
], "内容优先版底栏视觉");
mustInclude("miniprogram/components/poster-card/poster-card.wxss", [
  "aspect-ratio: 4 / 5",
  "border-radius: var(--radius-default)",
  "font-weight: var(--weight-medium)",
], "内容优先版四比五图片卡片");
mustInclude("miniprogram/pages/index/index.wxss", [
  "var(--paper)",
  "var(--ink)",
  "var(--accent)",
  "touch-action: pan-x pan-y",
  "overflow-x: hidden",
], "内容优先版首页视觉");
mustInclude("app/globals.css", [
  "@import \"./design-system.css\"",
  "--soft-line: var(--line)",
  "--surface-2: var(--surface-soft)",
  "--green: var(--success)",
], "运营台经典视觉层级");
const frontEndPaletteSources = [
  "miniprogram/components/brand-header/brand-header.wxss",
  "miniprogram/components/consumer-tabs/consumer-tabs.wxss",
  "miniprogram/components/poster-card/poster-card.wxss",
  "miniprogram/pages/index/index.wxss",
  "miniprogram/styles/content-list.wxss",
].map(read).join("\n").toLowerCase();
for (const retiredColor of [
  "#b8e0c5", "#abcdef", "#f2b4bd", "#f7d887", "#5b605e", "#6d7370",
  "#858b88", "#cbd8d0", "#aebfb5", "#dce9e1",
  "#829788", "#7e92a6", "#b97676", "#c5a562", "#2f312e", "#4b4e52",
  "#b99bd8", "#d5c3eb", "#cbb4e3", "#dccdf0", "#f5effb",
])
  if (frontEndPaletteSources.includes(retiredColor)) fail(`核心视觉不应混入非截图基准颜色：${retiredColor}`);
const styleSources = [
  ...fs.readdirSync(path.join(root, "miniprogram"), { recursive: true })
    .filter((file) => String(file).endsWith(".wxss"))
    .map((file) => read(path.join("miniprogram", String(file)))),
  read("app/globals.css"),
].join("\n").toLowerCase();
for (const retiredColor of ["#b99bd8", "#d5c3eb", "#cbb4e3", "#dccdf0", "#f5effb"])
  if (styleSources.includes(retiredColor)) fail(`全局视觉不应使用紫色主边框或阴影：${retiredColor}`);
for (const heavyDecoration of ["box-shadow: 6rpx 6rpx", "border: 4rpx solid #202124", "font-weight: 900"])
  if (frontEndPaletteSources.includes(heavyDecoration)) fail(`内容优先核心页面不应恢复厚描边或手绘重装饰：${heavyDecoration}`);
mustInclude("miniprogram/pages/index/index.wxml", [
  "本周精选",
  "今日发现",
  "更多探索",
  "或许喜欢的",
  "发现新遇",
  "请帮我们找到这座城市的奇灯新遇官",
  "联系奇灯",
  "poster-card",
], "内容发现首页");
mustInclude("miniprogram/pages/index/index.ts", [
  "/api/mini/workshop/home",
  "filteredPosters",
  "discoverySections",
  "availableInterests",
  "initialFeedSize = 12",
  "feedPageSize = 8",
], "内容发现首页逻辑");
for (const retiredHomeEntry of ["搜索", "discovery-stage", "card-deck", "马上探照新遇", "/api/mini/workshop/discovery", "recordDiscovery"])
  if (`${read("miniprogram/pages/index/index.wxml")}\n${read("miniprogram/pages/index/index.ts")}`.includes(retiredHomeEntry))
    fail(`内容发现首页不应恢复旧探照版入口或搜索：${retiredHomeEntry}`);
mustInclude("miniprogram/utils/content-discovery.ts", [
  "availableInterests",
  'tag.status === "active"',
  'item.availableDate === date',
  "discoverySections",
  "今日上新",
  "首发尝鲜",
  "限时限量",
  "好评精选",
], "内容发现筛选与推荐逻辑");
mustInclude("scripts/refresh-workshop-preview.mjs", [
  "QIDENG_PREVIEW_DEMO",
  "category = '我的作品'",
  "status = 'published'",
  "primary_category_tag_id",
  "daysFromToday * 86400000",
], "官方测试数据刷新边界");
pass("消费者首页保留固定品牌表头、省市选择、内容推荐、动态品类、更多探索和四栏底部导航。");

mustInclude("miniprogram/pages/self-play/self-play.wxml", [
  "poster-card",
  "更多探索",
  "发现新遇",
  "申请奇灯新遇官",
], "自在页面");
mustInclude("miniprogram/utils/presentation.ts", ["营业时间", "详细地址", "路线指引", "查看详情"], "自在卡片");
mustInclude("miniprogram/pages/kit-detail/kit-detail.wxml", [
  "自在指南",
  "店内规范",
  "联系奇灯",
], "材料包详情");
mustInclude("miniprogram/pages/kit-detail/kit-detail.ts", ["query.scene", "contactCopy", "wx.showModal"], "材料包扫码与联系奇灯");
for (const retiredFeedback of ["问题反馈", "教程看不懂", "材料缺失", "安全问题", "/api/mini/workshop/support"])
  if (`${read("miniprogram/pages/kit-detail/kit-detail.wxml")}\n${read("miniprogram/pages/kit-detail/kit-detail.ts")}`.includes(retiredFeedback))
    fail(`材料包详情不应出现旧反馈功能：${retiredFeedback}`);
mustInclude("miniprogram/pages/self-play/self-play.ts", [
  "/api/mini/workshop/self-play",
  "/pages/kit-detail/kit-detail",
], "自在独立链路");
pass("自在链路保留当前城市内容卡片、更多探索、查看详情、教程规范和静态联系奇灯。");

mustInclude("miniprogram/pages/companion/companion.wxml", [
  "奇灯新遇官亲历陪伴体验",
  "默认未来有日期",
  "更多探索",
  "或许喜欢的",
  "发现新遇",
  "poster-card",
], "结伴页面");
mustInclude("miniprogram/utils/presentation.ts", ["project.oneLiner", "查看详情", "project.minPeople", "project.durationMinutes"], "结伴卡片");
mustInclude("miniprogram/pages/companion/companion.ts", [
  "/api/mini/workshop/companion",
  "/pages/project-detail/project-detail",
  "this.data.date ? `&date=",
  "availableInterests",
], "结伴逻辑");
const miniSource = fs.readdirSync(path.join(root, "miniprogram"), { recursive: true })
  .filter((file) => /\.(?:ts|wxml|json)$/.test(String(file)))
  .map((file) => read(path.join("miniprogram", String(file))))
  .join("\n");
for (const retiredShareSignal of ['pages/share/share', 'open-type="share"', "onShareAppMessage", "onShareTimeline", "showShareMenu"])
  if (miniSource.includes(retiredShareSignal)) fail(`用户分享能力已经退役，不应出现：${retiredShareSignal}`);
if (!miniSource.includes("hideShareMenu")) fail("小程序必须显式关闭用户转发菜单");
if (fs.existsSync(path.join(root, "app/api/mini/share-code/route.ts"))) fail("用户分享小程序码接口已经退役");
pass("结伴保留独立详情、默认未来日期、指定日期精确匹配和动态品类筛选，并读取首页已选城市。");

mustInclude("miniprogram/pages/creator-project/creator-project.wxml", ['mode="region"'], "创作者项目城市选择");
mustInclude("miniprogram/pages/creator-project/creator-project.wxml", ["发布体验", "历史体验", "设为展示", "删除", "预览图片"], "创作者项目管理");
mustInclude("miniprogram/pages/creator-project/creator-project.ts", ["confirmAction", "selectedForDisplay: true", 'status: "archived"', "wx.previewImage"], "项目确认与图片预览");
if (read("miniprogram/pages/creator-project/creator-project.wxml").includes("display-choice")) fail("项目编辑表单不应继续放置设为展示控件");
mustInclude("miniprogram/pages/image-crop/image-crop.wxml", ["catchtouchstart", "catchtouchmove", 'min="100"', 'max="400"', 'step="1"'], "稳定裁图手势");
if (read("miniprogram/pages/image-crop/image-crop.wxml").includes("movable-view")) fail("裁图页不应继续使用会产生缩放反馈跳动的 movable-view");
mustInclude("miniprogram/pages/mine/mine.wxml", ["申请奇灯新遇官", "管理我的新遇官"], "消费者新遇官入口");
if (read("miniprogram/pages/mine/mine.wxml").includes("查看申请")) fail("消费者我的不应保留独立查看申请按钮");
if (read("miniprogram/app.json").includes("pages/location/location")) fail("消费者旧城市地区选择页不应注册");
mustInclude("miniprogram/components/brand-header/brand-header.wxml", ['mode="multiSelector"'], "表头省市选择");
mustInclude("miniprogram/utils/location.ts", ["DEFAULT_CONSUMER_LOCATION", 'city: "北京市"'], "消费者默认城市");
if (read("miniprogram/utils/location.ts").includes("wx.getLocation")) fail("消费者城市不应依赖自动定位或地图配额");
pass("消费者默认北京并在首页自选省市，新遇官项目在当前表单内选择省市区。");

mustInclude("lib/mini-program-types.ts", [
  'slotKey: "limited" | "new_today" | "first_launch" | "featured"',
  'channelType: "wecom"',
], "小程序类型");
if (read("lib/mini-program-types.ts").includes("CreatorPresenceStatus")) fail("在线状态类型已经退役");
mustInclude("lib/mini-program.ts", [
  "const sceneTags = new Set<string>(projectSceneTags)",
  "oneLiner",
  "phoneContact",
  "phone_public_authorized",
  '["limited", "new_today", "first_launch", "featured"]',
  "review_status = 'approved'",
  "creator.managerAdminId !== principal.id",
], "小程序服务逻辑");
mustInclude("miniprogram/pages/project-detail/project-detail.ts", [
  "ensureConsumerSession",
  "wx.makePhoneCall",
  "wx.setClipboardData",
  'contactLabel: "联系新遇官"',
  'contactLabel: contactAvailable ? "联系新遇官" : "暂未开放联系"',
  "该新遇官暂未开放联系",
], "手机号直接联系逻辑");
mustInclude("miniprogram/pages/project-detail/project-detail.wxml", [
  "{{contactLabel}}",
  "{{contactPhone || maskedPhone}}",
  "查看号码",
  "复制号码",
  "拨打电话",
], "联系新遇官前台入口");
mustInclude("lib/mini-program.ts", [
  "体验请在体验详情联系新遇官",
  "体验发布前必须由新遇官授权公开注册手机号",
], "体验项目咨询门禁");
mustInclude("app/api/mini/consultations/route.ts", ["在线咨询已关闭", "status: 410"], "官方在线咨询退役");
mustInclude("app/api/mini/workshop/support/route.ts", ["问题反馈已改为", "status: 410"], "问题反馈退役");
mustInclude("app/api/admin/workshop/contact/route.ts", ["注册手机号直接联系", "status: 410"], "旧企业微信客服编辑退役");
if (/企业微信客服|微信客服链接|contactQr/.test(read("app/components/MiniProgramAdminView.tsx")))
  fail("运营台不应继续提供消费者企业微信客服编辑功能");
if (/recommendedContact|listCreatorContactChannels/.test(read("app/api/mini/activities/[id]/route.ts")))
  fail("旧活动详情接口不应返回企业微信客服入口");
if (/customer_service|\/kf\//.test(read("lib/wecom.ts")))
  fail("企业微信运行时只应保留成员目录和内部应用通知能力");
if (read("miniprogram/app.json").includes("pages/consult/consult")) fail("旧在线咨询页面不应注册到小程序");
mustMatch("lib/mini-program.ts", [
  /if \(!oneLiner \|\| !city\) throw new Error\("请填写一句话体验和城市"\);/,
], "小程序服务逻辑");
pass("服务端规则保留项目一句话必填、栏目审核、手机号授权和子管理员范围限制，并移除在线状态依赖。");

mustInclude("app/api/admin/export/route.ts", [
  "requireSuperAdmin",
  "export_creators",
], "导出接口");
mustInclude("tests/mini-program.test.mjs", [
  "blockedExport.response.status, 403",
  "const publicProject = publicCompanion.payload.projects.find((item) => item.id === workshopProjectId)",
  '"presenceStatus" in publicProject, false',
  "projectDetail.payload.phoneContact",
  "directContact.payload.phone",
], "小程序端到端测试");
mustInclude("tests/confirmed-requirements-contract.test.mjs", [
  '["发现", "自在", "结伴", "我的"]',
  "奇灯新遇官亲历陪伴体验",
  "更多探索",
  "或许喜欢的",
  "发现新遇",
], "当前消费者体验契约测试");
pass("权限与角色回测覆盖子管理员不可导出、内容优先四栏导航、精确日期、在线状态退役和手机号直接联系入口。");

const forbiddenRuntime = [
  ["miniprogram/pages/index/index.wxml", "奇灯试玩"],
  ["miniprogram/pages/index/index.wxml", "自由玩"],
  ["miniprogram/pages/index/index.wxml", "有趣是试着玩出来的"],
  ["miniprogram/pages/companion/companion.wxml", "同城可见面"],
  ["miniprogram/pages/companion/companion.wxml", "可线上聊"],
  ["miniprogram/pages/kit-detail/kit-detail.wxml", "预约试玩"],
  ["miniprogram/pages/kit-detail/kit-detail.wxml", "积分"],
  ["miniprogram/pages/venue-detail/venue-detail.wxml", "积分"],
  ["miniprogram/pages/venue-detail/venue-detail.wxml", "库存"],
  ["app/components/MiniProgramAdminView.tsx", "当前库存"],
  ["app/components/MiniProgramAdminView.tsx", "配置材料包库存"],
  ["app/components/MiniProgramAdminView.tsx", "可接待人数"],
  ["app/components/MiniProgramAdminView.tsx", "已占用名额"],
  ["app/components/MiniProgramAdminView.tsx", "已满"],
  ["lib/mini-program-types.ts", "stock:"],
  ["lib/mini-program-types.ts", "pointsReward"],
  ["lib/mini-program-types.ts", "reservedCount"],
  ["miniprogram/pages/project-detail/project-detail.ts", "fallbackConsult"],
  ["app/components/MiniProgramAdminView.tsx", 'value="wechat"'],
  ["app/components/MiniProgramAdminView.tsx", 'value="mini_consult"'],
  ["app/components/MiniProgramAdminView.tsx", 'value="phone"'],
  ["app/components/MiniProgramAdminView.tsx", 'value="other"'],
];
for (const [file, phrase] of forbiddenRuntime) {
  if (read(file).includes(phrase)) fail(`${file} 不应出现旧业务文案：${phrase}`);
}
pass("重点界面与前端数据未发现库存、积分、名额占用等已取消功能。");

for (const retiredPage of ["app/login/page.tsx", "app/join/page.tsx", "app/studio/page.tsx"]) {
  if (fs.existsSync(path.join(root, retiredPage))) fail(`旧创作者密码页面不应存在：${retiredPage}`);
}
mustInclude("app/page.tsx", ['redirect("/register.html")'], "网页主理人入口");
pass("网页只公开运营台入口，创作者继续使用小程序微信授权身份。");

if (failures.length) {
  console.error("工作坊业务规则体检未通过：");
  for (const item of failures) console.error(`- ${item}`);
  process.exitCode = 1;
} else {
  console.log("工作坊业务规则体检通过：");
  for (const item of notes) console.log(`- ${item}`);
}
