import assert from "node:assert/strict";
import { after, test } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const dataDir = mkdtempSync(path.join(tmpdir(), "tde-creator-c-signals-"));
process.env.DATA_DIR = dataDir;
process.env.NODE_ENV = "test";

const database = await import("../lib/database.ts");
const registerRoute = await import("../app/api/web/auth/register-account/route.ts");
const profileRoute = await import("../app/api/web/profile/route.ts");

after(() => {
  database.getDb().close();
  rmSync(dataDir, { recursive: true, force: true });
});

async function json(response) {
  return { status: response.status, body: await response.json() };
}

function post(body, token) {
  return new Request("http://localhost/api/web/profile", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
}

async function register(phone) {
  const result = await json(await registerRoute.POST(new Request(
    "http://localhost/api/web/auth/register-account",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        flow: "phase2a",
        phone,
        confirmPhone: phone,
        password: "Creator-C-pass!",
        confirmPassword: "Creator-C-pass!",
        agreed: true,
      }),
    },
  )));
  assert.equal(result.status, 201, JSON.stringify(result.body));
  return result.body.session.token;
}

test("C profile signals save, restore, isolate, and preserve legacy cooperation data", async () => {
  const tokenA = await register("18830000941");
  const tokenB = await register("18830000942");

  const legacySaved = await json(await profileRoute.POST(post({
    action: "updateCooperationPreferences",
    supply: { O: ["O02"], X: ["X07"] },
    supplyFacts: { O: ["保留的供给事实"], X: ["保留的体验事实"] },
    adaptationPreferences: ["可以做活动限定"],
    opportunityInterests: ["工作坊"],
  }, tokenA)));
  assert.equal(legacySaved.status, 200, JSON.stringify(legacySaved.body));

  const savedA = await json(await profileRoute.POST(post({
    action: "updateProfileSignals",
    work: ["陶瓷", "香薰"],
    style: ["自然", "当代"],
    styleCustom: ["手工感"],
    audience: ["喜欢新鲜事物", "大众皆宜"],
    audienceCustom: ["收藏小组"],
    inviteTypes: ["展览", "都可以先聊聊"],
  }, tokenA)));
  assert.equal(savedA.status, 200, JSON.stringify(savedA.body));
  assert.deepEqual(savedA.body.profileSignals, {
    work: ["陶瓷", "香薰"],
    style: ["自然", "当代", "手工感"],
    audience: ["喜欢新鲜事物", "大众皆宜", "收藏小组"],
    inviteTypes: ["展览", "都可以先聊聊"],
  });

  const restoredA = await json(await profileRoute.GET(new Request(
    "http://localhost/api/web/profile",
    { headers: { authorization: `Bearer ${tokenA}` } },
  )));
  assert.equal(restoredA.status, 200, JSON.stringify(restoredA.body));
  assert.deepEqual(
    {
      work: [...restoredA.body.profileSignals.work].sort(),
      style: [...restoredA.body.profileSignals.style].sort(),
      audience: [...restoredA.body.profileSignals.audience].sort(),
      inviteTypes: [...restoredA.body.profileSignals.inviteTypes].sort(),
    },
    {
      work: [...savedA.body.profileSignals.work].sort(),
      style: [...savedA.body.profileSignals.style].sort(),
      audience: [...savedA.body.profileSignals.audience].sort(),
      inviteTypes: [...savedA.body.profileSignals.inviteTypes].sort(),
    },
  );
  assert.deepEqual(
    restoredA.body.cooperationPreferences.supply.O.map((item) => item.termKey),
    ["O02"],
  );
  assert.deepEqual(
    restoredA.body.cooperationPreferences.supply.X.map((item) => item.termKey),
    ["X07"],
  );
  assert.deepEqual(restoredA.body.cooperationPreferences.adaptationPreferences, ["可以做活动限定"]);
  assert.deepEqual(
    restoredA.body.cooperationPreferences.supplyFacts.O.map((item) => item.originalText),
    ["保留的供给事实"],
  );
  assert.deepEqual(
    restoredA.body.cooperationPreferences.supplyFacts.X.map((item) => item.originalText),
    ["保留的体验事实"],
  );

  const savedB = await json(await profileRoute.POST(post({
    action: "updateProfileSignals",
    work: ["木作"],
    style: ["东方"],
    audience: ["亲子家庭"],
    inviteTypes: ["工作坊"],
  }, tokenB)));
  assert.equal(savedB.status, 200, JSON.stringify(savedB.body));

  const restoredAAfterB = await json(await profileRoute.GET(new Request(
    "http://localhost/api/web/profile",
    { headers: { authorization: `Bearer ${tokenA}` } },
  )));
  assert.deepEqual(
    {
      work: [...restoredAAfterB.body.profileSignals.work].sort(),
      style: [...restoredAAfterB.body.profileSignals.style].sort(),
      audience: [...restoredAAfterB.body.profileSignals.audience].sort(),
      inviteTypes: [...restoredAAfterB.body.profileSignals.inviteTypes].sort(),
    },
    {
      work: [...savedA.body.profileSignals.work].sort(),
      style: [...savedA.body.profileSignals.style].sort(),
      audience: [...savedA.body.profileSignals.audience].sort(),
      inviteTypes: [...savedA.body.profileSignals.inviteTypes].sort(),
    },
  );
});
