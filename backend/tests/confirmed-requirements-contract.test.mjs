import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

const root = path.resolve(import.meta.dirname, "..");

function read(relative) {
  return readFileSync(path.join(root, relative), "utf8");
}

function sourceTree(relative) {
  const base = path.join(root, relative);
  const values = [];
  for (const name of readdirSync(base)) {
    const target = path.join(base, name);
    if (statSync(target).isDirectory()) values.push(sourceTree(path.relative(root, target)));
    else if (/\.(ts|wxml|wxss|json)$/.test(name)) values.push(readFileSync(target, "utf8"));
  }
  return values.flat().join("\n");
}

function filesIn(relative, extension) {
  const base = path.join(root, relative);
  const values = [];
  for (const name of readdirSync(base)) {
    const target = path.join(base, name);
    if (statSync(target).isDirectory()) values.push(...filesIn(path.relative(root, target), extension));
    else if (target.endsWith(extension)) values.push(target);
  }
  return values;
}

test("confirmed mini-program product boundaries remain locked in source", async () => {
  const app = JSON.parse(read("miniprogram/app.json"));
  const tabs = read("miniprogram/components/consumer-tabs/consumer-tabs.wxml");
  const tabsLogic = read("miniprogram/components/consumer-tabs/consumer-tabs.ts");
  const tabsStyles = read("miniprogram/components/consumer-tabs/consumer-tabs.wxss");
  assert.deepEqual([...tabsLogic.matchAll(/label: "([^"]+)"/g)].map((match) => match[1]), ["发现", "自在", "结伴", "我的"]);
  assert.match(tabs, /tab-icon[\s\S]*item\.activeIcon[\s\S]*immersive \? item\.lightIcon/);
  assert.match(tabs, /immersive \? 'immersive'/);
  assert.match(tabsStyles, /\.consumer-tabs\s*\{[^}]*background:\s*var\(--paper\)/s);
  assert.match(tabsStyles, /\.consumer-tabs\.immersive\s*\{[^}]*background:\s*var\(--night\)/s);
  assert.doesNotMatch(tabsStyles, /background:\s*var\(--(?:glass-strong|paper-translucent)\)/);
  assert.doesNotMatch(tabsLogic, /马上探照新遇/);
  const creatorTabs = read("miniprogram/components/creator-tabs/creator-tabs.wxml");
  const creatorTabsData = read("miniprogram/components/creator-tabs/creator-tabs.ts");
  assert.deepEqual([...creatorTabsData.matchAll(/label: "([^"]+)"/g)].map((match) => match[1]), ["体验", "通知", "我的"]);
  assert.doesNotMatch(creatorTabs, /<(span|i)[\s>]/);
  assert.doesNotMatch(creatorTabsData, /label: "回复"/);
  assert.match(creatorTabs, /item\.key === 'notices' && noticeUnread/);
  const creatorTabsStyles = read("miniprogram/components/creator-tabs/creator-tabs.wxss");
  assert.match(creatorTabsStyles, /\.tab-mark[\s\S]*40rpx/);
  assert.match(creatorTabsStyles, /\.creator-tabs\s*\{[^}]*background:\s*var\(--paper\)/s);
  assert.doesNotMatch(creatorTabsStyles, /background:\s*var\(--(?:glass-strong|paper-translucent)\)/);
  assert.doesNotMatch(creatorTabsStyles, /\.creator-tabs \.(?:project|replies|notices|mine)/);
  assert.ok(app.pages.includes("pages/self-play/self-play"));
  assert.ok(app.pages.includes("pages/companion/companion"));
  assert.ok(app.pages.includes("pages/kit-detail/kit-detail"));
  assert.ok(app.pages.includes("pages/project-detail/project-detail"));
  assert.ok(!app.pages.includes("pages/share/share"));
  assert.ok(!app.pages.includes("pages/consult/consult"));
  assert.ok(!app.pages.includes("pages/creator-chat/creator-chat"));
  assert.ok(!app.pages.includes("pages/creator-replies/creator-replies"));
  assert.equal(existsSync(path.join(root, "miniprogram/pages/creator-login")), false);
  assert.equal(existsSync(path.join(root, "miniprogram/pages/creator-chat")), false);
  for (const page of ["index/index", "self-play/self-play", "companion/companion"]) {
    const mainView = read(`miniprogram/pages/${page}.wxml`);
    assert.doesNotMatch(mainView, /FRESH AIR|SOLO|TOGETHER|个体验|discovery-heading|content-list-heading/);
  }
  for (const retiredPage of ["activity", "consult", "draw", "loading", "location", "reveal", "share"])
    assert.equal(existsSync(path.join(root, `miniprogram/pages/${retiredPage}`)), false);

  for (const stylesheet of filesIn("miniprogram", ".wxss")) {
    const content = readFileSync(stylesheet, "utf8");
    for (const match of content.matchAll(/@import\s+["']([^"']+)["']/g)) {
      const imported = path.resolve(path.dirname(stylesheet), match[1]);
      assert.ok(existsSync(imported), `${path.relative(root, stylesheet)} imports missing ${match[1]}`);
    }
  }

  for (const page of app.pages) {
    if (page === "pages/image-crop/image-crop") continue;
    const wxml = read(`miniprogram/${page}.wxml`);
    assert.match(wxml, /<brand-header(?:\s|\/>)/, `${page} should use the shared brand header`);
    assert.match(wxml, /<(consumer-tabs|creator-tabs)(?:\s|\/>)/, `${page} should use a fixed bottom tab bar`);
  }

  const miniSource = sourceTree("miniprogram");
  for (const forbidden of ["创作者密码", "修改密码", "初始密码", "产品名称", "积分商城", "优惠券", "核销", "库存管理"])
    assert.doesNotMatch(miniSource, new RegExp(forbidden));

  const register = read("miniprogram/pages/creator-register/creator-register.wxml");
  for (const field of ["再次输入手机号", "applicationFields.brandName", "mode=\"region\"", "applicationFields.intro", "applicationFields.tags", "applicationFields.busyPeriods"])
    assert.match(register, new RegExp(field));
  assert.match(register, /wx:if="\{\{creatorInvitationsEnabled\}\}"[^>]*>[\s\S]*?邀请码/);
  assert.match(register, /wx:for="\{\{tagGroups\}\}"[\s\S]*?custom-tag-row[\s\S]*?新增标签/);
  assert.match(read("lib/database.ts"), /creator_invitations_enabled INTEGER NOT NULL DEFAULT 0/);
  const applicationFields = read("miniprogram/utils/creator-application-fields.ts");
  for (const label of ["品牌 / 工作室名称", "上传一张不超过20MB的图片", "新遇官标签", "已经安排的活动档期", "避免我们在这些日期打扰你"])
    assert.match(applicationFields, new RegExp(label));
  assert.match(applicationFields, /busyPeriods:\s*\{ enabled: true, required: true/);
  assert.match(register, /近期无其他活动安排[\s\S]*指奇灯以外的活动/);
  assert.match(read("app/api/mini/auth/creator-register/route.ts"), /!noBookings && !busyPeriods\.length/);
  const tagCatalog = await import("../miniprogram/utils/creator-tags.ts");
  const serverCatalog = await import("../lib/catalog.ts");
  assert.deepEqual(tagCatalog.creatorTagCategories, ["我的身份", "我的作品", "我的客群", "我的风格", "现场体验", "DIY材料包"]);
  for (const category of tagCatalog.creatorTagCategories)
    assert.deepEqual([...tagCatalog.creatorTagCatalog[category]], serverCatalog.tagSeeds[category]);

  const crop = read("miniprogram/pages/image-crop/image-crop.wxml");
  assert.match(crop, /crop-footer[\s\S]*bindtap="confirm"/);
  assert.doesNotMatch(crop, /crop-topbar"><button[^>]*bindtap="confirm"/);
  assert.match(crop, /catchtouchstart="touchStart"[\s\S]*catchtouchmove="touchMove"/);
  assert.match(crop, /slider[\s\S]*min="100"[\s\S]*max="400"[\s\S]*step="1"/);
  assert.match(crop, /bindtap="nudgeScale"/);
  assert.doesNotMatch(crop, /movable-view|bindscale=/);
  assert.doesNotMatch(crop, /out-of-bounds/);
  const cropLogic = read("miniprogram/pages/image-crop/image-crop.ts");
  assert.match(cropLogic, /pinchDamping[\s\S]*beginPinch[\s\S]*focusImageX/);
  assert.match(cropLogic, /qideng_project_image_result[\s\S]*localPath/);

  const projectForm = read("miniprogram/pages/creator-project/creator-project.wxml");
  for (const field of ["minPeople", "maxPeople", "durationMinutes", "推荐栏目", "发布体验", "历史体验", "设为展示", "删除", "预览图片", "提交审核"])
    assert.match(projectForm, new RegExp(field));
  const projectLogic = read("miniprogram/pages/creator-project/creator-project.ts");
  assert.match(projectLogic, /const projectCategories = \["我的作品", "我的客群", "我的风格", "现场体验", "项目场景"\]/);
  assert.match(projectLogic, /"项目场景": \{ label: "使用场景"/);
  assert.doesNotMatch(projectLogic, /const projectCategories = \[[^\]]*"项目运营"/);
  assert.match(projectLogic, /setDisplayProject[\s\S]*confirmAction[\s\S]*selectedForDisplay: true/);
  assert.match(projectLogic, /deleteProject[\s\S]*confirmAction[\s\S]*status: "archived"/);
  assert.match(projectLogic, /openImagePreview[\s\S]*wx\.previewImage/);
  assert.doesNotMatch(projectLogic.match(/async chooseImage\(\)[\s\S]*?previewProjectImage\(\)/)?.[0] || "", /validationMessage\(\)|saveProject\(\)/);
  assert.doesNotMatch(projectLogic.match(/preview\(\)[\s\S]*?async save\(\)/)?.[0] || "", /validationMessage\(\)/);
  assert.match(projectLogic, /persistPendingProjectImage[\s\S]*project-image/);
  assert.match(projectLogic, /activeOperationRequest[\s\S]*firstLaunchRequest[\s\S]*limitedRequest/);
  assert.match(projectForm, /wx:if="\{\{firstLaunchRequest\}\}"[\s\S]*wx:if="\{\{limitedRequest\}\}"/);
  for (const label of ["体验品类", "适合人群", "体验风格", "体验形式"])
    assert.match(`${projectForm}\n${projectLogic}`, new RegExp(label));
  assert.match(projectForm, /application-tag-link[\s\S]*applicationActionLabel/);
  assert.match(projectLogic, /请先在新遇官申请资料中选择/);
  assert.doesNotMatch(projectForm, /仅显示申请资料中已选择并经平台审核通过的标签/);
  assert.doesNotMatch(projectLogic, /请先在新遇官申请资料中选择(?:作品|客群|风格|现场体验)标签并通过审核/);
  assert.match(projectLogic, /openApplicationTagGroup[\s\S]*projectDraftKey[\s\S]*focus=\$\{encodeURIComponent\(category\)\}&returnTo=project/);
  const registerLogic = read("miniprogram/pages/creator-register/creator-register.ts");
  assert.match(registerLogic, /focusCategory[\s\S]*scrollToFocusedGroup[\s\S]*pageScrollTo/);
  assert.match(registerLogic, /returnToProject[\s\S]*wx\.navigateBack/);
  assert.match(projectForm, /体验项目封面[\s\S]*如不上传图，则默认“申请代表图”作为封面对外展示/);
  assert.match(projectForm, /请添加该体验项目可以接待顾客的日期/);
  assert.doesNotMatch(`${projectForm}\n${projectLogic}`, /limitedQuantityNote|limitedStartsAt|limitedEndsAt|限量数量 \/ 限时规则|默认推荐只展示未来有日期/);
  assert.match(read("app/api/assets/[...key]/route.ts"), /parts\[0\] === "workshop"/);
  assert.doesNotMatch(projectForm, /display-choice|前台展示项目/);
  assert.doesNotMatch(`${projectForm}\n${projectLogic}`, /前台匹配主品类|primaryCategoryChoices|primaryCategoryIndex|primaryCategoryTagId/);
  assert.doesNotMatch(projectForm, /togglePresence|当前在线|当前下线|已上线|已下线/);
  assert.doesNotMatch(projectForm, /近期无计划/);
  assert.ok(app.pages.includes("pages/creator-project-preview/creator-project-preview"));
  const projectPreview = read("miniprogram/pages/creator-project-preview/creator-project-preview.wxml");
  assert.match(projectPreview, /preview\.availableDates/);
  assert.doesNotMatch(projectPreview, /preview\.startDate|preview\.endDate/);
  assert.match(projectForm, /mode="region"/);
  assert.doesNotMatch(projectForm, /pages\/location\/location/);
  assert.ok(!app.pages.includes("pages/location/location"));
  const presentation = read("miniprogram/utils/presentation.ts");
  assert.equal([...presentation.matchAll(/action:\s*"查看详情"/g)].length, 2);
  assert.doesNotMatch(presentation, /现在可去/);
  assert.doesNotMatch(presentation, /presenceStatus|当前在线|当前下线/);
  assert.match(read("miniprogram/pages/self-play/self-play.ts"), /\/api\/mini\/workshop\/self-play[\s\S]*\/pages\/kit-detail\/kit-detail/);
  assert.match(read("miniprogram/pages/companion/companion.ts"), /\/api\/mini\/workshop\/companion[\s\S]*\/pages\/project-detail\/project-detail/);

  const projectDetail = read("miniprogram/pages/project-detail/project-detail.ts");
  const projectDetailView = read("miniprogram/pages/project-detail/project-detail.wxml");
  assert.doesNotMatch(projectDetail, /openCustomerServiceChat/);
  assert.match(projectDetail, /ensureConsumerSession[\s\S]*\/api\/mini\/workshop\/contact/);
  assert.match(projectDetail, /makePhoneCall[\s\S]*setClipboardData|setClipboardData[\s\S]*makePhoneCall/);
  assert.match(projectDetail, /contactLabel:\s*"联系新遇官"/);
  assert.match(projectDetailView, /\{\{contactLabel\}\}/);
  assert.match(projectDetailView, /联系时请说明|contactReminder/);
  assert.match(projectDetailView, /查看号码[\s\S]*复制号码[\s\S]*拨打电话/);
  assert.doesNotMatch(projectDetail, /\/api\/mini\/consultations/);
  assert.doesNotMatch(projectDetailView, /项目日期|当前在线|当前下线|QIDENG_PREVIEW_DEMO/);
  const kitDetail = `${read("miniprogram/pages/kit-detail/kit-detail.wxml")}\n${read("miniprogram/pages/kit-detail/kit-detail.ts")}`;
  assert.match(kitDetail, /联系奇灯/);
  for (const retiredFeedback of ["问题反馈", "教程看不懂", "材料缺失", "安全问题", "/api/mini/workshop/support"])
    assert.doesNotMatch(kitDetail, new RegExp(retiredFeedback));
  assert.match(read("app/api/mini/consultations/route.ts"), /在线咨询已关闭[\s\S]*status: 410/);
  assert.match(read("app/api/mini/workshop/support/route.ts"), /问题反馈已改为[\s\S]*status: 410/);

  assert.equal(existsSync(path.join(root, "miniprogram/pages/share")), false);
  assert.equal(existsSync(path.join(root, "app/api/mini/share-code/route.ts")), false);
  for (const retiredShareSignal of ['pages/share/share', 'open-type="share"', "onShareAppMessage", "onShareTimeline", "showShareMenu"])
    assert.doesNotMatch(sourceTree("miniprogram"), new RegExp(retiredShareSignal));
  assert.match(read("miniprogram/components/brand-header/brand-header.ts"), /hideShareMenu[\s\S]*shareAppMessage[\s\S]*shareTimeline/);
  assert.match(read("miniprogram/pages/image-crop/image-crop.ts"), /hideShareMenu[\s\S]*shareAppMessage[\s\S]*shareTimeline/);
  assert.doesNotMatch(read("lib/wechat-mini.ts"), /getwxacodeunlimit|createUnlimitedMiniCode/);

  const location = read("miniprogram/utils/location.ts");
  assert.match(location, /DEFAULT_CONSUMER_LOCATION/);
  assert.doesNotMatch(location, /wx\.getLocation/);
  const header = read("miniprogram/components/brand-header/brand-header.ts");
  const headerStyles = read("miniprogram/components/brand-header/brand-header.wxss");
  assert.equal(existsSync(path.join(root, "miniprogram/utils/china-area-data.json")), false);
  assert.match(header, /catch[\s\S]*brandMetricsStyle/);
  const headerView = read("miniprogram/components/brand-header/brand-header.wxml");
  assert.match(headerView, /奇灯[\s\S]*在城市里，发现一次新遇[\s\S]*mode="multiSelector"/);
  assert.doesNotMatch(headerView, /可切换/);
  assert.match(headerStyles, /\.brand-header-host[\s\S]*height:\s*calc/);
  assert.match(headerStyles, /\.brand-header[\s\S]*position:\s*fixed[\s\S]*z-index:\s*9999/);
  assert.match(headerStyles, /box-sizing:\s*border-box/);
  assert.match(headerStyles, /\.brand-header\s*\{[^}]*background:\s*var\(--paper\)/s);
  assert.match(headerStyles, /\.immersive \.brand-header\s*\{[^}]*background:\s*var\(--night\)/s);
  assert.doesNotMatch(headerStyles, /background:\s*var\(--(?:glass-dark|paper-translucent)\)/);
  assert.match(header, /Math\.min\(120,[\s\S]*capsuleBottom \+ 8/);
  assert.doesNotMatch(header, /pages\/location\/location/);

  const fontModule = read("miniprogram/utils/editorial-font.ts");
  assert.match(read("miniprogram/app.ts"), /wx\.loadFontFace[\s\S]*Qideng Editorial[\s\S]*QIDENG_EDITORIAL_FONT_SOURCE/);
  assert.match(fontModule, /data:font\/woff;base64,/);
  assert.ok(statSync(path.join(root, "public/fonts/qideng-editorial-subset.woff")).size > 1024);
  assert.match(read("app/globals.css"), /@font-face[\s\S]*qideng-editorial-subset\.woff/);

  const mine = read("miniprogram/pages/mine/mine.wxml");
  assert.match(mine, /申请奇灯新遇官/);
  assert.match(mine, /管理我的新遇官/);
  assert.match(read("miniprogram/pages/mine/mine.wxss"), /creator-identity-button[\s\S]*var\(--accent\)/);
  assert.doesNotMatch(mine, /查看申请/);
  const creatorMine = read("miniprogram/pages/creator-profile/creator-profile.wxml");
  assert.match(creatorMine, /发布体验[\s\S]*日期计划[\s\S]*近期无其他活动安排[\s\S]*确认\/添加[\s\S]*保存日期计划/);
  assert.match(read("lib/repository.ts"), /UPDATE creator_applications SET busy_periods = \?, no_bookings = \?/);

  const explore = read("miniprogram/pages/explore/explore.wxml");
  assert.doesNotMatch(explore, /mode-switch|<text>\{\{cards\.length/);
  assert.match(explore, /poster-card/);
  assert.doesNotMatch(explore, /全部项目|experience-card/);
  assert.match(read("miniprogram/utils/presentation.ts"), /uniqueTags/);

  const home = read("miniprogram/pages/index/index.wxml");
  const homeLogic = read("miniprogram/pages/index/index.ts");
  const contentDiscovery = read("miniprogram/utils/content-discovery.ts");
  const homeSource = `${home}\n${homeLogic}\n${contentDiscovery}`;
  for (const label of ["本周精选", "今日发现", "更多探索", "或许喜欢的", "发现新遇", "今日上新", "首发尝鲜", "限时限量", "好评精选"])
    assert.match(homeSource, new RegExp(label));
  assert.match(home, /brand-header[\s\S]*show-city[\s\S]*poster-card[\s\S]*consumer-tabs/);
  assert.match(home, /这里还没有奇灯[\s\S]*请帮我们找到这座城市的奇灯新遇官[\s\S]*联系奇灯/);
  assert.doesNotMatch(home, /搜索|discovery-stage|card-deck|马上探照新遇/);
  assert.match(homeLogic, /\/api\/mini\/workshop\/home/);
  assert.match(homeLogic, /filteredPosters[\s\S]*discoverySections/);
  assert.doesNotMatch(homeLogic, /\/api\/mini\/workshop\/discovery|recordDiscovery/);
  assert.match(contentDiscovery, /availableInterests[\s\S]*card\.kind === kind/);
  assert.match(contentDiscovery, /card\.schedules\.some\(\(item: any\) => item\.availableDate === date\)/);
  assert.match(read("lib/mini-program.ts"), /selfPlayPreview:\s*publishedKits\.slice\(0, 50\)[\s\S]*companionPreview:\s*publishedProjects/);
  assert.ok(existsSync(path.join(root, "app/api/mini/workshop/discovery/route.ts")));

  for (const pageName of ["self-play", "companion", "explore"]) {
    const page = read(`miniprogram/pages/${pageName}/${pageName}.wxml`);
    assert.match(page, /poster-card/);
    assert.doesNotMatch(page, /experience-card|搜索/);
  }
  const companionPage = read("miniprogram/pages/companion/companion.wxml");
  const companionLogic = read("miniprogram/pages/companion/companion.ts");
  assert.match(companionPage, /奇灯新遇官亲历陪伴体验[\s\S]*更多探索[\s\S]*或许喜欢的[\s\S]*发现新遇/);
  assert.match(companionPage, /date \|\| '默认未来有日期'/);
  assert.match(companionLogic, /this\.data\.date \? `&date=/);

  const creatorTabsLogic = read("miniprogram/components/creator-tabs/creator-tabs.ts");
  assert.doesNotMatch(creatorTabsLogic, /label: "回复"/);
  assert.match(read("miniprogram/pages/creator-register/creator-register.wxml"), /将注册手机号向消费者展示/);
  assert.match(read("miniprogram/pages/creator-profile/creator-profile.wxml"), /消费者联系[\s\S]*保存联系设置/);
  assert.match(read("app/api/mini/auth/creator-register/route.ts"), /phonePublicAuthorized !== true/);
  assert.match(read("lib/database.ts"), /phone_public_authorized INTEGER NOT NULL DEFAULT 0[\s\S]*phone_contact_view_events/);
  const legalSource = read("miniprogram/pages/legal/legal.ts");
  assert.match(legalSource, /creator-application-v2/);
  assert.match(legalSource, /注册手机号只有在你另行明确同意后/);
  assert.match(legalSource, /奇灯不接入、不转发也不保存/);
  assert.match(legalSource, /行济诚生（北京）文化传播有限公司[\s\S]*kevin091120@126\.com/);
  const miniProgramService = read("lib/mini-program.ts");
  const publicProjectQuery = miniProgramService.slice(
    miniProgramService.indexOf("export function listWorkshopProjects"),
    miniProgramService.indexOf("export function saveWorkshopProject"),
  );
  assert.doesNotMatch(publicProjectQuery, /p\.cover_key|creator_contact_channels/);
  assert.match(miniProgramService, /体验发布前必须上传体验项目封面或申请代表图[\s\S]*体验发布前必须由新遇官授权公开注册手机号/);
  assert.match(miniProgramService, /phoneContact:[\s\S]*maskedPhone/);
  assert.doesNotMatch(miniProgramService.match(/export function getWorkshopProjectDetail[\s\S]*?export function recordWorkshopContactClick/)?.[0] || "", /channelType === "wecom"/);

  for (const retiredPage of ["app/login/page.tsx", "app/join/page.tsx", "app/studio/page.tsx"])
    assert.equal(existsSync(path.join(root, retiredPage)), false, `${retiredPage} must remain retired`);
  assert.match(read("app/page.tsx"), /redirect\("\/admin\/login"\)/);

  const adminShell = read("app/components/AdminClient.tsx");
  assert.match(adminShell, /奇灯/);
  assert.doesNotMatch(adminShell, /奇灯创意人机会档案平台/);
  const workshopAdmin = read("app/components/MiniProgramAdminView.tsx");
  assert.doesNotMatch(workshopAdmin, /企业微信客服|微信客服链接|contactQr/);
  for (const retiredChannel of ['value="wechat"', 'value="mini_consult"', 'value="phone"', 'value="other"'])
    assert.doesNotMatch(workshopAdmin, new RegExp(retiredChannel));
  assert.match(read("app/api/admin/workshop/contact/route.ts"), /status: 410/);
  assert.match(workshopAdmin, /自在指南与店内规范/);
  assert.match(workshopAdmin, /超级管理员和子管理员均可逐条新增/);
  assert.doesNotMatch(`${miniSource}\n${workshopAdmin}`, /当前在线|当前下线|前台在线状态|同城约见|QIDENG_PREVIEW_DEMO/);
});
