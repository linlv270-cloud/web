import assert from "node:assert/strict";
import dns from "node:dns";
import { after, before, test } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import sharp from "sharp";
import JSZip from "jszip";
import { tagCategoryNames } from "../lib/catalog.ts";
import { limitTagInput, rankTagMatches } from "../lib/tag-search.ts";

const root = path.resolve(import.meta.dirname, "..");
const dataDir = mkdtempSync(path.join(tmpdir(), "qideng-invitations-test-"));
const configuredPort = process.env.SMOKE_PORT ? Number.parseInt(process.env.SMOKE_PORT, 10) : 0;
if (process.env.SMOKE_PORT && (!Number.isInteger(configuredPort) || configuredPort < 1024 || configuredPort > 65534))
  throw new Error("SMOKE_PORT must be an integer between 1024 and 65534");
const port = configuredPort || 30000 + ((process.pid * 97 + Date.now()) % 20000);
const baseUrl = `http://127.0.0.1:${port}`;
dns.setDefaultResultOrder("ipv4first");

const futureActivityDate = (() => {
  const date = new Date();
  date.setDate(date.getDate() + 7);
  return date.toISOString().slice(0, 10);
})();
const futureActivityDateCn = (() => {
  const [year, month, day] = futureActivityDate.split("-");
  return `${year}年${Number(month)}月${Number(day)}日`;
})();

let server;
let output = "";
let serverUnavailable = "";
let adminCookie = "";
let creatorCookie = "";
let creatorId = 0;
let category = "";
let categoryTagIds = [];
let secondCategory = "";
let requiredCategory = "";
let requiredCategoryTagId = 0;

function gatedTest(name, fn) {
  test(name, async (context) => {
    if (serverUnavailable) return context.skip(serverUnavailable);
    return fn(context);
  });
}

async function waitForGeneration(id, status, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const response = await fetch(`${baseUrl}/api/copy`, { headers: { cookie: creatorCookie } });
    const payload = await response.json();
    const generation = payload.generations?.find((item) => item.id === id);
    if (generation?.status === status) return { generation, payload };
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Generation ${id} did not reach ${status}`);
}

before(async () => {
  server = spawn(process.execPath, [".next/standalone/server.js"], {
    cwd: root,
    env: {
      ...process.env,
      NODE_ENV: "production",
      HOSTNAME: "127.0.0.1",
      PORT: String(port),
      DATA_DIR: dataDir,
      QIDENG_BOOTSTRAP_INVITE_CODE: "QIDENG26",
      ADMIN_USERNAME: "smoke-admin",
      ADMIN_PASSWORD: "SmokeTestPassword-730!",
      DOUBAO_API_KEY: "",
      DOUBAO_MODEL: "",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  server.stdout.on("data", (chunk) => { output += chunk; });
  server.stderr.on("data", (chunk) => { output += chunk; });
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}/api/catalog`);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  if (/listen EPERM|operation not permitted/.test(output)) {
    serverUnavailable = "当前运行环境禁止本地 HTTP 监听，已跳过需要子进程服务器的 smoke；请在可监听端口的环境运行同一命令。";
    return;
  }
  throw new Error(`Test server did not start:\n${output}`);
});

after(() => {
  server?.kill("SIGTERM");
  rmSync(dataDir, { recursive: true, force: true });
});

gatedTest("web root opens the operations console and retires creator password pages", async () => {
  const response = await fetch(`${baseUrl}/`);
  const html = await response.text();
  assert.equal(response.status, 200);
  assert.match(response.url, /\/admin\/login$/);
  assert.match(html, /奇灯运营台/);
  assert.doesNotMatch(html, /奇灯 AI 智能体/);
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(response.headers.get("x-frame-options"), "DENY");
  for (const route of ["/login", "/join", "/studio"])
    assert.equal((await fetch(`${baseUrl}${route}`)).status, 404);
});

gatedTest("tag discovery limits input and ranks fuzzy aliases", () => {
  assert.equal(limitTagInput("一二三四五六七八"), "一二三四五六七");
  const matches = rankTagMatches([
    { id: 1, label: "陶瓷", category: "我的作品", status: "active" },
    { id: 2, label: "摄影作品", category: "我的作品", status: "active" },
    { id: 3, label: "陶艺课程", category: "现场体验", status: "pending" },
  ], "陶艺");
  assert.equal(matches[0]?.label, "陶瓷");
  assert.ok(matches.every((tag) => tag.status === "active"));
});

gatedTest("catalog exposes the final six creator tag categories and hides the homepage showcase", async () => {
  const response = await fetch(`${baseUrl}/api/catalog`);
  const catalog = await response.json();
  assert.equal(response.status, 200);
  assert.equal("themes" in catalog, false);
  const categories = [...new Set(catalog.tags.map((item) => item.category))];
  assert.deepEqual(categories, tagCategoryNames);
  assert.equal(categories.length, 6);
  assert.ok(!categories.includes("我的荣誉"));
  assert.ok(!categories.includes("我的加分项"));
  category = categories.find((item) => catalog.tags.filter((tag) => tag.category === item).length >= 9);
  categoryTagIds = catalog.tags.filter((tag) => tag.category === category).slice(0, 9).map((tag) => tag.id);
  secondCategory = categories.find((item) => item !== category);
  requiredCategory = categories.find((item) => item !== category && item !== secondCategory);
  requiredCategoryTagId = catalog.tags.find((tag) => tag.category === requiredCategory).id;
  assert.equal(catalog.settings.navigation.discover, undefined);
  assert.equal(catalog.settings.navigation.writer, "生成");
  assert.equal(catalog.settings.navigation.update, "更新");
  assert.equal(catalog.settings.navigation.profile, "我的");
  assert.equal(catalog.settings.navigation.inbox, undefined);
  assert.equal(catalog.settings.homeShowcase.enabled, false);
  assert.equal(catalog.settings.homeShowcase.cards.length, 3);
  assert.equal(catalog.settings.uiText["writer.stepImage"], "上传图片");
  assert.equal(catalog.settings.uiText["writer.stepTags"], "告诉奇灯你是谁");
  assert.equal(catalog.settings.uiText["writer.newArticle"], "点击生成新文章");
  assert.equal(catalog.settings.uiText["writer.editComplete"], "更新完毕，开始生成");
  assert.equal(catalog.settings.uiText["join.registerTitle"], "开启注册");
  assert.equal(catalog.settings.uiText["join.registerButton"], "提交注册");
  assert.equal(catalog.settings.homeCriteria.every((item) => item.icon === "Lightbulb"), true);
  assert.deepEqual(catalog.settings.homeCriteria.map((item) => item.label), ["你在做什么", "近期活动日期", "期待哪些合作"]);
  assert.equal(catalog.settings.fieldRules["profile.userName"].enabled, false);
  assert.equal(catalog.settings.fieldRules["profile.wechat"].enabled, true);
  assert.equal(catalog.settings.fieldRules["profile.wechat"].required, true);
  assert.equal(catalog.settings.fieldRules["profile.logo"].enabled, false);
  assert.equal(catalog.settings.fieldRules["lights.boothDescription"].required, false);
  assert.equal(catalog.settings.writerUi.freeTitle, "基础生成模式");
  assert.equal(catalog.settings.writerUi.upgradeTitle, "魔法生成模式");
  assert.equal(catalog.settings.writerUi.generateButton, "生成");
  assert.equal(catalog.settings.writerIntro.enabled, true);
  assert.equal(catalog.settings.uiText["profile.writeAgainTitle"], "再写一篇");
  assert.equal(catalog.settings.uiText["profile.notificationsTitle"], "通知");
  assert.equal(catalog.settings.uiText["schedule.planLegend"], "活动计划");
  assert.equal(catalog.settings.uiText["schedule.noPlanDescription"], "近期没有准备公开的活动计划。");
  assert.equal(catalog.settings.fieldRules["profile.intro"].required, false);
  assert.ok(catalog.settings.fieldRules["schedule.availability"].required);
});

gatedTest("writer mode migration updates only exact legacy system labels", async () => {
  const db = new DatabaseSync(path.join(dataDir, "qideng-curated-invitations.sqlite"));
  const readSettings = () => JSON.parse(
    db.prepare("SELECT value FROM platform_settings WHERE key = 'platform'").get().value,
  );
  const writeSettings = (settings) => {
    db.prepare("UPDATE platform_settings SET value = ? WHERE key = 'platform'").run(JSON.stringify(settings));
    db.prepare("DELETE FROM platform_settings WHERE key = 'writer_modes_v2'").run();
    db.prepare("DELETE FROM platform_settings WHERE key = 'writer_modes_v3'").run();
  };

  const legacy = readSettings();
  legacy.writerUi = { ...legacy.writerUi, freeTitle: "普通生成", upgradeTitle: "加强生成" };
  writeSettings(legacy);
  const migrated = await fetch(`${baseUrl}/api/public/settings`).then((response) => response.json());
  assert.equal(migrated.settings.writerUi.freeTitle, "基础生成模式");
  assert.equal(migrated.settings.writerUi.upgradeTitle, "魔法生成模式");

  const shortened = readSettings();
  shortened.writerUi = { ...shortened.writerUi, freeTitle: "基础生成", upgradeTitle: "魔法生成" };
  writeSettings(shortened);
  const expanded = await fetch(`${baseUrl}/api/public/settings`).then((response) => response.json());
  assert.equal(expanded.settings.writerUi.freeTitle, "基础生成模式");
  assert.equal(expanded.settings.writerUi.upgradeTitle, "魔法生成模式");

  const customized = readSettings();
  customized.writerUi = { ...customized.writerUi, freeTitle: "我的基础模式", upgradeTitle: "我的魔法模式" };
  writeSettings(customized);
  const preserved = await fetch(`${baseUrl}/api/public/settings`).then((response) => response.json());
  assert.equal(preserved.settings.writerUi.freeTitle, "我的基础模式");
  assert.equal(preserved.settings.writerUi.upgradeTitle, "我的魔法模式");

  const restored = readSettings();
  restored.writerUi = { ...restored.writerUi, freeTitle: "普通生成", upgradeTitle: "加强生成" };
  writeSettings(restored);
  await fetch(`${baseUrl}/api/public/settings`);
  db.close();
});

gatedTest("invite validation rejects arbitrary values and accepts the platform code", async () => {
  const invalid = await fetch(`${baseUrl}/api/auth/invite`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ code: "ANYTHING" }),
  });
  assert.equal(invalid.status, 400);
  const valid = await fetch(`${baseUrl}/api/auth/invite`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ code: "QIDENG26" }),
  });
  assert.equal(valid.status, 200);
});

gatedTest("registration confirms phone and password and starts at article generation", async () => {
  const response = await fetch(`${baseUrl}/api/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      inviteCode: "QIDENG26",
      phone: "18800000730",
      confirmPhone: "18800000730",
      province: "上海市",
      city: "上海市",
      wechat: "test-register-wechat",
      password: "QidengTest730!",
      confirmPassword: "QidengTest730!",
    }),
  });
  const body = await response.json();
  assert.equal(response.status, 201);
  assert.equal(body.redirectTo, "/studio?section=writer");
  creatorId = body.creatorId;
  creatorCookie = (response.headers.get("set-cookie") || "").split(";")[0];
  assert.match(creatorCookie, /qideng_invite_creator=/);
  const me = await fetch(`${baseUrl}/api/auth/me`, { headers: { cookie: creatorCookie } }).then((item) => item.json());
  assert.equal(me.creator.province, "上海市");
  assert.equal(me.creator.city, "上海市");
  assert.equal(me.creator.copyQuota.freeLimit, 3);
  assert.equal(me.creator.copyQuota.upgradeLimit, 3);
  assert.equal(me.creator.introPopupSeenVersion, "");
});

gatedTest("writer guide is acknowledged per account and content version", async () => {
  const seen = await fetch(`${baseUrl}/api/writer-guide`, { method: "POST", headers: { cookie: creatorCookie } });
  const payload = await seen.json();
  assert.equal(seen.status, 200);
  assert.equal(payload.creator.introPopupSeenVersion, "1");
});

gatedTest("duplicate phone and mismatched confirmation are rejected", async () => {
  const duplicate = await fetch(`${baseUrl}/api/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ inviteCode: "QIDENG26", phone: "18800000730", confirmPhone: "18800000730", password: "QidengTest730!", confirmPassword: "QidengTest730!" }),
  });
  assert.equal(duplicate.status, 400);
  assert.match((await duplicate.json()).error, /已经注册/);
  const mismatch = await fetch(`${baseUrl}/api/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ inviteCode: "QIDENG26", phone: "18800000731", confirmPhone: "18800000732", password: "QidengTest730!", confirmPassword: "QidengTest730!" }),
  });
  assert.equal(mismatch.status, 400);
});

gatedTest("logged-in creator changes password with the current password", async () => {
  const wrong = await fetch(`${baseUrl}/api/account/password`, {
    method: "PATCH",
    headers: { cookie: creatorCookie, "content-type": "application/json" },
    body: JSON.stringify({ currentPassword: "wrong-password", nextPassword: "QidengNext730!", confirmPassword: "QidengNext730!" }),
  });
  assert.equal(wrong.status, 400);
  const changed = await fetch(`${baseUrl}/api/account/password`, {
    method: "PATCH",
    headers: { cookie: creatorCookie, "content-type": "application/json" },
    body: JSON.stringify({ currentPassword: "QidengTest730!", nextPassword: "QidengNext730!", confirmPassword: "QidengNext730!" }),
  });
  assert.equal(changed.status, 200, await changed.text());
  const login = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ phone: "18800000730", password: "QidengNext730!" }),
  });
  assert.equal(login.status, 200);
});

gatedTest("article generation requires the ordered workbench data", async () => {
  const earlyCopy = await fetch(`${baseUrl}/api/copy`, {
    method: "POST",
    headers: { cookie: creatorCookie, "content-type": "application/json" },
    body: JSON.stringify({ mode: "free" }),
  });
  assert.equal(earlyCopy.status, 400);
  assert.match((await earlyCopy.json()).error, /上传一张代表图片/);

  const earlyTag = await fetch(`${baseUrl}/api/tags`, {
    method: "POST",
    headers: { cookie: creatorCookie, "content-type": "application/json" },
    body: JSON.stringify({ tagId: categoryTagIds[0] }),
  });
  assert.equal(earlyTag.status, 200);

  const profileInput = {
    userName: "测试创意人",
    brandName: "测试品牌",
    wechat: "test-wechat",
    intro: "",
    province: "上海市",
    city: "上海市",
    socialAccount: "test-redbook",
    serviceIntents: ["writer", "opportunity"],
    opportunityTypes: ["市集合作"],
    opportunityOptIn: true,
  };
  await fetch(`${baseUrl}/api/profile`, {
    method: "PATCH",
    headers: { cookie: creatorCookie, "content-type": "application/json" },
    body: JSON.stringify(profileInput),
  });

  const tinyPng = await sharp({
    create: { width: 24, height: 24, channels: 3, background: "#e5b93f" },
  }).png().toBuffer();
  for (const kind of ["logo", "work"]) {
    const form = new FormData();
    form.set("kind", kind);
    form.set("file", new File([tinyPng], `${kind}.png`, { type: "image/png" }));
    const upload = await fetch(`${baseUrl}/api/uploads`, { method: "POST", headers: { cookie: creatorCookie }, body: form });
    assert.equal(upload.status, 200, await upload.text());
  }

  const oversized = new FormData();
  oversized.set("kind", "logo");
  oversized.set("file", new File([new Uint8Array(20 * 1024 * 1024 + 1)], "oversized.png", { type: "image/png" }));
  const rejectedOversized = await fetch(`${baseUrl}/api/uploads`, { method: "POST", headers: { cookie: creatorCookie }, body: oversized });
  assert.equal(rejectedOversized.status, 400);
  assert.match((await rejectedOversized.json()).error, /不能超过 20MB/);

  const extraWork = new FormData();
  extraWork.set("kind", "work");
  extraWork.set("file", new File([tinyPng], "extra-work.png", { type: "image/png" }));
  const replacedWork = await fetch(`${baseUrl}/api/uploads`, { method: "POST", headers: { cookie: creatorCookie }, body: extraWork });
  assert.equal(replacedWork.status, 200);
  assert.equal((await replacedWork.json()).creator.workUrls.length, 1);

  const submitted = await fetch(`${baseUrl}/api/profile`, {
    method: "PATCH",
    headers: { cookie: creatorCookie, "content-type": "application/json" },
    body: JSON.stringify({ ...profileInput, submit: true }),
  });
  const creator = (await submitted.json()).creator;
  assert.equal(submitted.status, 200);
  assert.equal(creator.onboarding.profileSubmitted, true);
  assert.equal(creator.onboarding.nextStep, "schedule");
  assert.equal(creator.workUrls.length, 1);
  assert.equal("availableCities" in creator, false);

  const protectedImage = await fetch(`${baseUrl}${creator.workUrls[0]}`, { headers: { cookie: creatorCookie } });
  assert.equal(protectedImage.status, 200);
  assert.match(protectedImage.headers.get("content-type") || "", /^image\//);
  assert.ok((await protectedImage.arrayBuffer()).byteLength > 0);
});

gatedTest("calendar changes require an explicit activity-plan submission", async () => {
  const earlyTag = await fetch(`${baseUrl}/api/tags`, {
    method: "POST",
    headers: { cookie: creatorCookie, "content-type": "application/json" },
    body: JSON.stringify({ tagId: categoryTagIds[0] }),
  });
  assert.equal(earlyTag.status, 200);

  const busy = await fetch(`${baseUrl}/api/availability`, {
    method: "POST",
    headers: { cookie: creatorCookie, "content-type": "application/json" },
    body: JSON.stringify({ startDate: futureActivityDate, endDate: futureActivityDate }),
  });
  const busyCreator = (await busy.json()).creator;
  assert.equal(busy.status, 200);
  assert.equal(busyCreator.onboarding.scheduleSubmitted, false);

  const confirmed = await fetch(`${baseUrl}/api/availability`, {
    method: "POST",
    headers: { cookie: creatorCookie, "content-type": "application/json" },
    body: JSON.stringify({ action: "confirm" }),
  });
  const confirmedCreator = (await confirmed.json()).creator;
  assert.equal(confirmed.status, 200);
  assert.equal(confirmedCreator.onboarding.scheduleSubmitted, true);
  assert.equal(confirmedCreator.onboarding.nextStep, "lights");
});

gatedTest("each tag category is capped at eight and Lights requires submission", async () => {
  const tooLongDescription = await fetch(`${baseUrl}/api/tags`, {
    method: "POST",
    headers: { cookie: creatorCookie, "content-type": "application/json" },
    body: JSON.stringify({ action: "describe", description: "一二三四五六七八九十一二三四五六七八九十一二三四五六七八九十一" }),
  });
  assert.equal(tooLongDescription.status, 400);
  assert.match((await tooLongDescription.json()).error, /最多30个字/);

  const described = await fetch(`${baseUrl}/api/tags`, {
    method: "POST",
    headers: { cookie: creatorCookie, "content-type": "application/json" },
    body: JSON.stringify({ action: "describe", description: "原创陶艺首饰展位" }),
  });
  const describedCreator = (await described.json()).creator;
  assert.equal(described.status, 200);
  assert.equal(describedCreator.boothDescription, "原创陶艺首饰展位");
  assert.ok(describedCreator.boothDescriptionConfirmedAt);
  assert.ok(describedCreator.tags.some((tag) => tag.label === "陶瓷" && tag.source === "auto"));

  for (const tagId of categoryTagIds.slice(0, 8)) {
    const response = await fetch(`${baseUrl}/api/tags`, {
      method: "POST",
      headers: { cookie: creatorCookie, "content-type": "application/json" },
      body: JSON.stringify({ tagId }),
    });
    assert.equal(response.status, 200, await response.text());
  }
  const ninth = await fetch(`${baseUrl}/api/tags`, {
    method: "POST",
    headers: { cookie: creatorCookie, "content-type": "application/json" },
    body: JSON.stringify({ tagId: categoryTagIds[8] }),
  });
  assert.equal(ninth.status, 400);
  assert.match((await ninth.json()).error, /最多选择 8 个/);

  const tooLong = await fetch(`${baseUrl}/api/tags`, {
    method: "POST",
    headers: { cookie: creatorCookie, "content-type": "application/json" },
    body: JSON.stringify({ customLabel: "超过七个字的标签", category: secondCategory }),
  });
  assert.equal(tooLong.status, 400);
  assert.match((await tooLong.json()).error, /最多7个字/);

  const custom = await fetch(`${baseUrl}/api/tags`, {
    method: "POST",
    headers: { cookie: creatorCookie, "content-type": "application/json" },
    body: JSON.stringify({ customLabel: "七个字符测试呀", category: secondCategory }),
  });
  assert.equal(custom.status, 200);
  assert.ok((await custom.json()).creator.tags.some((tag) => tag.label === "七个字符测试呀" && tag.status === "pending"));

  const submit = await fetch(`${baseUrl}/api/tags`, {
    method: "POST",
    headers: { cookie: creatorCookie, "content-type": "application/json" },
    body: JSON.stringify({ action: "submit" }),
  });
  const creator = (await submit.json()).creator;
  assert.equal(submit.status, 200);
  assert.equal(creator.onboarding.complete, true);
  assert.ok(creator.tagsFirstSubmittedAt);
});

gatedTest("both generation modes default to three uses and every task consumes a schedule confirmation", async () => {
  const generationConfirmation = await fetch(`${baseUrl}/api/availability`, {
    method: "POST",
    headers: { cookie: creatorCookie, "content-type": "application/json" },
    body: JSON.stringify({ action: "confirmForGeneration" }),
  });
  assert.equal(generationConfirmation.status, 200, await generationConfirmation.text());
  const first = await fetch(`${baseUrl}/api/copy`, {
    method: "POST",
    headers: { cookie: creatorCookie, "content-type": "application/json" },
    body: JSON.stringify({ mode: "free" }),
  });
  const firstPayload = await first.json();
  assert.equal(first.status, 202, JSON.stringify(firstPayload));
  assert.equal(firstPayload.generation.status, "processing");
  const status = await fetch(`${baseUrl}/api/copy/status?id=${firstPayload.generation.id}`, { headers: { cookie: creatorCookie } });
  const statusPayload = await status.json();
  assert.equal(status.status, 200);
  assert.equal(statusPayload.task.id, firstPayload.generation.id);
  assert.equal("title" in statusPayload.task, false);
  const completed = await waitForGeneration(firstPayload.generation.id, "completed");
  assert.ok(completed.generation.title);
  assert.ok(completed.generation.body);
  assert.ok(completed.generation.title.length + completed.generation.body.length >= 450);
  assert.ok(completed.generation.title.length + completed.generation.body.length <= 500);
  assert.match(completed.generation.body, new RegExp(`${futureActivityDateCn}，我会在线下和大家见面。`));
  assert.match(completed.generation.body, /#/);
  assert.match(completed.generation.body, /我|我们/);
  assert.equal(completed.payload.creator.copyQuota.freeLimit, 3);
  assert.equal(completed.payload.creator.copyQuota.freeUsed, 1);
  assert.equal(completed.payload.creator.copyQuota.freeRemaining, 2);
  assert.equal(completed.payload.creator.copyQuota.upgradeLimit, 3);
  assert.ok(completed.payload.messages.some((item) => item.subject === "文案已生成"));

  const withoutAnotherConfirmation = await fetch(`${baseUrl}/api/copy`, {
    method: "POST",
    headers: { cookie: creatorCookie, "content-type": "application/json" },
    body: JSON.stringify({ mode: "free" }),
  });
  assert.equal(withoutAnotherConfirmation.status, 400);
  assert.match((await withoutAnotherConfirmation.json()).error, /确认本次活动计划/);

  const upgrade = await fetch(`${baseUrl}/api/copy`, {
    method: "POST",
    headers: { cookie: creatorCookie, "content-type": "application/json" },
    body: JSON.stringify({ mode: "upgrade" }),
  });
  assert.equal(upgrade.status, 400);
  assert.match((await upgrade.json()).error, /暂未开放/);
});

gatedTest("successful registration through a creator invite rewards both generation modes", async () => {
  const inviterBefore = await fetch(`${baseUrl}/api/auth/me`, { headers: { cookie: creatorCookie } }).then((response) => response.json());
  const inviteCode = inviterBefore.creator.inviteCode;
  const response = await fetch(`${baseUrl}/api/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      inviteCode,
      phone: "18800000739",
      confirmPhone: "18800000739",
      province: "上海市",
      city: "上海市",
      password: "InviteReward739!",
      confirmPassword: "InviteReward739!",
    }),
  });
  const invitedCookie = (response.headers.get("set-cookie") || "").split(";")[0];
  assert.equal(response.status, 201, await response.text());
  const invited = await fetch(`${baseUrl}/api/auth/me`, { headers: { cookie: invitedCookie } }).then((item) => item.json());
  assert.equal(invited.creator.copyQuota.freeLimit, 3);
  assert.equal(invited.creator.copyQuota.upgradeLimit, 3);
  const inviterAfter = await fetch(`${baseUrl}/api/auth/me`, { headers: { cookie: creatorCookie } }).then((item) => item.json());
  assert.equal(inviterAfter.creator.copyQuota.freeLimit, 5);
  assert.equal(inviterAfter.creator.copyQuota.upgradeLimit, 5);
  assert.ok(inviterAfter.messages.some((item) => item.subject === "邀请成功，生成额度已增加"));

  const duplicate = await fetch(`${baseUrl}/api/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      inviteCode,
      phone: "18800000739",
      confirmPhone: "18800000739",
      province: "上海市",
      city: "上海市",
      password: "InviteReward739!",
      confirmPassword: "InviteReward739!",
    }),
  });
  assert.equal(duplicate.status, 400);
  const inviterAfterDuplicate = await fetch(`${baseUrl}/api/auth/me`, { headers: { cookie: creatorCookie } }).then((item) => item.json());
  assert.equal(inviterAfterDuplicate.creator.copyQuota.freeLimit, 5);
  assert.equal(inviterAfterDuplicate.creator.copyQuota.upgradeLimit, 5);
});

gatedTest("notification read state changes one message at a time", async () => {
  const inbox = await fetch(`${baseUrl}/api/inbox`, { headers: { cookie: creatorCookie } }).then((response) => response.json());
  assert.ok(inbox.unreadCount >= 1);
  const target = inbox.messages.find((item) => !item.readAt);
  const read = await fetch(`${baseUrl}/api/inbox`, {
    method: "PATCH",
    headers: { cookie: creatorCookie, "content-type": "application/json" },
    body: JSON.stringify({ id: target.id }),
  });
  const messages = (await read.json()).messages;
  assert.ok(messages.find((item) => item.id === target.id).readAt);
});

gatedTest("admin authentication protects private operations", async () => {
  assert.equal((await fetch(`${baseUrl}/api/admin/overview`)).status, 401);
  const login = await fetch(`${baseUrl}/api/admin/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: "smoke-admin", password: "SmokeTestPassword-730!" }),
  });
  assert.equal(login.status, 200);
  adminCookie = (login.headers.get("set-cookie") || "").split(";")[0];
});

gatedTest("admin controls the local trend library without exposing it to creators", async () => {
  const initial = await fetch(`${baseUrl}/api/admin/trends`, { headers: { cookie: adminCookie } });
  assert.equal(initial.status, 200);
  const initialPayload = await initial.json();
  assert.equal(initialPayload.settings.automaticUpdate, true);
  const created = await fetch(`${baseUrl}/api/admin/trends`, {
    method: "POST",
    headers: { cookie: adminCookie, "content-type": "application/json" },
    body: JSON.stringify({ term: "周末灵感", source: "AI推荐", relatedTags: ["陶瓷"], relatedCategories: ["我的作品"], score: 82, confidence: 70, risk: 5, status: "enabled" }),
  });
  const createdPayload = await created.json();
  assert.equal(created.status, 200, JSON.stringify(createdPayload));
  assert.ok(createdPayload.terms.some((item) => item.term === "周末灵感" && item.source === "AI推荐"));
  const settings = await fetch(`${baseUrl}/api/admin/trends`, {
    method: "POST",
    headers: { cookie: adminCookie, "content-type": "application/json" },
    body: JSON.stringify({ action: "settings", settings: { automaticUpdate: true, updateIntervalHours: 24, baseMaxTerms: 1, upgradeMaxTerms: 2 } }),
  }).then((response) => response.json());
  assert.equal(settings.settings.automaticUpdate, true);
  assert.equal(settings.settings.baseMaxTerms, 1);
  assert.equal((await fetch(`${baseUrl}/api/admin/trends`)).status, 401);
});

gatedTest("admin controls the homepage showcase as a group and by layer", async () => {
  const update = await fetch(`${baseUrl}/api/admin/settings`, {
    method: "PATCH",
    headers: { cookie: adminCookie, "content-type": "application/json" },
    body: JSON.stringify({
      homeShowcase: {
        enabled: true,
        cards: [
          { enabled: false, index: "A1", category: "测试分类", eyebrow: "TEST LAYER", title: "测试首页层级", footer: "测试底部文字", background: "#123456", foreground: "#FEDCBA" },
        ],
      },
      homeCriteria: [
        { id: "city", label: "地点", icon: "Compass", enabled: true, sortOrder: 2 },
        { id: "schedule", label: "时间", icon: "CalendarDays", enabled: false, sortOrder: 1 },
      ],
      inviteSharing: {
        heading: "测试固定邀请码",
        template: "邀请码：{邀请码}\n加入：{加入网址}",
        joinUrl: "https://thedesignexpo.org.cn/join",
      },
    }),
  });
  assert.equal(update.status, 200);
  const updated = (await update.json()).settings.homeShowcase;
  assert.equal(updated.enabled, true);
  assert.equal(updated.cards[0].enabled, false);
  assert.equal(updated.cards[0].title, "测试首页层级");
  assert.equal(updated.cards[0].background, "#123456");
  assert.equal(updated.cards[0].foreground, "#FEDCBA");
  assert.equal(updated.cards.length, 3);
  const updatedSettings = await fetch(`${baseUrl}/api/public/settings`).then((response) => response.json());
  assert.equal(updatedSettings.settings.homeCriteria.find((item) => item.id === "city").label, "地点");
  assert.equal(updatedSettings.settings.homeCriteria.find((item) => item.id === "schedule").enabled, false);
  assert.equal(updatedSettings.settings.inviteSharing.heading, "测试固定邀请码");

  const publicSettings = await fetch(`${baseUrl}/api/public/settings`).then((response) => response.json());
  assert.equal(publicSettings.settings.homeShowcase.enabled, true);
  assert.equal(publicSettings.settings.homeShowcase.cards[0].enabled, false);
  assert.equal(publicSettings.settings.homeShowcase.cards[0].title, "测试首页层级");

  const restore = await fetch(`${baseUrl}/api/admin/settings`, {
    method: "PATCH",
    headers: { cookie: adminCookie, "content-type": "application/json" },
    body: JSON.stringify({ homeShowcase: { enabled: false } }),
  });
  assert.equal(restore.status, 200);
  assert.equal((await restore.json()).settings.homeShowcase.enabled, false);
});

gatedTest("admin showcase upload validates access and image requirements", async () => {
  const image = await sharp({ create: { width: 750, height: 1000, channels: 3, background: "#e7e7e7" } }).jpeg({ quality: 80 }).toBuffer();
  const unauthorizedBody = new FormData();
  unauthorizedBody.append("file", new File([image], "showcase.jpg", { type: "image/jpeg" }));
  assert.equal((await fetch(`${baseUrl}/api/admin/showcase-upload`, { method: "POST", body: unauthorizedBody })).status, 401);

  const body = new FormData();
  body.append("file", new File([image], "showcase.jpg", { type: "image/jpeg" }));
  const upload = await fetch(`${baseUrl}/api/admin/showcase-upload`, { method: "POST", headers: { cookie: adminCookie }, body });
  const payload = await upload.json();
  assert.equal(upload.status, 200, JSON.stringify(payload));
  assert.match(payload.url, /^\/api\/assets\/platform\/showcase\//);
  const asset = await fetch(`${baseUrl}${payload.url}`);
  assert.equal(asset.status, 200);
  assert.equal(asset.headers.get("content-type"), "image/webp");

  const remove = await fetch(`${baseUrl}/api/admin/showcase-upload`, { method: "DELETE", headers: { cookie: adminCookie, "content-type": "application/json" }, body: JSON.stringify({ url: payload.url }) });
  assert.equal(remove.status, 200);
});

gatedTest("admin edits persistent writer status and tip copy", async () => {
  const response = await fetch(`${baseUrl}/api/admin/settings`, {
    method: "PATCH",
    headers: { cookie: adminCookie, "content-type": "application/json" },
    body: JSON.stringify({
      writerIntro: { enabled: true, version: "smoke-2" },
      uiText: { "writer.guideTitle": "测试创作标准" },
      writerUi: {
        statusLabels: { queued: "测试排队文字" },
        waitMessage: "测试等待说明",
        tips: ["第一条测试提示", "第二条测试提示"],
        completedNotificationBody: "{模式}《{标题}》测试完成。",
      },
    }),
  });
  const settings = (await response.json()).settings;
  assert.equal(response.status, 200);
  assert.equal(settings.writerUi.statusLabels.queued, "测试排队文字");
  assert.equal(settings.writerUi.statusLabels.analyzing, "正在分析代表图片与标签");
  assert.equal(settings.writerUi.waitMessage, "测试等待说明");
  assert.deepEqual(settings.writerUi.tips, ["第一条测试提示", "第二条测试提示"]);
  assert.equal(settings.writerIntro.version, "smoke-2");
  assert.equal(settings.uiText["writer.guideTitle"], "测试创作标准");
});

gatedTest("admin edits Redbook templates and per-user generation quotas", async () => {
  const redbook = await fetch(`${baseUrl}/api/admin/redbook`, { headers: { cookie: adminCookie } }).then((response) => response.json());
  assert.equal(redbook.settings.name, "红薯算法");
  assert.equal(redbook.upgradeConfigured, false);
  const updatedTemplate = await fetch(`${baseUrl}/api/admin/redbook`, {
    method: "PATCH",
    headers: { cookie: adminCookie, "content-type": "application/json" },
    body: JSON.stringify({
      version: "smoke-1",
      titleTemplates: ["{品牌}认真介绍{作品}"],
      openingTemplates: ["这次从{作品}开始。"],
      closingTemplates: ["你会把它放进什么场景？"],
    }),
  });
  const templatePayload = await updatedTemplate.json();
  assert.equal(updatedTemplate.status, 200);
  assert.equal(templatePayload.settings.version, "smoke-1");
  assert.deepEqual(templatePayload.settings.titleTemplates, ["{品牌}认真介绍{作品}"]);

  for (const [mode, limit] of [["free", 2], ["upgrade", 1]]) {
    const response = await fetch(`${baseUrl}/api/admin/writer`, {
      method: "PATCH",
      headers: { cookie: adminCookie, "content-type": "application/json" },
      body: JSON.stringify({ creatorId, mode, limit }),
    });
    assert.equal(response.status, 200, await response.text());
  }

  const nextConfirmation = await fetch(`${baseUrl}/api/availability`, {
    method: "POST",
    headers: { cookie: creatorCookie, "content-type": "application/json" },
    body: JSON.stringify({ action: "confirmForGeneration" }),
  });
  assert.equal(nextConfirmation.status, 200, await nextConfirmation.text());

  const secondFree = await fetch(`${baseUrl}/api/copy`, {
    method: "POST",
    headers: { cookie: creatorCookie, "content-type": "application/json" },
    body: JSON.stringify({ mode: "free" }),
  });
  const secondPayload = await secondFree.json();
  assert.equal(secondFree.status, 202, JSON.stringify(secondPayload));
  const secondCompleted = await waitForGeneration(secondPayload.generation.id, "completed");
  assert.match(secondCompleted.generation.title, /测试品牌认真介绍/);
  assert.equal(secondCompleted.generation.templateVersion, "smoke-1");
  assert.equal(secondCompleted.payload.creator.copyQuota.freeRemaining, 0);
  assert.equal(secondCompleted.payload.creator.copyQuota.freeUsed, 2);
  const retained = await fetch(`${baseUrl}/api/admin/overview`, { headers: { cookie: adminCookie } }).then((response) => response.json());
  assert.equal(retained.generations.filter((item) => item.creatorId === creatorId && item.mode === "free" && item.status === "completed").length, 1);

  const unavailableUpgrade = await fetch(`${baseUrl}/api/copy`, {
    method: "POST",
    headers: { cookie: creatorCookie, "content-type": "application/json" },
    body: JSON.stringify({ mode: "upgrade" }),
  });
  assert.equal(unavailableUpgrade.status, 400);
  assert.match((await unavailableUpgrade.json()).error, /暂未开放/);
  const me = await fetch(`${baseUrl}/api/auth/me`, { headers: { cookie: creatorCookie } }).then((response) => response.json());
  assert.equal(me.creator.copyQuota.upgradeUsed, 0);
  assert.equal(me.creator.copyQuota.upgradeRemaining, 1);
  assert.ok(!me.generations.some((item) => item.mode === "upgrade"));
});

gatedTest("search recipients receive independently recorded platform notifications", async () => {
  const sent = await fetch(`${baseUrl}/api/admin/messages`, {
    method: "POST",
    headers: { cookie: adminCookie, "content-type": "application/json" },
    body: JSON.stringify({
      creatorIds: [creatorId],
      subject: "上海活动定向通知",
      body: "这是一条来自寻人筛选结果的测试通知。",
      source: "creator_search",
      filterSnapshot: { province: "上海市", city: "上海市", tagIds: categoryTagIds.slice(0, 2) },
    }),
  });
  const payload = await sent.json();
  assert.equal(sent.status, 200);
  assert.equal(payload.sent, 1);
  assert.equal(payload.notification.source, "creator_search");
  assert.equal(payload.notification.sender, "超级管理员");
  assert.equal(payload.notification.recipients[0].id, creatorId);
  assert.deepEqual(payload.notification.filterSnapshot.tagIds, categoryTagIds.slice(0, 2));

  const history = await fetch(`${baseUrl}/api/admin/messages`, { headers: { cookie: adminCookie } }).then((response) => response.json());
  assert.ok(history.notifications.some((item) => item.id === payload.notification.id));
  const inbox = await fetch(`${baseUrl}/api/inbox`, { headers: { cookie: creatorCookie } }).then((response) => response.json());
  assert.ok(inbox.messages.some((item) => item.subject === "上海活动定向通知"));
});

gatedTest("admin creates reusable invite codes and searches composable filters", async () => {
  const created = await fetch(`${baseUrl}/api/admin/invites`, {
    method: "POST",
    headers: { cookie: adminCookie, "content-type": "application/json" },
    body: JSON.stringify({ code: "SMOKE730" }),
  });
  assert.equal(created.status, 200);

  const rangeSearch = await fetch(`${baseUrl}/api/admin/creators`, {
    method: "POST",
    headers: { cookie: adminCookie, "content-type": "application/json" },
    body: JSON.stringify({ keyword: "测试品牌", province: "上海市", city: "上海市", startDate: "2026-07-29", endDate: "2026-08-03", tagIds: categoryTagIds.slice(0, 2) }),
  }).then((response) => response.json());
  assert.ok(rangeSearch.creators.some((item) => item.id === creatorId));
  const inviteSearch = await fetch(`${baseUrl}/api/admin/creators`, {
    method: "POST",
    headers: { cookie: adminCookie, "content-type": "application/json" },
    body: JSON.stringify({ inviteCode: "QIDENG" }),
  }).then((response) => response.json());
  const invitedCreator = inviteSearch.creators.find((item) => item.id === creatorId);
  assert.equal(invitedCreator.registeredWithCode, "QIDENG26");
  assert.equal(invitedCreator.invitedByName, "平台邀请码");

  const occupiedDay = await fetch(`${baseUrl}/api/admin/creators`, {
    method: "POST",
    headers: { cookie: adminCookie, "content-type": "application/json" },
    body: JSON.stringify({ startDate: futureActivityDate, endDate: futureActivityDate }),
  }).then((response) => response.json());
  assert.ok(!occupiedDay.creators.some((item) => item.id === creatorId));
});

gatedTest("admin field rules immediately gate old users and exports remain complete", async () => {
  const settingsResponse = await fetch(`${baseUrl}/api/admin/settings`, {
    method: "PATCH",
    headers: { cookie: adminCookie, "content-type": "application/json" },
    body: JSON.stringify({
      productName: "奇灯测试邀约",
      lightsDescription: "测试亮灯说明",
      fieldRules: { [`lights.category.${requiredCategory}`]: { enabled: true, required: true } },
    }),
  });
  assert.equal(settingsResponse.status, 200);
  const settings = (await settingsResponse.json()).settings;
  assert.equal(settings.productName, "奇灯测试邀约");
  assert.equal(settings.lightsDescription, "测试亮灯说明");
  assert.equal(settings.fieldRules[`lights.category.${requiredCategory}`].required, true);

  const gated = await fetch(`${baseUrl}/api/auth/me`, { headers: { cookie: creatorCookie } }).then((response) => response.json());
  assert.equal(gated.creator.onboarding.lightsSubmitted, false);
  assert.equal(gated.creator.onboarding.nextStep, "lights");

  await fetch(`${baseUrl}/api/tags`, {
    method: "POST",
    headers: { cookie: creatorCookie, "content-type": "application/json" },
    body: JSON.stringify({ tagId: requiredCategoryTagId }),
  });
  const resubmitted = await fetch(`${baseUrl}/api/tags`, {
    method: "POST",
    headers: { cookie: creatorCookie, "content-type": "application/json" },
    body: JSON.stringify({ action: "submit" }),
  }).then((response) => response.json());
  assert.equal(resubmitted.creator.onboarding.complete, true);

  const download = await fetch(`${baseUrl}/api/admin/export`, {
    method: "POST",
    headers: { cookie: adminCookie, "content-type": "application/json" },
    body: JSON.stringify({ creatorIds: [creatorId] }),
  });
  const zip = Buffer.from(await download.arrayBuffer());
  assert.equal(download.status, 200);
  assert.match(download.headers.get("content-type") || "", /application\/zip/);
  assert.equal(zip.subarray(0, 2).toString(), "PK");
  const archive = await JSZip.loadAsync(zip);
  const summary = await archive.file("汇总表.csv").async("string");
  assert.match(summary, /微信ID/);
  assert.match(summary, /社交账号/);
  assert.match(summary, /最新免费标题/);
  assert.match(summary, /最新升级正文/);
  const copyFile = Object.values(archive.files).find((item) => item.name.endsWith("/生成文案.txt"));
  assert.ok(copyFile);
  const copyText = await copyFile.async("string");
  assert.match(copyText, /【最新免费生成】/);
  assert.match(copyText, /【最新升级生成】/);
});

gatedTest("creator and admin both retain the latest copy without a 24-hour expiry", async () => {
  const db = new DatabaseSync(path.join(dataDir, "qideng-curated-invitations.sqlite"));
  db.prepare("UPDATE copy_generations SET completed_at = datetime('now', '-25 hours') WHERE creator_id = ? AND mode = 'free' AND status = 'completed'").run(creatorId);
  const creatorPayload = await fetch(`${baseUrl}/api/auth/me`, { headers: { cookie: creatorCookie } }).then((response) => response.json());
  assert.ok(creatorPayload.generations.some((item) => item.mode === "free" && item.status === "completed"));
  const adminPayload = await fetch(`${baseUrl}/api/admin/overview`, { headers: { cookie: adminCookie } }).then((response) => response.json());
  assert.ok(adminPayload.generations.some((item) => item.creatorId === creatorId && item.mode === "free" && item.status === "completed"));
  db.prepare("UPDATE copy_generations SET completed_at = CURRENT_TIMESTAMP WHERE creator_id = ? AND mode = 'free' AND status = 'completed'").run(creatorId);
  db.close();
});

gatedTest("retiring a public tag preserves creator history and admin filtering", async () => {
  const created = await fetch(`${baseUrl}/api/admin/tags`, {
    method: "POST",
    headers: { cookie: adminCookie, "content-type": "application/json" },
    body: JSON.stringify({ category: secondCategory, label: "下架保留测试" }),
  }).then((response) => response.json());
  const tagId = created.tag.id;
  const assigned = await fetch(`${baseUrl}/api/admin/creators`, {
    method: "PATCH",
    headers: { cookie: adminCookie, "content-type": "application/json" },
    body: JSON.stringify({ action: "addTag", creatorId, tagId }),
  });
  assert.equal(assigned.status, 200);

  const retired = await fetch(`${baseUrl}/api/admin/tags`, {
    method: "DELETE",
    headers: { cookie: adminCookie, "content-type": "application/json" },
    body: JSON.stringify({ id: tagId }),
  });
  assert.equal(retired.status, 200);
  assert.equal((await retired.json()).tags.find((tag) => tag.id === tagId).status, "retired");

  const creator = await fetch(`${baseUrl}/api/auth/me`, { headers: { cookie: creatorCookie } }).then((response) => response.json());
  assert.equal(creator.creator.tags.find((tag) => tag.id === tagId).status, "retired");
  const catalog = await fetch(`${baseUrl}/api/catalog`).then((response) => response.json());
  assert.ok(!catalog.tags.some((tag) => tag.id === tagId));
  const search = await fetch(`${baseUrl}/api/admin/creators`, {
    method: "POST",
    headers: { cookie: adminCookie, "content-type": "application/json" },
    body: JSON.stringify({ tagIds: [tagId] }),
  }).then((response) => response.json());
  assert.ok(search.creators.some((item) => item.id === creatorId));
});

gatedTest("subadmin approval, scoped management, invitation inheritance, and restrictions work end to end", async () => {
  const subadminPhone = "18800000801";
  const registration = await fetch(`${baseUrl}/api/admin/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ phone: subadminPhone, confirmPhone: subadminPhone }),
  });
  assert.equal(registration.status, 201, await registration.text());

  const pendingLogin = await fetch(`${baseUrl}/api/admin/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: subadminPhone, password: subadminPhone }),
  });
  assert.equal(pendingLogin.status, 401);
  assert.match((await pendingLogin.json()).error, /等待超级管理员审核/);

  const accountPayload = await fetch(`${baseUrl}/api/admin/accounts`, {
    headers: { cookie: adminCookie },
  }).then((response) => response.json());
  const account = accountPayload.accounts.find((item) => item.phone === subadminPhone);
  assert.ok(account);
  assert.equal(account.status, "pending");
  const approved = await fetch(`${baseUrl}/api/admin/accounts`, {
    method: "PATCH",
    headers: { cookie: adminCookie, "content-type": "application/json" },
    body: JSON.stringify({ id: account.id, status: "active", inviteCode: "TEAM801" }),
  });
  assert.equal(approved.status, 200, await approved.text());

  const login = await fetch(`${baseUrl}/api/admin/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: subadminPhone, password: subadminPhone }),
  });
  const loginPayload = await login.json();
  assert.equal(login.status, 200, JSON.stringify(loginPayload));
  assert.equal(loginPayload.role, "subadmin");
  const subadminCookie = (login.headers.get("set-cookie") || "").split(";")[0];
  assert.match(subadminCookie, /qideng_invite_admin=/);

  const initialOverview = await fetch(`${baseUrl}/api/admin/overview`, {
    headers: { cookie: subadminCookie },
  }).then((response) => response.json());
  assert.equal(initialOverview.admin.role, "subadmin");
  assert.equal(initialOverview.adminAccounts.length, 0);
  assert.equal(initialOverview.generations.length, 0);
  assert.ok(!initialOverview.creators.some((item) => item.id === creatorId));

  const managedResponse = await fetch(`${baseUrl}/api/admin/creators`, {
    method: "POST",
    headers: { cookie: subadminCookie, "content-type": "application/json" },
    body: JSON.stringify({ action: "create", phone: "18800000802", brandName: "子管理员新增品牌", province: "上海市", city: "上海市" }),
  });
  const managedPayload = await managedResponse.json();
  assert.equal(managedResponse.status, 201, JSON.stringify(managedPayload));
  const managed = managedPayload.creator;
  assert.equal(managed.managerAdminId, account.id);
  assert.equal(managed.registeredWithCode, "TEAM801");
  assert.match(managed.inviteCode, /^[A-Z0-9]{6}$/);
  assert.equal(managed.copyQuota.freeLimit, 3);
  assert.equal(managed.copyQuota.upgradeLimit, 3);

  const updated = await fetch(`${baseUrl}/api/admin/creators`, {
    method: "PATCH",
    headers: { cookie: subadminCookie, "content-type": "application/json" },
    body: JSON.stringify({
      action: "updateDetails",
      creatorId: managed.id,
      brandName: "已分级创意品牌",
      intro: "专注自然材料手作与线下体验。",
      province: "浙江省",
      city: "杭州市",
      adminRating: "excellent",
      adminNote: "重点跟进秋季快闪",
      opportunityTypes: ["快闪合作", "品牌联名"],
      opportunityOptIn: true,
      tagIds: [categoryTagIds[0]],
      busyPeriods: [{ startDate: "2026-09-18", endDate: "2026-09-18", note: "公开活动" }],
      noBookings: false,
    }),
  });
  const updatedPayload = await updated.json();
  assert.equal(updated.status, 200, JSON.stringify(updatedPayload));
  const updatedCreator = updatedPayload.creator;
  assert.equal(updatedCreator.adminRating, "excellent");
  assert.equal(updatedCreator.adminNote, "重点跟进秋季快闪");
  assert.deepEqual(updatedCreator.opportunityTypes, ["快闪合作", "品牌联名"]);
  assert.equal(updatedCreator.busyPeriods[0].startDate, "2026-09-18");
  assert.ok(updatedCreator.tags.some((item) => item.id === categoryTagIds[0]));

  const image = await sharp({
    create: { width: 64, height: 64, channels: 3, background: "#e5b93f" },
  }).png().toBuffer();
  const imageForm = new FormData();
  imageForm.set("creatorId", String(managed.id));
  imageForm.set("file", new File([image], "managed.png", { type: "image/png" }));
  const imageUpload = await fetch(`${baseUrl}/api/admin/creator-image`, {
    method: "POST",
    headers: { cookie: subadminCookie },
    body: imageForm,
  });
  const imagePayload = await imageUpload.json();
  assert.equal(imageUpload.status, 200, JSON.stringify(imagePayload));
  assert.equal(imagePayload.creator.workUrls.length, 1);

  const archivedResponse = await fetch(`${baseUrl}/api/admin/creators`, {
    method: "PATCH",
    headers: { cookie: subadminCookie, "content-type": "application/json" },
    body: JSON.stringify({ action: "setSuspended", creatorId: managed.id, suspended: true }),
  });
  const archivedPayload = await archivedResponse.json();
  assert.equal(archivedResponse.status, 200, JSON.stringify(archivedPayload));
  assert.equal(archivedPayload.creator.suspended, true);
  const activeSearch = await fetch(`${baseUrl}/api/admin/creators`, {
    method: "POST",
    headers: { cookie: subadminCookie, "content-type": "application/json" },
    body: JSON.stringify({}),
  }).then((response) => response.json());
  assert.ok(!activeSearch.creators.some((item) => item.id === managed.id));
  const archivedSearch = await fetch(`${baseUrl}/api/admin/creators`, {
    method: "POST",
    headers: { cookie: subadminCookie, "content-type": "application/json" },
    body: JSON.stringify({ accountStatus: "archived" }),
  }).then((response) => response.json());
  assert.ok(archivedSearch.creators.some((item) => item.id === managed.id));
  const restoredResponse = await fetch(`${baseUrl}/api/admin/creators`, {
    method: "PATCH",
    headers: { cookie: adminCookie, "content-type": "application/json" },
    body: JSON.stringify({ action: "setSuspended", creatorId: managed.id, suspended: false }),
  });
  const restoredPayload = await restoredResponse.json();
  assert.equal(restoredResponse.status, 200, JSON.stringify(restoredPayload));
  assert.equal(restoredPayload.creator.suspended, false);
  assert.equal(restoredPayload.creator.workUrls.length, 1);
  assert.equal(restoredPayload.creator.adminNote, "重点跟进秋季快闪");

  const blockedManagement = await fetch(`${baseUrl}/api/admin/creators`, {
    method: "PATCH",
    headers: { cookie: subadminCookie, "content-type": "application/json" },
    body: JSON.stringify({ action: "updateDetails", creatorId, adminNote: "越权修改" }),
  });
  assert.equal(blockedManagement.status, 403);
  const blockedArchive = await fetch(`${baseUrl}/api/admin/creators`, {
    method: "PATCH",
    headers: { cookie: subadminCookie, "content-type": "application/json" },
    body: JSON.stringify({ action: "setSuspended", creatorId, suspended: true }),
  });
  assert.equal(blockedArchive.status, 403);
  const scopedNotification = await fetch(`${baseUrl}/api/admin/messages`, {
    method: "POST",
    headers: { cookie: subadminCookie, "content-type": "application/json" },
    body: JSON.stringify({ creatorIds: [managed.id], subject: "负责范围通知", body: "只发送给当前子管理员负责的新遇官。" }),
  });
  assert.equal(scopedNotification.status, 200, await scopedNotification.text());
  const blockedNotification = await fetch(`${baseUrl}/api/admin/messages`, {
    method: "POST",
    headers: { cookie: subadminCookie, "content-type": "application/json" },
    body: JSON.stringify({ creatorIds: [creatorId], subject: "越权通知", body: "这条通知不应发送。" }),
  });
  assert.equal(blockedNotification.status, 403);
  for (const [pathname, options] of [
    ["/api/admin/settings", {}],
    ["/api/admin/invites", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }],
    ["/api/admin/tags", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ category: secondCategory, label: "越权标签" }) }],
    ["/api/admin/writer", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ creatorId: managed.id, mode: "free", limit: 50 }) }],
    ["/api/admin/export", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ creatorIds: [managed.id] }) }],
    ["/api/admin/creators", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "setLimit", creatorId: managed.id, limit: 50 }) }],
  ]) {
    const response = await fetch(`${baseUrl}${pathname}`, {
      ...options,
      headers: { cookie: subadminCookie, ...(options.headers || {}) },
    });
    assert.equal(response.status, 403, `${pathname} should reject subadmins`);
  }

  const directRegistration = await fetch(`${baseUrl}/api/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      inviteCode: "TEAM801",
      phone: "18800000803",
      confirmPhone: "18800000803",
      province: "浙江省",
      city: "杭州市",
      password: "ManagedUser803!",
      confirmPassword: "ManagedUser803!",
      serviceIntents: ["writer", "opportunity"],
      opportunityTypes: ["市集合作", "企业活动"],
      opportunityOptIn: true,
    }),
  });
  assert.equal(directRegistration.status, 201, await directRegistration.text());
  const directCookie = (directRegistration.headers.get("set-cookie") || "").split(";")[0];
  const directUser = await fetch(`${baseUrl}/api/auth/me`, { headers: { cookie: directCookie } }).then((response) => response.json());
  assert.equal(directUser.creator.managerAdminId, account.id);
  assert.equal(directUser.creator.invitedByCreatorId, null);
  assert.deepEqual(directUser.creator.opportunityTypes, ["市集合作", "企业活动"]);
  assert.equal(directUser.creator.opportunityOptIn, true);

  const descendantRegistration = await fetch(`${baseUrl}/api/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      inviteCode: directUser.creator.inviteCode,
      phone: "18800000804",
      confirmPhone: "18800000804",
      province: "浙江省",
      city: "杭州市",
      password: "ManagedUser804!",
      confirmPassword: "ManagedUser804!",
    }),
  });
  assert.equal(descendantRegistration.status, 201, await descendantRegistration.text());

  const scopedOverview = await fetch(`${baseUrl}/api/admin/overview`, {
    headers: { cookie: subadminCookie },
  }).then((response) => response.json());
  assert.equal(scopedOverview.creators.length, 3);
  const directInTree = scopedOverview.creators.find((item) => item.phone === "18800000803");
  const descendantInTree = scopedOverview.creators.find((item) => item.phone === "18800000804");
  assert.equal(directInTree.managerAdminId, account.id);
  assert.equal(descendantInTree.managerAdminId, account.id);
  assert.equal(descendantInTree.invitedByCreatorId, directInTree.id);

  const superOverview = await fetch(`${baseUrl}/api/admin/overview`, {
    headers: { cookie: adminCookie },
  }).then((response) => response.json());
  assert.ok(superOverview.creators.some((item) => item.id === creatorId));
  assert.ok(superOverview.creators.some((item) => item.id === descendantInTree.id));
  assert.equal(superOverview.adminAccounts.find((item) => item.id === account.id).totalUsers, 3);

  const suspendedCreator = await fetch(`${baseUrl}/api/admin/creators`, {
    method: "PATCH",
    headers: { cookie: adminCookie, "content-type": "application/json" },
    body: JSON.stringify({ action: "setSuspended", creatorId: directInTree.id, suspended: true }),
  });
  assert.equal(suspendedCreator.status, 200, await suspendedCreator.text());
  const blockedExistingCreatorSession = await fetch(`${baseUrl}/api/auth/me`, { headers: { cookie: directCookie } });
  assert.equal(blockedExistingCreatorSession.status, 401);
  const restoredCreator = await fetch(`${baseUrl}/api/admin/creators`, {
    method: "PATCH",
    headers: { cookie: adminCookie, "content-type": "application/json" },
    body: JSON.stringify({ action: "setSuspended", creatorId: directInTree.id, suspended: false }),
  });
  assert.equal(restoredCreator.status, 200, await restoredCreator.text());

  const suspendedManager = await fetch(`${baseUrl}/api/admin/accounts`, {
    method: "PATCH",
    headers: { cookie: adminCookie, "content-type": "application/json" },
    body: JSON.stringify({ id: account.id, status: "suspended", inviteCode: "TEAM801" }),
  });
  assert.equal(suspendedManager.status, 200, await suspendedManager.text());
  for (const code of ["TEAM801", directInTree.inviteCode]) {
    const validation = await fetch(`${baseUrl}/api/auth/invite`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code }),
    });
    assert.equal(validation.status, 400, `${code} should stop accepting registrations`);
  }
  const blockedDescendantRegistration = await fetch(`${baseUrl}/api/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      inviteCode: directInTree.inviteCode,
      phone: "18800000805",
      confirmPhone: "18800000805",
      province: "浙江省",
      city: "杭州市",
      password: "ManagedUser805!",
      confirmPassword: "ManagedUser805!",
    }),
  });
  assert.equal(blockedDescendantRegistration.status, 400);
  assert.match((await blockedDescendantRegistration.json()).error, /邀请码无效/);
  const blockedManagerSession = await fetch(`${baseUrl}/api/admin/overview`, { headers: { cookie: subadminCookie } });
  assert.equal(blockedManagerSession.status, 401);
  const existingTreeUser = await fetch(`${baseUrl}/api/auth/me`, { headers: { cookie: directCookie } });
  assert.equal(existingTreeUser.status, 200);
});

gatedTest("a v0.13 creator database upgrades in place without losing users or quotas", async () => {
  const migrationDir = mkdtempSync(path.join(tmpdir(), "qideng-v013-migration-test-"));
  const migrationDb = new DatabaseSync(path.join(migrationDir, "qideng-curated-invitations.sqlite"));
  migrationDb.exec(`
    CREATE TABLE creators (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      phone TEXT NOT NULL UNIQUE,
      phone_verified_at TEXT,
      password_hash TEXT NOT NULL,
      password_salt TEXT NOT NULL,
      invite_code TEXT NOT NULL UNIQUE,
      registered_with_code TEXT NOT NULL,
      user_name TEXT NOT NULL DEFAULT '',
      brand_name TEXT NOT NULL DEFAULT '',
      wechat TEXT NOT NULL DEFAULT '',
      intro TEXT NOT NULL DEFAULT '',
      booth_description TEXT NOT NULL DEFAULT '',
      booth_description_confirmed_at TEXT,
      province TEXT NOT NULL DEFAULT '',
      city TEXT NOT NULL DEFAULT '',
      available_cities TEXT NOT NULL DEFAULT '[]',
      social_account TEXT NOT NULL DEFAULT '',
      logo_key TEXT,
      work_keys TEXT NOT NULL DEFAULT '[]',
      no_bookings INTEGER NOT NULL DEFAULT 0,
      schedule_confirmed_at TEXT,
      generation_schedule_confirmed_at TEXT,
      generation_schedule_confirmation_used_at TEXT,
      intro_popup_seen_version TEXT NOT NULL DEFAULT '',
      profile_submitted_at TEXT,
      tags_submitted_at TEXT,
      tags_first_submitted_at TEXT,
      application_limit INTEGER,
      free_generation_limit INTEGER NOT NULL DEFAULT 3,
      upgrade_generation_limit INTEGER NOT NULL DEFAULT 3,
      free_generation_used INTEGER NOT NULL DEFAULT 0,
      upgrade_generation_used INTEGER NOT NULL DEFAULT 0,
      suspended INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE admin_sessions (
      token TEXT PRIMARY KEY,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
  migrationDb.prepare(`INSERT INTO creators(
    phone, password_hash, password_salt, invite_code, registered_with_code,
    brand_name, intro, province, city, free_generation_limit, upgrade_generation_limit,
    free_generation_used, upgrade_generation_used
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    "18800000821", "legacy-hash", "legacy-salt", "OLDUSER8", "QIDENG26",
    "旧版保留品牌", "旧版介绍应完整保留", "上海市", "上海市", 7, 9, 2, 4,
  );
  migrationDb.close();

  const migrationPort = port + 1;
  const migrationServer = spawn(process.execPath, [".next/standalone/server.js"], {
    cwd: root,
    env: {
      ...process.env,
      NODE_ENV: "production",
      HOSTNAME: "127.0.0.1",
      PORT: String(migrationPort),
      DATA_DIR: migrationDir,
      QIDENG_BOOTSTRAP_INVITE_CODE: "QIDENG26",
      ADMIN_USERNAME: "migration-admin",
      ADMIN_PASSWORD: "MigrationPassword-821!",
      DOUBAO_API_KEY: "",
      DOUBAO_MODEL: "",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let migrationOutput = "";
  migrationServer.stdout.on("data", (chunk) => { migrationOutput += chunk; });
  migrationServer.stderr.on("data", (chunk) => { migrationOutput += chunk; });
  try {
    let ready = false;
    for (let attempt = 0; attempt < 100; attempt += 1) {
      try {
        const response = await fetch(`http://127.0.0.1:${migrationPort}/version`);
        if (response.ok) { ready = true; break; }
      } catch {}
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    assert.equal(ready, true, migrationOutput);
    const login = await fetch(`http://127.0.0.1:${migrationPort}/api/admin/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: "migration-admin", password: "MigrationPassword-821!" }),
    });
    assert.equal(login.status, 200, await login.text());
    const cookie = (login.headers.get("set-cookie") || "").split(";")[0];
    const overview = await fetch(`http://127.0.0.1:${migrationPort}/api/admin/overview`, {
      headers: { cookie },
    }).then((response) => response.json());
    const legacyCreator = overview.creators.find((item) => item.phone === "18800000821");
    assert.ok(legacyCreator);
    assert.equal(legacyCreator.brandName, "旧版保留品牌");
    assert.equal(legacyCreator.intro, "旧版介绍应完整保留");
    assert.equal(legacyCreator.copyQuota.freeLimit, 7);
    assert.equal(legacyCreator.copyQuota.freeUsed, 2);
    assert.equal(legacyCreator.copyQuota.upgradeLimit, 9);
    assert.equal(legacyCreator.copyQuota.upgradeUsed, 4);
    assert.equal(legacyCreator.managerAdminId, null);
    assert.deepEqual(legacyCreator.serviceIntents, ["writer"]);
    assert.deepEqual(legacyCreator.opportunityTypes, []);
    assert.equal(legacyCreator.adminRating, "");
  } finally {
    migrationServer.kill("SIGTERM");
    rmSync(migrationDir, { recursive: true, force: true });
  }
});

gatedTest("removed activity, interest, AI, and public-directory routes do not exist", async () => {
  assert.equal((await fetch(`${baseUrl}/api/applications`, { method: "POST" })).status, 404);
  assert.equal((await fetch(`${baseUrl}/api/interests`, { method: "POST" })).status, 404);
  assert.equal((await fetch(`${baseUrl}/api/admin/themes`, { method: "POST" })).status, 404);
  assert.equal((await fetch(`${baseUrl}/api/public/directory`)).status, 404);
  assert.equal((await fetch(`${baseUrl}/api/generate`, { method: "POST" })).status, 404);
});
