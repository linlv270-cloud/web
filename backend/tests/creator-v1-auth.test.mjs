import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, test } from "node:test";

const dataDir = mkdtempSync(path.join(tmpdir(), "tde-creator-v1-auth-"));
process.env.DATA_DIR = dataDir;
process.env.NODE_ENV = "production";
process.env.QIDENG_BOOTSTRAP_INVITE_CODE = "TDE2026";

const database = await import("../lib/database.ts");
const registerRoute = await import("../app/api/web/auth/register-account/route.ts");
const loginRoute = await import("../app/api/web/auth/login/route.ts");
const profileRoute = await import("../app/api/web/profile/route.ts");

after(() => {
  database.getDb().close();
  rmSync(dataDir, { recursive: true, force: true });
});

function request(url, body, token = "") {
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

async function body(response) {
  return { status: response.status, body: await response.json() };
}

test("creator-v1 rejects an initial password that is not the phone", async () => {
  const result = await body(await registerRoute.POST(request("http://localhost/api/web/auth/register-account", {
    flow: "creator-v1",
    inviteCode: "TDE2026",
    phone: "18830000101",
    password: "not-the-phone",
    agreed: true,
  })));
  assert.equal(result.status, 400);
  assert.match(result.body.error, /初始密码必须与手机号相同/);
});

test("creator-v1 registration creates a session and routes incomplete basics to A1-2", async () => {
  const result = await body(await registerRoute.POST(request("http://localhost/api/web/auth/register-account", {
    flow: "creator-v1",
    inviteCode: "TDE2026",
    phone: "18830000101",
    password: "18830000101",
    agreed: true,
  })));
  assert.equal(result.status, 201, JSON.stringify(result.body));
  assert.ok(result.body.session.token);

  const profile = await body(await profileRoute.GET(new Request("http://localhost/api/web/profile", {
    headers: { authorization: `Bearer ${result.body.session.token}` },
  })));
  assert.equal(profile.status, 200);
  assert.equal(profile.body.creator.onboarding.phase2A.basicsCompleted, false);
  assert.equal(profile.body.creator.province, "");
  assert.equal(profile.body.creator.city, "");

  const brand = await body(await profileRoute.POST(request("http://localhost/api/web/profile", {
    action: "updateProfile",
    brandName: "测试品牌",
  }, result.body.session.token)));
  assert.equal(brand.status, 200, JSON.stringify(brand.body));
  const location = await body(await profileRoute.POST(request("http://localhost/api/web/profile", {
    action: "updateLocation",
    province: "北京市",
    city: "北京市",
    district: "朝阳区",
  }, result.body.session.token)));
  assert.equal(location.status, 200, JSON.stringify(location.body));
  const completeProfile = await body(await profileRoute.GET(new Request("http://localhost/api/web/profile", {
    headers: { authorization: `Bearer ${result.body.session.token}` },
  })));
  assert.equal(completeProfile.body.creator.onboarding.phase2A.basicsCompleted, true);
});

test("creator-v1 login preserves session and profile isolation", async () => {
  const first = await body(await loginRoute.POST(request("http://localhost/api/web/auth/login", {
    phone: "18830000101",
    password: "18830000101",
  })));
  assert.equal(first.status, 200, JSON.stringify(first.body));
  assert.ok(first.body.session.token);

  const second = await body(await registerRoute.POST(request("http://localhost/api/web/auth/register-account", {
    flow: "creator-v1",
    inviteCode: "TDE2026",
    phone: "18830000102",
    password: "18830000102",
    agreed: true,
  })));
  assert.equal(second.status, 201);

  const firstProfile = await body(await profileRoute.GET(new Request("http://localhost/api/web/profile", {
    headers: { authorization: `Bearer ${first.body.session.token}` },
  })));
  const secondProfile = await body(await profileRoute.GET(new Request("http://localhost/api/web/profile", {
    headers: { authorization: `Bearer ${second.body.session.token}` },
  })));
  assert.notEqual(firstProfile.body.creator.id, secondProfile.body.creator.id);
  assert.equal(firstProfile.body.creator.phone, "18830000101");
  assert.equal(secondProfile.body.creator.phone, "18830000102");
});
