import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { after, test } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";

const dataDir = mkdtempSync(path.join(tmpdir(), "tde-phase2e-visuals-"));
process.env.DATA_DIR = dataDir;
process.env.NODE_ENV = "test";

const database = await import("../lib/database.ts");
const storage = await import("../lib/storage.ts");
const registerRoute = await import("../app/api/web/auth/register-account/route.ts");
const profileRoute = await import("../app/api/web/profile/route.ts");
const portraitRoute = await import("../app/api/web/portrait/route.ts");
const exportRoute = await import("../app/api/web/portrait/export/route.ts");
const portrait = await import("../lib/portrait.ts");

after(() => {
  database.getDb().close();
  rmSync(dataDir, { recursive: true, force: true });
});

async function json(response) {
  return { status: response.status, body: await response.json() };
}

function request(url, body, token) {
  return new Request(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
}

function authRequest(url, token) {
  return new Request(url, {
    headers: { authorization: `Bearer ${token}` },
  });
}

test("phase2e visual exports use claimed presentation only", async () => {
  const registered = await json(await registerRoute.POST(new Request(
    "http://localhost/api/web/auth/register-account",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        flow: "phase2a",
        phone: "18830000993",
        confirmPhone: "18830000993",
        password: "Phase2E-pass-993!",
        confirmPassword: "Phase2E-pass-993!",
        agreed: true,
      }),
    },
  )));
  assert.equal(registered.status, 201, JSON.stringify(registered.body));
  const token = registered.body.session.token;
  const creatorId = registered.body.creator.id;
  const imageKey = `web-creators/${creatorId}/logo.png`;
  await storage.putObject(
    imageKey,
    await sharp({
      create: {
        width: 1200,
        height: 900,
        channels: 3,
        background: "#FFE600",
      },
    }).png().toBuffer(),
  );
  await json(await profileRoute.POST(request(
    "http://localhost/api/web/profile",
    { action: "updateProfile", brandName: "视觉输出测试品牌", slogan: "把真实带到现场", intro: "只用于 Phase 2E 隔离验证。" },
    token,
  )));
  await json(await profileRoute.POST(request(
    "http://localhost/api/web/profile",
    { action: "updateImages", logoImageKey: imageKey },
    token,
  )));

  const termId = database.one(
    "SELECT id FROM taxonomy_terms WHERE namespace = 'R' AND term_key = 'R01' AND version = 'v1'",
  )?.id;
  assert.ok(termId, "R01 taxonomy term should be initialized");
  database.run(
    `INSERT INTO creator_taxonomy_terms(creator_id, taxonomy_term_id, source)
     VALUES (?, ?, 'discovery')`,
    creatorId,
    termId,
  );
  const draft = await json(await portraitRoute.GET(authRequest(
    "http://localhost/api/web/portrait",
    token,
  )));
  assert.equal(draft.status, 200, JSON.stringify(draft.body));
  assert.equal(draft.body.portrait.status, "draft");
  const draftExport = await json(await exportRoute.GET(authRequest(
    "http://localhost/api/web/portrait/export?format=share",
    token,
  )));
  assert.equal(draftExport.status, 400);

  const claimed = await json(await portraitRoute.POST(request(
    "http://localhost/api/web/portrait",
    { action: "claim" },
    token,
  )));
  assert.equal(claimed.status, 200, JSON.stringify(claimed.body));
  assert.equal(claimed.body.portrait.status, "claimed");
  const publicId = claimed.body.portrait.publicUrl.split("portrait=")[1];
  assert.ok(publicId);

  const presentation = portrait.getClaimedPortraitPresentation(creatorId);
  assert.equal(presentation.brandName, "视觉输出测试品牌");
  assert.equal(presentation.heroMediaKey, imageKey);
  assert.match(presentation.publicUrl, /^\/creator\.html\?portrait=p-/);
  assert.equal(JSON.stringify(presentation).includes("18830000993"), false);
  assert.equal(JSON.stringify(presentation).includes("taxonomy_term_id"), false);

  const share = await exportRoute.GET(authRequest(
    "https://tde.thedesignexpo.org.cn/api/web/portrait/export?format=share",
    token,
  ));
  assert.equal(share.status, 200);
  assert.equal(share.headers.get("content-type"), "image/png");
  const shareBody = Buffer.from(await share.arrayBuffer());
  const shareMeta = await sharp(shareBody).metadata();
  assert.equal(shareMeta.width, 1080);
  assert.equal(shareMeta.height, 1350);
  assert.match(share.headers.get("content-disposition"), /share\.png/);

  for (const [format, width, height] of [["a3", 3508, 4961], ["a4", 2480, 3508]]) {
    const response = await exportRoute.GET(authRequest(
      `https://tde.thedesignexpo.org.cn/api/web/portrait/export?format=${format}`,
      token,
    ));
    assert.equal(response.status, 200, format);
    assert.equal(response.headers.get("content-type"), "application/pdf");
    const body = Buffer.from(await response.arrayBuffer());
    assert.equal(body.subarray(0, 8).toString("latin1"), "%PDF-1.4");
    assert.match(body.toString("latin1"), new RegExp(`/Width ${width} /Height ${height}`));
    assert.match(response.headers.get("content-disposition"), new RegExp(`${format.toUpperCase()}\\.pdf`));
  }

  const before = createHash("sha256").update(shareBody).digest("hex");
  const update = await json(await portraitRoute.POST(request(
    "http://localhost/api/web/portrait",
    {
      action: "save",
      displayTitleOverride: "",
      representativeLineOverride: "",
      heroMediaKey: imageKey,
      galleryMediaKeys: [],
      visibility: { hiddenTagKeys: ["R:R01"] },
    },
    token,
  )));
  assert.equal(update.status, 200, JSON.stringify(update.body));
  assert.deepEqual(update.body.editable.galleryMediaKeys, []);
  assert.deepEqual(update.body.editable.visibility.hiddenTagKeys, ["R:R01"]);
  const afterResponse = await exportRoute.GET(authRequest(
    "https://tde.thedesignexpo.org.cn/api/web/portrait/export?format=share",
    token,
  ));
  const after = createHash("sha256").update(Buffer.from(await afterResponse.arrayBuffer())).digest("hex");
  assert.notEqual(after, before);
  assert.deepEqual(portrait.getClaimedPortraitPresentation(creatorId).galleryMediaKeys, []);
  assert.deepEqual(portrait.getClaimedPortraitPresentation(creatorId).tags, []);
});
