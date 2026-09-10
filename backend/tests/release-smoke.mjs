import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

const baseUrl = process.env.BASE_URL || "http://127.0.0.1:3120";
const root = path.resolve(import.meta.dirname, "..");
const packageJson = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
const expectedVersion = String(packageJson.version);
const smokeInviteCode = (process.env.SMOKE_INVITE_CODE || "").trim().toUpperCase();
assert.match(
  smokeInviteCode,
  /^[A-Z0-9]{4,8}$/,
  "Run with SMOKE_INVITE_CODE set to an active platform invite code created for this test",
);
const futureActivityDate = (() => {
  const date = new Date();
  date.setDate(date.getDate() + 7);
  return date.toISOString().slice(0, 10);
})();
const futureActivityDateCn = (() => {
  const [year, month, day] = futureActivityDate.split("-");
  return `${year}年${Number(month)}月${Number(day)}日`;
})();

async function json(pathname, options = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, options);
  const payload = await response.json();
  return { response, payload };
}

const version = await fetch(`${baseUrl}/version`);
assert.equal(version.status, 200);
assert.equal(version.headers.get("x-qideng-version"), expectedVersion);
assert.match(await version.text(), new RegExp(`版本：v${expectedVersion.replaceAll(".", "\\.")}`));

const home = await fetch(baseUrl);
assert.equal(home.status, 200);
const homeHtml = await home.text();
assert.match(homeHtml, /让奇灯在合适的时候想到你/);
assert.match(homeHtml, /加入奇灯/);
assert.match(homeHtml, /登录更新资料/);
assert.doesNotMatch(homeHtml, /奇灯 AI 智能体/);

const catalog = await json("/api/catalog");
assert.equal(catalog.response.status, 200);
assert.equal(catalog.payload.settings.navigation.writer, "生成");
assert.equal(catalog.payload.settings.navigation.dossier, "档案");
assert.equal(catalog.payload.settings.navigation.update, "更新");
assert.equal(catalog.payload.settings.navigation.profile, "我的");
assert.equal(catalog.payload.settings.navigation.inbox, undefined);
assert.equal(catalog.payload.settings.navigation.discover, undefined);
assert.equal(catalog.payload.settings.homeCriteria.every((item) => item.icon === "Lightbulb"), true);
assert.equal(catalog.payload.settings.uiText["join.registerTitle"], "开启注册");
assert.equal(catalog.payload.settings.uiText["join.registerButton"], "提交注册");
assert.equal(catalog.payload.settings.uiText["writer.newArticle"], "点击生成新文章");
assert.equal(catalog.payload.settings.writerUi.freeTitle, "基础生成模式");
assert.equal(catalog.payload.settings.writerUi.upgradeTitle, "魔法生成模式");
assert.equal(catalog.payload.settings.uiText["writer.updateHint"], "资料越真实，文章越像你");
assert.equal(catalog.payload.settings.uiText["profile.notificationsTitle"], "通知");
assert.equal(catalog.payload.settings.uiText["schedule.planLegend"], "活动计划");
assert.equal(catalog.payload.settings.writerUi.waitMessage, "通常会在6秒内完成，无需刷新或重复点击。");
assert.equal(catalog.payload.settings.sms.enabled, false);

const invite = await json("/api/auth/invite", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ code: smokeInviteCode }),
});
assert.equal(invite.response.status, 200);

const phone = `186${String(Date.now()).slice(-8)}`;
const registration = await json("/api/auth/register", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    inviteCode: smokeInviteCode,
    phone,
    confirmPhone: phone,
    province: "上海市",
    city: "上海市",
    wechat: "release-smoke-wechat",
    password: "ReleaseSmoke-810!",
    confirmPassword: "ReleaseSmoke-810!",
  }),
});
assert.equal(registration.response.status, 201);
assert.equal(registration.payload.redirectTo, "/studio?section=writer");
const cookie = (registration.response.headers.get("set-cookie") || "").split(";")[0];
assert.match(cookie, /qideng_invite_creator=/);

const headers = { cookie, "content-type": "application/json" };
const image = await readFile(path.join(root, "public", "posters", "category-1.jpg"));
const form = new FormData();
form.set("kind", "work");
form.set("file", new File([image], "representative.jpg", { type: "image/jpeg" }));
const upload = await fetch(`${baseUrl}/api/uploads`, { method: "POST", headers: { cookie }, body: form });
const uploaded = await upload.json();
assert.equal(upload.status, 200, JSON.stringify(uploaded));
assert.equal(uploaded.creator.workUrls.length, 1);

const tagId = catalog.payload.tags.find((item) => item.status === "active")?.id;
assert.ok(tagId);
const selectedTag = await json("/api/tags", {
  method: "POST",
  headers,
  body: JSON.stringify({ tagId }),
});
assert.equal(selectedTag.response.status, 200);
const submittedTags = await json("/api/tags", {
  method: "POST",
  headers,
  body: JSON.stringify({ action: "submit" }),
});
assert.equal(submittedTags.response.status, 200);
assert.ok(submittedTags.payload.creator.tagsSubmittedAt);

const scheduleDate = await json("/api/availability", {
  method: "POST",
  headers,
  body: JSON.stringify({ startDate: futureActivityDate, endDate: futureActivityDate }),
});
assert.equal(scheduleDate.response.status, 200);
const schedule = await json("/api/availability", {
  method: "POST",
  headers,
  body: JSON.stringify({ action: "confirmForGeneration" }),
});
assert.equal(schedule.response.status, 200);
assert.ok(schedule.payload.creator.scheduleConfirmedAt);
assert.equal(schedule.payload.creator.noBookings, false);

const profile = await json("/api/profile", {
  method: "PATCH",
  headers,
  body: JSON.stringify({
    userName: "发布验收",
    brandName: "发布验收品牌",
    intro: "我是一个专注原创作品与线下体验的创意人，希望分享真实作品细节与日常使用场景。",
    province: "上海市",
    city: "上海市",
    serviceIntents: ["writer", "opportunity"],
    opportunityTypes: ["市集合作", "品牌联名"],
    opportunityOptIn: true,
  }),
});
assert.equal(profile.response.status, 200);
assert.equal(profile.payload.creator.city, "上海市");
assert.deepEqual(profile.payload.creator.opportunityTypes, ["市集合作", "品牌联名"]);
assert.equal(profile.payload.creator.opportunityOptIn, true);

const generation = await json("/api/copy", {
  method: "POST",
  headers,
  body: JSON.stringify({ mode: "free" }),
});
assert.equal(generation.response.status, 202, JSON.stringify(generation.payload));
const generationId = generation.payload.generation.id;

const queuedStatus = await json(`/api/copy/status?id=${generationId}`, { headers: { cookie } });
assert.equal(queuedStatus.response.status, 200);
assert.equal(queuedStatus.payload.task.id, generationId);

let completed;
for (let attempt = 0; attempt < 100; attempt += 1) {
  const current = await json("/api/copy", { headers: { cookie } });
  completed = current.payload.generations.find((item) => item.id === generationId);
  if (completed?.status === "completed") break;
  if (completed?.status === "failed") throw new Error(completed.error || "generation failed");
  await new Promise((resolve) => setTimeout(resolve, 100));
}
assert.equal(completed?.status, "completed");
assert.ok(completed.title);
assert.ok(completed.body);
assert.ok(completed.title.length + completed.body.length >= 450);
assert.ok(completed.title.length + completed.body.length <= 500);
assert.match(completed.body, new RegExp(`${futureActivityDateCn}，我会在线下和大家见面。`));
assert.match(completed.body, /#/);
assert.match(completed.body, /我|我们/);

const me = await json("/api/auth/me", { headers: { cookie } });
assert.equal(me.response.status, 200);
assert.equal(me.payload.creator.copyQuota.freeLimit, 3);
assert.equal(me.payload.creator.copyQuota.freeUsed, 1);
assert.equal(me.payload.creator.copyQuota.upgradeLimit, 3);

process.stdout.write(`${JSON.stringify({
  ok: true,
  version: version.headers.get("x-qideng-version"),
  creatorId: registration.payload.creatorId,
  generationId,
  titleLength: completed.title.length,
  bodyLength: completed.body.length,
})}\n`);
