import { existsSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const { chromium, webkit } = require("playwright");

const baseUrl = process.env.BASE_URL || "http://127.0.0.1:3020";
const smokeInviteCode = (process.env.SMOKE_INVITE_CODE || "QIDENG26").trim().toUpperCase();
if (!/^[A-Z0-9]{4,8}$/.test(smokeInviteCode))
  throw new Error("SMOKE_INVITE_CODE must be 4 to 8 letters or digits");
const root = path.resolve(import.meta.dirname, "..");
const screenshots = path.join(root, "tests", "screenshots");
const upload = path.join(root, "public", "posters", "category-1.jpg");
mkdirSync(screenshots, { recursive: true });

const systemChrome = process.env.BROWSER_EXECUTABLE || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const browserType = process.env.BROWSER_ENGINE === "webkit" ? webkit : chromium;
const browser = await browserType.launch({
  headless: true,
  ...(existsSync(systemChrome) ? { executablePath: systemChrome } : {}),
});
const results = [];

async function assertLayout(page, name) {
  const layout = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    scroll: document.documentElement.scrollWidth,
    bodyScroll: document.body.scrollWidth,
  }));
  if (layout.scroll > layout.viewport + 1 || layout.bodyScroll > layout.viewport + 1) {
    throw new Error(`${name} has horizontal overflow: ${JSON.stringify(layout)}`);
  }
  results.push({ name, layout });
}

try {
  const mobile = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2,
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 MicroMessenger/8.0.50",
  });
  const page = await mobile.newPage();
  const consoleErrors = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  if (await page.locator(".poster-stack").count()) throw new Error("homepage showcase should be hidden by default");
  await assertLayout(page, "mobile-home");
  await page.screenshot({ path: path.join(screenshots, "mobile-home.png"), fullPage: true });
  await page.getByRole("button", { name: "客服" }).click();
  await page.getByRole("heading", { name: "联系奇灯" }).waitFor();
  await page.getByRole("button", { name: "关闭" }).click();
  await page.getByRole("link", { name: "加入奇灯" }).click();
  await page.waitForURL(/\/join/);
  await page.getByRole("heading", { name: "先验证邀请码" }).waitFor();
  await page.getByLabel("邀请码", { exact: true }).fill(smokeInviteCode);
  await page.getByRole("button", { name: "验证邀请码" }).click();
  await page.getByRole("heading", { name: "开启注册" }).waitFor();

  const phone = `187${String(Date.now()).slice(-8)}`;
  await page.getByLabel("手机号", { exact: true }).fill(phone);
  await page.getByLabel("再次确认手机号").fill(phone);
  await page.getByLabel("微信ID", { exact: true }).fill("browser-test-wechat");
  await page.getByLabel("常驻省份").selectOption({ label: "上海市" });
  await page.getByLabel("常驻城市").selectOption({ label: "上海市" });
  await page.locator(".agreement input").check();
  await page.getByRole("button", { name: /提交注册/ }).click();
  await page.waitForURL(/\/studio\?section=dossier/);
  await page.locator('.mobile-nav button[data-section="writer"]').click();
  await page.locator(".writer-results-page").waitFor();
  await page.getByRole("heading", { name: "小红书好文章的4个标准" }).waitFor();
  await page.getByRole("button", { name: "我知道了" }).click();
  await page.getByRole("button", { name: "为什么要用奇灯" }).waitFor();
  if ((await page.locator(".writer-result-pane .copy-result").count()) !== 1) throw new Error("writer must show one selected article slot");
  if (await page.locator(".mobile-writer-switch, .result-mode-switch").count()) throw new Error("obsolete edit or preview switches are visible");
  const writerNav = page.locator('.mobile-nav button[data-section="writer"]');
  if ((await writerNav.innerText()).trim() !== "生成") throw new Error("writer navigation label was not updated");
  if ((await page.locator(".mobile-nav > button").count()) !== 4) throw new Error("studio must expose exactly four top-level sections");
  if ((await page.locator('.mobile-nav button[data-section="update"]').innerText()).trim() !== "更新") throw new Error("update is not a top-level section");
  if (await page.locator('.mobile-nav button[data-section="inbox"]').count()) throw new Error("inbox is still a top-level section");
  const writerIconColor = await writerNav.locator(".nav-icon").evaluate((element) => getComputedStyle(element).color);
  if (writerIconColor !== "rgb(229, 185, 63)") throw new Error(`writer navigation icon is not yellow: ${writerIconColor}`);
  if (await page.getByText(/同频伙伴在线/).count()) throw new Error("obsolete online presence is visible");
  if (await page.locator('.mobile-nav button[data-section="schedule"], .mobile-nav button[data-section="lights"]').count()) throw new Error("obsolete standalone schedule or lights navigation is visible");
  await page.getByText("每种模式只保留最新一篇文章，请及时复制使用。").waitFor({ state: "attached" });

  await page.locator(".copy-result.free .writer-new-article").click();
  await page.waitForURL(/section=update/);
  if (!(await page.locator('.mobile-nav button[data-section="update"]').getAttribute("class"))?.includes("active")) throw new Error("update navigation is not active");
  await page.locator(".writer-task-rail").waitFor();
  await page.getByRole("button", { name: /基本信息/ }).click();
  await page.getByLabel("品牌/工作室名称", { exact: true }).fill("浏览器测试品牌");
  await page.getByRole("button", { name: /保存基本信息/ }).click();
  await page.locator('.writer-setup-dialog button[aria-label="关闭"]').click();
  await page.getByRole("button", { name: /一句话介绍/ }).click();
  await page.getByLabel(/一句话介绍/).fill("原创手作与线下体验");
  await page.getByRole("button", { name: /保存一句话介绍/ }).click();
  await page.locator('.writer-setup-dialog button[aria-label="关闭"]').click();
  await page.getByRole("button", { name: /上传图片/ }).click();
  const workInput = page.locator('.writer-image-setup input[type="file"]');
  if (await workInput.getAttribute("capture")) throw new Error("work image upload still requests camera capture");
  if ((await workInput.getAttribute("accept")) !== ".jpg,.jpeg,.png,.webp") throw new Error("work image upload extensions are incorrect");
  await workInput.setInputFiles(upload);
  await page.getByRole("heading", { name: "调整图片范围" }).waitFor();
  await page.getByRole("button", { name: "确认保存" }).click();
  await page.getByText("代表图片已保存").waitFor();
  await page.getByRole("button", { name: /继续筛选标签/ }).click();

  await page.getByRole("heading", { name: "告诉奇灯你是谁", exact: true }).waitFor();
  await page.getByRole("heading", { name: "新增你的专属标签", exact: true }).waitFor();
  await page.locator(".writer-tags-setup details").first().locator(".tag-cloud button").first().click();
  await page.getByRole("button", { name: /保存并继续/ }).click();

  await page.getByRole("heading", { name: "活动计划", exact: true }).waitFor();
  await page.getByRole("button", { name: /近期无计划/ }).click();
  await page.locator(".schedule-actions .button.primary").click();

  await page.getByLabel("市集合作").check();
  await page.getByRole("button", { name: /保存合作意向/ }).click();
  await page.locator('.writer-setup-dialog button[aria-label="关闭"]').click();

  await page.getByRole("button", { name: /介绍你和你的作品/ }).click();
  await page.getByRole("heading", { name: "介绍你和你的作品", exact: true }).waitFor();
  await page.getByLabel(/介绍你和你的作品/).fill("我是一个专注原创手作与自然风格作品的创意人，希望在线下活动中分享作品细节与真实体验。");
  await page.getByRole("button", { name: /更新完毕，开始生成/ }).click();
  await page.getByRole("heading", { name: "介绍你和你的作品", exact: true }).waitFor({ state: "hidden" });
  await page.getByRole("button", { name: "保存更新", exact: true }).click();
  await page.getByRole("heading", { name: "再写一篇", exact: true }).waitFor();
  await page.getByRole("button", { name: "好的", exact: true }).click();
  await page.locator(".writer-results-page").waitFor();
  await assertLayout(page, "mobile-writer-ready");
  await page.locator(".copy-result.free footer button").click();
  await page.getByRole("heading", { name: "确认这次要写入的活动计划" }).waitFor();
  await page.getByText("近期无计划，生成文章时不会加入日期。").waitFor();
  await page.getByRole("button", { name: "确认并生成" }).click();
  await page.getByRole("heading", { name: "文案已生成" }).waitFor();
  await page.getByRole("button", { name: "查看文案" }).click();
  await page.getByRole("button", { name: "复制全部" }).click();
  await page.getByText("标题和正文已复制").waitFor();

  const profileBadge = page.locator('.mobile-nav button[data-section="profile"] i');
  await profileBadge.waitFor();
  await page.locator('.mobile-nav button[data-section="profile"]').click();
  await page.getByRole("heading", { name: "我的资料" }).waitFor();
  await page.getByRole("heading", { name: "通知", exact: true }).waitFor();
  if (await page.getByLabel(/用户名称/).count()) throw new Error("obsolete user name field is visible");
  if (await page.getByLabel(/微信号/).count()) throw new Error("obsolete WeChat field is visible");
  if (await page.getByText(/品牌标识/).count()) throw new Error("obsolete brand logo field is visible");
  await page.getByLabel("品牌/工作室名称", { exact: true }).fill("浏览器测试品牌");
  await page.getByRole("button", { name: "保存名称", exact: true }).click();
  const unreadBefore = Number(await profileBadge.innerText());
  await page.getByRole("button", { name: /查看通知/ }).click();
  await page.waitForURL(/section=profile&view=inbox/);
  await page.locator(".message-list button.unread").first().click();
  await page.locator(".message-dialog").waitFor();
  const unreadAfter = await profileBadge.count() ? Number(await profileBadge.innerText()) : 0;
  if (!(unreadAfter < unreadBefore)) throw new Error("profile unread badge did not decrease after opening a notification");
  await page.getByRole("button", { name: "关闭" }).click();
  await page.goto(`${baseUrl}/studio?section=inbox`, { waitUntil: "networkidle" });
  await page.waitForURL(/section=profile&view=inbox/);
  await page.getByRole("heading", { name: "平台通知" }).waitFor();
  await page.goto(`${baseUrl}/studio?section=profile&view=update`, { waitUntil: "networkidle" });
  await page.waitForURL(/section=update/);
  await page.locator(".writer-task-rail").waitFor();
  await page.locator('.mobile-nav button[data-section="writer"]').click();
  await page.locator(".writer-results-page").waitFor();
  await assertLayout(page, "mobile-writer");
  await page.screenshot({ path: path.join(screenshots, "mobile-writer.png"), fullPage: true });
  if (consoleErrors.length) throw new Error(`mobile console errors: ${consoleErrors.join(" | ")}`);
  await mobile.close();

  const desktop = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const desktopPage = await desktop.newPage();
  await desktopPage.goto(baseUrl, { waitUntil: "networkidle" });
  if (await desktopPage.locator(".poster-stack").count()) throw new Error("desktop homepage showcase should be hidden by default");
  await assertLayout(desktopPage, "desktop-home");
  await desktopPage.screenshot({ path: path.join(screenshots, "desktop-home.png"), fullPage: true });
  await desktopPage.goto(`${baseUrl}/admin/login`, { waitUntil: "networkidle" });
  await desktopPage.getByLabel("运营账号").fill("admin");
  await desktopPage.getByLabel("密码").fill("QidengPreview729!");
  await desktopPage.getByRole("button", { name: /进入运营台/ }).click();
  await desktopPage.waitForURL(/\/admin$/);
  await desktopPage.getByRole("heading", { name: "运营概览" }).waitFor();
  await desktopPage.getByRole("button", { name: "红薯算法" }).click();
  await desktopPage.getByRole("heading", { name: "红薯算法" }).waitFor();
  await assertLayout(desktopPage, "desktop-admin");
  await desktopPage.screenshot({ path: path.join(screenshots, "desktop-admin.png"), fullPage: true });
  await desktop.close();

  const tablet = await browser.newContext({ viewport: { width: 820, height: 1180 }, hasTouch: true });
  const tabletPage = await tablet.newPage();
  await tabletPage.goto(baseUrl, { waitUntil: "networkidle" });
  await assertLayout(tabletPage, "tablet-home");
  await tabletPage.screenshot({ path: path.join(screenshots, "tablet-home.png"), fullPage: true });
  await tablet.close();

  process.stdout.write(`${JSON.stringify({ ok: true, results, screenshots }, null, 2)}\n`);
} finally {
  await browser.close();
}
