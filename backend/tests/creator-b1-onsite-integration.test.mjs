import assert from "node:assert/strict";
import { after, test } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";

const dataDir = mkdtempSync(path.join(tmpdir(), "tde-b1-onsite-integration-"));
process.env.DATA_DIR = dataDir;
process.env.NODE_ENV = "test";
process.env.QIDENG_BOOTSTRAP_INVITE_CODE = "B1TEST26";

const database = await import("../lib/database.ts");
const registerRoute = await import("../app/api/web/auth/register-account/route.ts");
const uploadRoute = await import("../app/api/web/upload/route.ts");
const onsiteRoute = await import("../app/api/web/onsite/route.ts");

after(() => {
  database.getDb().close();
  rmSync(dataDir, { recursive: true, force: true });
});

function jsonRequest(url, body, token = "") {
  return new Request(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": `127.0.2.${Math.floor(Math.random() * 200) + 1}`,
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

async function payload(response) {
  return { status: response.status, body: await response.json() };
}

async function register(phone) {
  const result = await payload(await registerRoute.POST(jsonRequest(
    "http://localhost/api/web/auth/register-account",
    {
      flow: "creator-v1",
      inviteCode: "B1TEST26",
      phone,
      password: phone,
      agreed: true,
    },
  )));
  assert.equal(result.status, 201, JSON.stringify(result.body));
  return result.body.session.token;
}

async function uploadPng(token) {
  const image = await sharp({
    create: { width: 48, height: 48, channels: 4, background: { r: 240, g: 240, b: 240, alpha: 1 } },
  }).png().toBuffer();
  const form = new FormData();
  form.set("file", new File([image], "b1-experience.png", { type: "image/png" }));
  const result = await payload(await uploadRoute.POST(new Request(
    "http://localhost/api/web/upload",
    { method: "POST", headers: { authorization: `Bearer ${token}` }, body: form },
  )));
  assert.equal(result.status, 200, JSON.stringify(result.body));
  return result.body.key;
}

test("B1 experience writes a separate record and preserves legacy projects exactly", async () => {
  const tokenA = await register("18830000901");
  const tokenB = await register("18830000902");
  const creatorA = database.one("SELECT id FROM creators WHERE phone = ?", "18830000901");
  const creatorB = database.one("SELECT id FROM creators WHERE phone = ?", "18830000902");
  assert.ok(creatorA?.id);
  assert.ok(creatorB?.id);

  const legacyDraft = JSON.stringify({
    version: 1,
    projectName: "历史项目",
    mainType: "作品展示",
    fields: { show: "历史作品" },
    choices: { special: "来源" },
    rawText: { show: "历史作品" },
  });
  const inserted = database.run(
    `INSERT INTO workshop_projects(reference, creator_id, title, operation_draft, status, sort_order)
     VALUES (?, ?, ?, ?, 'draft', 2)`,
    "LEGACY-B1-PROJECT-A",
    creatorA.id,
    "历史项目",
    legacyDraft,
  );
  const legacyBefore = database.one(
    "SELECT id, reference, creator_id, title, operation_draft, status, sort_order FROM workshop_projects WHERE id = ?",
    Number(inserted.lastInsertRowid),
  );
  const imageKey = await uploadPng(tokenA);

  const saved = await payload(await onsiteRoute.POST(jsonRequest(
    "http://localhost/api/web/onsite",
    {
      action: "saveExperience",
      contentLabel: "产品展售",
      fields: {
        bring: "一组手工器物",
        difference: "每件都有不同的手工痕迹",
        recommend: "最适合日常使用的一件",
      },
      choices: { special: "材料" },
      rawText: { special: "材料" },
      media: [{ role: "creation", key: imageKey }],
    },
    tokenA,
  )));
  assert.equal(saved.status, 200, JSON.stringify(saved.body));

  const legacyAfter = database.one(
    "SELECT id, reference, creator_id, title, operation_draft, status, sort_order FROM workshop_projects WHERE id = ?",
    Number(inserted.lastInsertRowid),
  );
  assert.deepEqual(legacyAfter, legacyBefore);

  const experienceRows = database.all(
    "SELECT id, reference, creator_id, title, operation_draft FROM workshop_projects WHERE creator_id = ? AND reference LIKE 'B1-EXPERIENCE-%'",
    creatorA.id,
  );
  assert.equal(experienceRows.length, 1);
  assert.notEqual(experienceRows[0].id, legacyBefore.id);
  assert.match(experienceRows[0].reference, /^B1-EXPERIENCE-/);
  assert.match(experienceRows[0].operation_draft, /"contentLabel":"产品展售"/);

  const creatorAView = await payload(await onsiteRoute.GET(new Request(
    "http://localhost/api/web/onsite",
    { headers: { authorization: `Bearer ${tokenA}` } },
  )));
  assert.equal(creatorAView.status, 200);
  assert.equal(creatorAView.body.experience.contentLabel, "产品展售");
  assert.equal(creatorAView.body.projects.some((project) => project.name === "历史项目"), true);

  const creatorBView = await payload(await onsiteRoute.GET(new Request(
    "http://localhost/api/web/onsite",
    { headers: { authorization: `Bearer ${tokenB}` } },
  )));
  assert.equal(creatorBView.status, 200);
  assert.equal(creatorBView.body.experience, null);
  assert.equal(creatorBView.body.projects.some((project) => project.name === "历史项目"), false);

  const crossCreatorSave = await payload(await onsiteRoute.POST(jsonRequest(
    "http://localhost/api/web/onsite",
    {
      action: "saveExperience",
      contentLabel: "产品展售",
      fields: {
        bring: "不应保存",
        difference: "不应保存",
        recommend: "不应保存",
      },
      choices: { special: "材料" },
      media: [{ role: "creation", key: imageKey }],
    },
    tokenB,
  )));
  assert.equal(crossCreatorSave.status, 400);
  assert.match(crossCreatorSave.body.error, /其他账号上传的图片/);

  const duplicateRole = await payload(await onsiteRoute.POST(jsonRequest(
    "http://localhost/api/web/onsite",
    {
      action: "saveExperience",
      contentLabel: "产品展售",
      fields: {
        bring: "不应保存",
        difference: "不应保存",
        recommend: "不应保存",
      },
      choices: { special: "材料" },
      media: [
        { role: "creation", key: imageKey },
        { role: "creation", key: imageKey },
      ],
    },
    tokenA,
  )));
  assert.equal(duplicateRole.status, 400);
  assert.match(duplicateRole.body.error, /每种体验图片用途只能上传一张/);

  const tooManyImages = await payload(await onsiteRoute.POST(jsonRequest(
    "http://localhost/api/web/onsite",
    {
      action: "saveExperience",
      contentLabel: "产品展售",
      fields: {
        bring: "不应保存",
        difference: "不应保存",
        recommend: "不应保存",
      },
      choices: { special: "材料" },
      media: [
        { role: "creation", key: imageKey },
        { role: "scene", key: imageKey },
        { role: "detail", key: imageKey },
        { role: "creation", key: imageKey },
      ],
    },
    tokenA,
  )));
  assert.equal(tooManyImages.status, 400);
  assert.match(tooManyImages.body.error, /最多上传三张/);
});
