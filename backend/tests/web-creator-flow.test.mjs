import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, test } from "node:test";
import sharp from "sharp";

const dataDir = mkdtempSync(path.join(tmpdir(), "tde-web-creator-test-"));
process.env.DATA_DIR = dataDir;
process.env.NODE_ENV = "production";
process.env.QIDENG_BOOTSTRAP_INVITE_CODE = "VALID26";

const database = await import("../lib/database.ts");
const registerRoute = await import("../app/api/web/auth/register-account/route.ts");
const validateRoute = await import("../app/api/web/auth/invite/validate/route.ts");
const profileRoute = await import("../app/api/web/profile/route.ts");
const accountRoute = await import("../app/api/web/account/route.ts");
const uploadRoute = await import("../app/api/web/upload/route.ts");
const assetRoute = await import("../app/api/assets/[...key]/route.ts");
const preferencesRoute = await import("../app/api/web/preferences/route.ts");
const nextConfig = (await import("../next.config.mjs")).default;

let creatorToken = "";
let creatorId = 0;

after(() => {
  database.getDb().close();
  rmSync(dataDir, { recursive: true, force: true });
});

function jsonRequest(url, body, token = "") {
  return new Request(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": `127.0.0.${Math.floor(Math.random() * 200) + 1}`,
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

async function payload(response) {
  return { status: response.status, body: await response.json() };
}

test("invite validation reflects the active operations invite list", async () => {
  const valid = await payload(await validateRoute.POST(jsonRequest("http://localhost/api/web/auth/invite/validate", { inviteCode: "valid26" })));
  assert.equal(valid.status, 200);
  assert.equal(valid.body.valid, true);

  const invalid = await payload(await validateRoute.POST(jsonRequest("http://localhost/api/web/auth/invite/validate", { inviteCode: "123456" })));
  assert.equal(invalid.status, 200);
  assert.equal(invalid.body.valid, false);
});

test("homepage registration requires invite, location and explicit legal consent", async () => {
  const base = {
    phone: "18830000881",
    confirmPhone: "18830000881",
    password: "CreatorPass-881!",
    confirmPassword: "CreatorPass-881!",
    province: "北京市",
    city: "北京市",
    district: "朝阳区",
    agreed: true,
  };

  const invalidInvite = await payload(await registerRoute.POST(jsonRequest("http://localhost/api/web/auth/register-account", { ...base, inviteCode: "123456" })));
  assert.equal(invalidInvite.status, 400);
  assert.match(invalidInvite.body.error, /邀请码无效/);

  const noConsent = await payload(await registerRoute.POST(jsonRequest("http://localhost/api/web/auth/register-account", { ...base, inviteCode: "VALID26", agreed: false })));
  assert.equal(noConsent.status, 400);
  assert.match(noConsent.body.error, /用户协议和隐私政策/);

  const registered = await payload(await registerRoute.POST(jsonRequest("http://localhost/api/web/auth/register-account", { ...base, inviteCode: "valid26" })));
  assert.equal(registered.status, 201, JSON.stringify(registered.body));
  assert.ok(registered.body.session.token);
  creatorToken = registered.body.session.token;
  assert.equal(registered.body.creator.province, "北京市");
  assert.equal(registered.body.creator.district, "朝阳区");

  const creator = database.one("SELECT id, registered_with_code FROM creators WHERE phone = ?", base.phone);
  creatorId = creator.id;
  assert.equal(creator.registered_with_code, "VALID26");
  const consent = database.one("SELECT terms_version, privacy_version FROM legal_consents WHERE creator_id = ?", creator.id);
  assert.equal(consent.terms_version, "TDE-USER-20260905");
  assert.equal(consent.privacy_version, "TDE-PRIVACY-20260905");

  const profile = await payload(await profileRoute.GET(new Request("http://localhost/api/web/profile", {
    headers: { authorization: `Bearer ${registered.body.session.token}` },
  })));
  assert.equal(profile.status, 200);
  assert.equal(profile.body.preferences.saved, false);
  assert.equal(profile.body.legalConsents.length, 1);
});

test("homepage choices flow into the profile and operations review snapshot", async () => {
  const preferences = await payload(await preferencesRoute.POST(jsonRequest(
    "http://localhost/api/web/preferences",
    {
      unavailableDates: ["2026-9-12"],
      weeklyOff: [0],
      excludedVenueTags: ["商场"],
      footfallThreshold: 2,
      excludedAudienceTags: ["亲子家庭"],
    },
    creatorToken,
  )));
  assert.equal(preferences.status, 200, JSON.stringify(preferences.body));

  const brand = await payload(await profileRoute.POST(jsonRequest(
    "http://localhost/api/web/profile",
    { action: "updateProfile", brandName: "测试品牌", slogan: "现场见", intro: "用于审核链路测试" },
    creatorToken,
  )));
  assert.equal(brand.status, 200, JSON.stringify(brand.body));

  const otherImage = await payload(await profileRoute.POST(jsonRequest(
    "http://localhost/api/web/profile",
    { action: "updateImages", representativeImageKey: "web-creators/999/not-owned.jpg" },
    creatorToken,
  )));
  assert.equal(otherImage.status, 400);
  assert.match(otherImage.body.error, /其他账号/);

  const sourceImage = await sharp({
    create: { width: 32, height: 24, channels: 4, background: { r: 26, g: 86, b: 219, alpha: 1 } },
  }).png().toBuffer();
  const form = new FormData();
  form.set("file", new File([sourceImage], "phone-screenshot.png", { type: "image/x-png" }));
  const uploaded = await payload(await uploadRoute.POST(new Request("http://localhost/api/web/upload", {
    method: "POST",
    headers: { authorization: `Bearer ${creatorToken}` },
    body: form,
  })));
  assert.equal(uploaded.status, 200, JSON.stringify(uploaded.body));
  assert.match(uploaded.body.key, new RegExp(`^web-creators/${creatorId}/`));
  assert.match(uploaded.body.key, /\.jpg$/);
  assert.equal(uploaded.body.url, `/api/assets/${uploaded.body.key}`);
  const normalizedImage = await (await import("../lib/storage.ts")).getObject(uploaded.body.key);
  assert.equal(normalizedImage.contentType, "image/jpeg");
  assert.equal((await sharp(normalizedImage.body).metadata()).format, "jpeg");

  const readableImage = await assetRoute.GET(
    new Request(`http://localhost${uploaded.body.url}`, {
      headers: { authorization: `Bearer ${creatorToken}` },
    }),
    { params: Promise.resolve({ key: uploaded.body.key.split("/") }) },
  );
  assert.equal(readableImage.status, 200);
  assert.equal(readableImage.headers.get("content-type"), "image/jpeg");

  const privateImage = await assetRoute.GET(
    new Request(`http://localhost${uploaded.body.url}`),
    { params: Promise.resolve({ key: uploaded.body.key.split("/") }) },
  );
  assert.equal(privateImage.status, 404);

  const image = await payload(await profileRoute.POST(jsonRequest(
    "http://localhost/api/web/profile",
    { action: "updateImages", representativeImageKey: uploaded.body.key },
    creatorToken,
  )));
  assert.equal(image.status, 200, JSON.stringify(image.body));
  assert.equal(image.body.creator.brandName, "测试品牌");
  assert.equal(image.body.creator.province, "北京市");
  assert.equal(image.body.creator.city, "北京市");
  assert.equal(image.body.creator.district, "朝阳区");
  assert.equal(image.body.creator.logoKey, "");

  const activeTag = database.one("SELECT id FROM tags WHERE status = 'active' AND category = '我的身份' ORDER BY id LIMIT 1");
  assert.ok(activeTag?.id);
  const identitySave = await payload(await profileRoute.POST(jsonRequest(
    "http://localhost/api/web/profile",
    {
      action: "updateTags",
      tagIds: [activeTag.id],
      customTags: [
        { category: "我的身份", label: "其他" },
        { category: "我的身份", label: "纸艺策展" },
      ],
    },
    creatorToken,
  )));
  assert.equal(identitySave.status, 200, JSON.stringify(identitySave.body));
  assert.ok(identitySave.body.creator.tags.some((tag) => tag.category === "我的身份" && tag.label === "纸艺策展"));
  assert.equal(identitySave.body.creator.tags.some((tag) => tag.category === "我的身份" && tag.label === "其他"), false);

  const secondIdentityTag = database.one(
    "SELECT id FROM tags WHERE status = 'active' AND category = '我的身份' AND id != ? ORDER BY id LIMIT 1",
    activeTag.id,
  );
  assert.ok(secondIdentityTag?.id);
  const multiIdentitySave = await payload(await profileRoute.POST(jsonRequest(
    "http://localhost/api/web/profile",
    { action: "updateTags", tagIds: [activeTag.id, secondIdentityTag.id], customTags: [] },
    creatorToken,
  )));
  assert.equal(multiIdentitySave.status, 200, JSON.stringify(multiIdentitySave.body));
  assert.equal(
    multiIdentitySave.body.creator.tags.filter((tag) => tag.category === "我的身份" && tag.status === "active").length,
    2,
  );

  const selectedTag = await payload(await profileRoute.POST(jsonRequest(
    "http://localhost/api/web/profile",
    { action: "addTag", tagId: activeTag.id },
    creatorToken,
  )));
  assert.equal(selectedTag.status, 200, JSON.stringify(selectedTag.body));
  const customTag = await payload(await profileRoute.POST(jsonRequest(
    "http://localhost/api/web/profile",
    { action: "addCustomTag", category: "我的风格", label: "测试新风格" },
    creatorToken,
  )));
  assert.equal(customTag.status, 200, JSON.stringify(customTag.body));

  const submitted = await payload(await profileRoute.POST(jsonRequest(
    "http://localhost/api/web/profile",
    { action: "submitApplication" },
    creatorToken,
  )));
  assert.equal(submitted.status, 200, JSON.stringify(submitted.body));
  const snapshot = database.one("SELECT busy_periods, custom_tags, no_bookings FROM creator_applications WHERE creator_id = ?", creatorId);
  assert.deepEqual(JSON.parse(snapshot.busy_periods), [{ startDate: "2026-09-12", endDate: "2026-09-12", note: "首页已标记不可约" }]);
  assert.deepEqual(JSON.parse(snapshot.custom_tags), [
    { category: "我的身份", label: "纸艺策展" },
    { category: "我的风格", label: "测试新风格" },
  ]);
  assert.equal(snapshot.no_bookings, 0);

  const unifiedTags = await payload(await profileRoute.POST(jsonRequest(
    "http://localhost/api/web/profile",
    {
      action: "updateTags",
      tagIds: [activeTag.id],
      opportunityTypes: ["现场体验"],
      customTags: [{ category: "我的风格", label: "统一保存" }],
    },
    creatorToken,
  )));
  assert.equal(unifiedTags.status, 200, JSON.stringify(unifiedTags.body));
  const savedCreator = database.one("SELECT opportunity_types, opportunity_opt_in FROM creators WHERE id = ?", creatorId);
  assert.deepEqual(JSON.parse(savedCreator.opportunity_types), ["现场体验"]);
  assert.equal(savedCreator.opportunity_opt_in, 1);
  const savedCustomTag = database.one(
    "SELECT t.label, t.category, t.status FROM tags t JOIN creator_tags ct ON ct.tag_id = t.id WHERE ct.creator_id = ? AND t.label = ?",
    creatorId,
    "统一保存",
  );
  assert.deepEqual(savedCustomTag, { label: "统一保存", category: "我的风格", status: "pending" });

  const legacySaveTags = await payload(await profileRoute.POST(jsonRequest(
    "http://localhost/api/web/profile",
    { action: "saveTags", tagIds: [activeTag.id], opportunityTypes: ["现场体验"], customTags: [] },
    creatorToken,
  )));
  assert.equal(legacySaveTags.status, 200, JSON.stringify(legacySaveTags.body));

  const legacyConfirm = await payload(await profileRoute.POST(jsonRequest(
    "http://localhost/api/web/profile",
    { action: "confirmBrand" },
    creatorToken,
  )));
  assert.equal(legacyConfirm.status, 200, JSON.stringify(legacyConfirm.body));

  const unsupported = await payload(await profileRoute.POST(jsonRequest(
    "http://localhost/api/web/profile",
    { action: "action-from-a-newer-page" },
    creatorToken,
  )));
  assert.equal(unsupported.status, 400);
  assert.equal(unsupported.body.code, "UNSUPPORTED_ACTION");
  assert.match(unsupported.body.error, /页面版本与服务不一致/);
});

test("web image upload rejects unauthenticated writes", async () => {
  const form = new FormData();
  form.set("file", new File(["not-an-image"], "test.jpg", { type: "image/jpeg" }));
  const response = await uploadRoute.POST(new Request("http://localhost/api/web/upload", { method: "POST", body: form }));
  assert.equal(response.status, 401);
});

test("web image upload rejects invalid image contents with a useful message", async () => {
  const form = new FormData();
  form.set("file", new File(["not-an-image"], "camera.jpg", { type: "image/jpeg" }));
  const response = await payload(await uploadRoute.POST(new Request("http://localhost/api/web/upload", {
    method: "POST",
    headers: { authorization: `Bearer ${creatorToken}` },
    body: form,
  })));
  assert.equal(response.status, 400);
  assert.match(response.body.error, /图片格式无法识别/);
});

test("public pages expose Chinese legal documents and retire application form", async () => {
  const frontend = path.resolve(import.meta.dirname, "../../frontend");
  const backendPublic = path.resolve(import.meta.dirname, "../public");
  const index = readFileSync(path.join(frontend, "index.html"), "utf8");
  const profile = readFileSync(path.join(frontend, "profile.html"), "utf8");
  const backendProfile = readFileSync(path.join(backendPublic, "profile.html"), "utf8");
  const apply = readFileSync(path.join(frontend, "apply.html"), "utf8");
  const terms = readFileSync(path.join(frontend, "terms.html"), "utf8");
  const privacy = readFileSync(path.join(frontend, "privacy.html"), "utf8");
  assert.doesNotMatch(index, />EN</);
  assert.doesNotMatch(profile, />EN</);
  assert.doesNotMatch(profile, /提交资料审核|id="reviewBar"|id="submitReviewButton"|function renderReviewBar/);
  assert.match(profile, /src="\/index\.html\?embed=schedule"/);
  const configuredHeaders = await nextConfig.headers();
  const scheduleRule = configuredHeaders.find((rule) => rule.source === "/index.html" && rule.has?.some((condition) => condition.type === "query" && condition.key === "embed" && condition.value === "schedule"));
  assert.ok(scheduleRule, "embedded schedule header rule should be scoped to embed=schedule");
  assert.equal(scheduleRule.headers.find((header) => header.key === "X-Frame-Options")?.value, "SAMEORIGIN");
  assert.match(scheduleRule.headers.find((header) => header.key === "Content-Security-Policy")?.value || "", /frame-ancestors 'self'/);
  assert.doesNotMatch(index, /摊位图文/);
  assert.doesNotMatch(index, /我很挑剔，谁不可以约我/);
  assert.match(index, /《用户协议》/);
  assert.match(index, /isLoggedIn=true;\s*\$\('topbarLoginBtn'\)\.style\.display='none';\s*\$\('topbarUser'\)\.style\.display='flex'/);
  assert.match(profile, /accept="image\/\*"/);
  assert.match(profile, /button,input,textarea,select\{[^}]*color:inherit/);
  assert.match(profile, /\.mobile-section>button\{[^}]*font-size:16px/);
  assert.match(profile, /\.mobile-drawer button\{[^}]*font-size:16px/);
  assert.equal(backendProfile, profile, "frontend and backend public profile pages should stay identical");
  assert.doesNotMatch(profile, /裁剪后会立即预览|>保存图片资料<|id="saveImagesButton"/);
  assert.match(profile, /const saved=await saveImages\(\)/);
  assert.match(profile, /async function stageRemoveImage\(key\)[\s\S]*const saved=await saveImages\(\)/);
  assert.match(profile, /function saveImagesSnapshot\(snapshot,generation\)/);
  assert.match(apply, /profile\.html\?section=schedule/);
  assert.match(terms, /用户内容授权/);
  assert.match(privacy, /注册手机号、密码/);
});

test("web account deletion requires confirmation and removes creator data", async () => {
  const deleted = await payload(await accountRoute.POST(jsonRequest(
    "http://localhost/api/web/account",
    { action: "deleteAccount", password: "CreatorPass-881!", confirmPermanentDeletion: true, confirmationText: "永久注销" },
    creatorToken,
  )));
  assert.equal(deleted.status, 200, JSON.stringify(deleted.body));
  assert.equal(deleted.body.success, true);
  assert.equal(database.one("SELECT id FROM creators WHERE id = ?", creatorId), null);
  assert.equal(database.one("SELECT token FROM mini_sessions WHERE token = ?", creatorToken), null);
  assert.equal(database.one("SELECT creator_id FROM creator_tags WHERE creator_id = ?", creatorId), null);
  assert.equal(database.one("SELECT id FROM creator_applications WHERE creator_id = ?", creatorId), null);
  assert.equal(database.one("SELECT id FROM consumer_accounts WHERE openid = ?", `web_18830000881`), null);

  const staleSession = await payload(await profileRoute.GET(new Request("http://localhost/api/web/profile", {
    headers: { authorization: `Bearer ${creatorToken}` },
  })));
  assert.equal(staleSession.status, 401);
});
