import assert from "node:assert/strict";
import { after, test } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";

const dataDir = mkdtempSync(path.join(tmpdir(), "tde-phase2f-boundary-"));
process.env.DATA_DIR = dataDir;
process.env.NODE_ENV = "production";

const database = await import("../lib/database.ts");
const storage = await import("../lib/storage.ts");
const miniAuth = await import("../lib/mini-auth.ts");
const portrait = await import("../lib/portrait.ts");
const profileRoute = await import("../app/api/web/profile/route.ts");
const discoveryRoute = await import("../app/api/web/discovery/route.ts");
const portraitRoute = await import("../app/api/web/portrait/route.ts");
const publicPortraitRoute = await import("../app/api/public/creator/route.ts");
const assetRoute = await import("../app/api/assets/[...key]/route.ts");
const uploadRoute = await import("../app/api/web/upload/route.ts");
const logoutRoute = await import("../app/api/web/auth/logout/route.ts");

const creatorA = Number(database.run(
  `INSERT INTO creators(phone, password_hash, password_salt, invite_code, registered_with_code, brand_name, province, city, district)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  "18830000101", "hash-a", "salt-a", "BOUNDARYA", "BOUNDARYA", "A品牌", "北京市", "北京市", "朝阳区",
).lastInsertRowid);
const creatorB = Number(database.run(
  `INSERT INTO creators(phone, password_hash, password_salt, invite_code, registered_with_code, brand_name, province, city, district)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  "18830000102", "hash-b", "salt-b", "BOUNDARYB", "BOUNDARYB", "B品牌", "上海市", "上海市", "浦东新区",
).lastInsertRowid);

const tokenA = miniAuth.createMiniSession("creator", creatorA).token;
const tokenB = miniAuth.createMiniSession("creator", creatorB).token;

after(() => {
  database.getDb().close();
  rmSync(dataDir, { recursive: true, force: true });
});

function request(url, token, body) {
  return new Request(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
}

async function json(response) {
  return { status: response.status, body: await response.json() };
}

test("creator A cannot read or modify creator B private state", async () => {
  const bKey = `web-creators/${creatorB}/private.jpg`;
  await storage.putObject(bKey, Buffer.from("private-b"));
  database.run(
    "INSERT INTO busy_periods(creator_id, start_date, end_date, note, source) VALUES (?, ?, ?, ?, 'manual')",
    creatorB, "2027-01-01", "2027-01-02", "B-only",
  );

  const bProfileBefore = await json(await profileRoute.GET(new Request(
    "http://localhost/api/web/profile",
    { headers: { authorization: `Bearer ${tokenB}` } },
  )));
  assert.equal(bProfileBefore.status, 200);
  assert.equal(bProfileBefore.body.creator.id, creatorB);

  const aProfile = await json(await profileRoute.GET(new Request(
    "http://localhost/api/web/profile",
    { headers: { authorization: `Bearer ${tokenA}` } },
  )));
  assert.equal(aProfile.status, 200);
  assert.equal(aProfile.body.creator.id, creatorA);
  assert.doesNotMatch(JSON.stringify(aProfile.body), /B品牌|浦东新区|B-only/);

  const aDiscovery = await json(await discoveryRoute.GET(new Request(
    "http://localhost/api/web/discovery",
    { headers: { authorization: `Bearer ${tokenA}` } },
  )));
  assert.equal(aDiscovery.status, 200);
  assert.equal(aDiscovery.body.session.creatorId, creatorA);

  const aPortrait = await json(await portraitRoute.GET(new Request(
    "http://localhost/api/web/portrait",
    { headers: { authorization: `Bearer ${tokenA}` } },
  )));
  assert.equal(aPortrait.status, 200);
  assert.equal(aPortrait.body.preview.brandName, "A品牌");

  const privateReadByA = await assetRoute.GET(
    new Request(`http://localhost${storage.assetUrl(bKey)}`, {
      headers: { authorization: `Bearer ${tokenA}` },
    }),
    { params: Promise.resolve({ key: bKey.split("/") }) },
  );
  assert.equal(privateReadByA.status, 404);

  const modifiedBImage = await json(await profileRoute.POST(request(
    "http://localhost/api/web/profile",
    tokenA,
    { action: "updateImages", representativeImageKey: bKey },
  )));
  assert.equal(modifiedBImage.status, 400);

  const modifiedBSchedule = await json(await profileRoute.POST(request(
    "http://localhost/api/web/profile",
    tokenA,
    { action: "updateSchedule", noBookings: false, busyPeriods: [{ startDate: "2028-01-01", endDate: "2028-01-01", note: "A-only" }] },
  )));
  assert.equal(modifiedBSchedule.status, 200);
  assert.equal(database.one("SELECT note FROM busy_periods WHERE creator_id = ? ORDER BY id DESC LIMIT 1", creatorB).note, "B-only");

  const modifiedBCooperation = await json(await profileRoute.POST(request(
    "http://localhost/api/web/profile",
    tokenA,
    {
      action: "updateCooperationPreferences",
      supply: { O: [], X: [] },
      supplyFacts: { O: [], X: [] },
      adaptationPreferences: ["具体项目再聊"],
      opportunityInterests: ["展览"],
    },
  )));
  assert.equal(modifiedBCooperation.status, 200);
  assert.equal(database.one("SELECT id FROM creator_cooperation_preferences WHERE creator_id = ?", creatorB), null);
});

test("upload rejects dangerous inputs, normalizes accepted images, and requires login", async () => {
  const png = await sharp({
    create: { width: 12, height: 12, channels: 4, background: { r: 20, g: 80, b: 140, alpha: 1 } },
  }).png().toBuffer();

  const upload = (file, token = tokenA) => {
    const form = new FormData();
    if (file) form.set("file", file);
    return uploadRoute.POST(new Request("http://localhost/api/web/upload", {
      method: "POST",
      ...(token ? { headers: { authorization: `Bearer ${token}` } } : {}),
      body: form,
    }));
  };

  assert.equal((await upload(new File([Buffer.alloc(20 * 1024 * 1024 + 1)], "large.jpg", { type: "image/jpeg" }))).status, 400);
  assert.equal((await upload(new File(["hello"], "note.txt", { type: "text/plain" }))).status, 400);
  assert.equal((await upload(new File(["<script>alert(1)</script>"], "x.html", { type: "text/html" }))).status, 400);
  assert.equal((await upload(new File(["alert(1)"], "x.js", { type: "application/javascript" }))).status, 400);
  assert.equal((await upload(new File(["not-an-image"], "x.jpg", { type: "image/jpeg" }))).status, 400);

  for (const name of ["double.jpg.html", "../../escape.png", "<script>.png"]) {
    const response = await json(await upload(new File([png], name, { type: "image/png" })));
    assert.equal(response.status, 200, name);
    assert.match(response.body.key, new RegExp(`^web-creators/${creatorA}/[0-9a-f-]+\\.jpg$`));
    assert.equal(response.body.url.includes(name), false);
  }

  const sameNameA = await json(await upload(new File([png], "same.jpg", { type: "image/png" })));
  const sameNameB = await json(await upload(new File([png], "same.jpg", { type: "image/png" })));
  assert.equal(sameNameA.status, 200);
  assert.equal(sameNameB.status, 200);
  assert.notEqual(sameNameA.body.key, sameNameB.body.key);

  const unauthenticated = await json(await upload(new File([png], "anonymous.png", { type: "image/png" }), ""));
  assert.equal(unauthenticated.status, 401);
});

test("creator logout invalidates the bearer session", async () => {
  const before = await profileRoute.GET(new Request("http://localhost/api/web/profile", {
    headers: { authorization: `Bearer ${tokenA}` },
  }));
  assert.equal(before.status, 200);

  const logout = await json(await logoutRoute.POST(new Request("http://localhost/api/web/auth/logout", {
    method: "POST",
    headers: { authorization: `Bearer ${tokenA}` },
  })));
  assert.equal(logout.status, 200);
  assert.equal(database.one("SELECT token FROM mini_sessions WHERE token = ?", tokenA), null);

  const afterLogout = await profileRoute.GET(new Request("http://localhost/api/web/profile", {
    headers: { authorization: `Bearer ${tokenA}` },
  }));
  assert.equal(afterLogout.status, 401);
});

test("numeric creator references enumerate only claimed public presentations", async () => {
  portrait.claimPortrait(creatorA);
  portrait.claimPortrait(creatorB);

  const response = await json(await publicPortraitRoute.GET(new Request(
    `http://localhost/api/public/creator?id=${creatorB}`,
  )));
  assert.equal(response.status, 200);
  assert.equal(response.body.portrait.brandName, "B品牌");
  for (const sensitive of ["18830000102", "password_hash", "busy_periods", "浦东新区"]) {
    assert.equal(JSON.stringify(response.body).includes(sensitive), false, sensitive);
  }
});

test("near-simultaneous creator saves remain isolated", async () => {
  const concurrentTokenA = miniAuth.createMiniSession("creator", creatorA).token;
  const requests = [
    profileRoute.POST(request("http://localhost/api/web/profile", concurrentTokenA, {
      action: "updateSchedule", noBookings: false,
      busyPeriods: [{ startDate: "2029-01-01", endDate: "2029-01-01", note: "A-concurrent" }],
    })),
    profileRoute.POST(request("http://localhost/api/web/profile", tokenB, {
      action: "updateSchedule", noBookings: false,
      busyPeriods: [{ startDate: "2029-02-01", endDate: "2029-02-01", note: "B-concurrent" }],
    })),
    profileRoute.POST(request("http://localhost/api/web/profile", concurrentTokenA, {
      action: "updateCooperationPreferences", supply: { O: [], X: [] }, supplyFacts: { O: [], X: [] },
      adaptationPreferences: ["具体项目再聊"], opportunityInterests: ["展览"],
    })),
    profileRoute.POST(request("http://localhost/api/web/profile", tokenB, {
      action: "updateCooperationPreferences", supply: { O: [], X: [] }, supplyFacts: { O: [], X: [] },
      adaptationPreferences: ["具体项目再聊"], opportunityInterests: ["联名"],
    })),
  ];
  const responses = await Promise.all(requests);
  assert.deepEqual(responses.map((response) => response.status), [200, 200, 200, 200]);
  assert.equal(database.one("SELECT note FROM busy_periods WHERE creator_id = ? ORDER BY id DESC LIMIT 1", creatorA).note, "A-concurrent");
  assert.equal(database.one("SELECT note FROM busy_periods WHERE creator_id = ? ORDER BY id DESC LIMIT 1", creatorB).note, "B-concurrent");
  assert.equal(JSON.parse(database.one("SELECT opportunity_interests FROM creator_cooperation_preferences WHERE creator_id = ?", creatorA).opportunity_interests)[0], "展览");
  assert.equal(JSON.parse(database.one("SELECT opportunity_interests FROM creator_cooperation_preferences WHERE creator_id = ?", creatorB).opportunity_interests)[0], "联名");
});
