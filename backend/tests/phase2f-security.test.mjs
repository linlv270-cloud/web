import assert from "node:assert/strict";
import { after, test } from "node:test";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { tmpdir } from "node:os";

const dataDir = mkdtempSync(path.join(tmpdir(), "tde-phase2f-security-"));
process.env.DATA_DIR = dataDir;
process.env.NODE_ENV = "test";
process.env.QIDENG_BOOTSTRAP_INVITE_CODE = "";

const database = await import("../lib/database.ts");
const eventRoute = await import("../app/api/web/events/[id]/route.ts");
const portrait = await import("../lib/portrait.ts");
const visuals = await import("../lib/portrait-visuals.ts");
const vizAuthRoute = await import("../app/api/viz/auth/route.ts");
const visualization = await import("../lib/visualization.ts");

const creatorId = Number(database.run(
  `INSERT INTO creators(phone, password_hash, password_salt, invite_code, registered_with_code, brand_name)
   VALUES (?, ?, ?, ?, ?, ?)`,
  "18830000996",
  "test-hash",
  "test-salt",
  "PHASE2F",
  "PHASE2F",
  "Phase2F 测试品牌",
).lastInsertRowid);

const draftEventId = Number(database.run(
  `INSERT INTO tde_events(
    reference, title, short_intro, description, cover_key, province, city, district, address,
    start_date, end_date, registration_deadline, category_tags, max_participants, status,
    organizer, created_by_admin_id
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  "EV-PHASE2F-DRAFT",
  "不应公开的草稿",
  "内部草稿",
  "内部说明",
  "events/private-cover.jpg",
  "北京市",
  "北京市",
  "朝阳区",
  "内部地址",
  "2027-01-01",
  "2027-01-02",
  "2026-12-20",
  "[]",
  10,
  "draft",
  "内部运营",
  null,
).lastInsertRowid);

const recruitingEventId = Number(database.run(
  `INSERT INTO tde_events(
    reference, title, short_intro, description, cover_key, province, city, district, address,
    start_date, end_date, registration_deadline, category_tags, max_participants, status,
    organizer, created_by_admin_id
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  "EV-PHASE2F-PUBLIC",
  "可公开活动",
  "公开摘要",
  "公开说明",
  "activities/public-cover.jpg",
  "北京市",
  "北京市",
  "朝阳区",
  "公开地址",
  "2027-02-01",
  "2027-02-02",
  "2027-01-20",
  JSON.stringify(["手作"]),
  10,
  "recruiting",
  "TDE官方",
  null,
).lastInsertRowid);

after(() => {
  database.getDb().close();
  rmSync(dataDir, { recursive: true, force: true });
});

test("public event detail rejects drafts", async () => {
  const response = await eventRoute.GET(
    new Request(`http://localhost/api/web/events/${draftEventId}`),
    { params: Promise.resolve({ id: String(draftEventId) }) },
  );
  assert.equal(response.status, 404);
});

test("public event detail exposes only public fields", async () => {
  const response = await eventRoute.GET(
    new Request(`http://localhost/api/web/events/${recruitingEventId}`),
    { params: Promise.resolve({ id: String(recruitingEventId) }) },
  );
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.event.title, "可公开活动");
  assert.equal(body.event.description, "公开说明");
  assert.equal(body.event.status, "recruiting");
  for (const key of ["created_by_admin_id", "cover_key", "created_at", "updated_at"]) {
    assert.equal(Object.hasOwn(body.event, key), false, `public event leaked ${key}`);
  }
});

test("portrait export filenames do not duplicate the guide prefix", async () => {
  portrait.claimPortrait(creatorId);
  const guideNumber = database.one(
    "SELECT guide_number FROM creator_portraits WHERE creator_id = ?",
    creatorId,
  ).guide_number;
  const output = await visuals.renderPortraitVisual(
    creatorId,
    "https://tde.thedesignexpo.org.cn",
    "share",
  );
  assert.equal(
    output.filename,
    `TDE-${guideNumber.replace(/^TDE-/i, "")}-Phase2F-测试品牌-share.png`,
  );
  assert.doesNotMatch(output.filename, /TDE-TDE-/);
});

test("service worker cache version and app shell are synchronized", () => {
  const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const frontendRoot = path.join(backendRoot, "frontend");
  const frontendDirectory = readFileSync(path.join(
    existsSync(frontendRoot) ? frontendRoot : path.resolve(backendRoot, "../frontend"),
    "service-worker.js",
  ), "utf8");
  const backend = readFileSync(path.join(backendRoot, "public/service-worker.js"), "utf8");
  assert.equal(frontendDirectory, backend);
  assert.match(frontendDirectory, /CACHE_NAME = "tde-shell-v2"/);
  assert.match(frontendDirectory, /"\/welcome\.html"/);
  assert.match(frontendDirectory, /"\/onboarding\.html"/);
});

test("static pages do not mint new numeric creator public links or load remote fonts", () => {
  const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const frontendRoot = path.join(backendRoot, "frontend");
  const frontendDirectory = existsSync(frontendRoot) ? frontendRoot : path.resolve(backendRoot, "../frontend");
  for (const file of [
    path.join(frontendDirectory, "profile.html"),
    path.join(backendRoot, "public/profile.html"),
    path.join(frontendDirectory, "login.html"),
    path.join(backendRoot, "public/login.html"),
    path.join(frontendDirectory, "index.html"),
    path.join(backendRoot, "public/index.html"),
    path.join(frontendDirectory, "curator-invite.html"),
    path.join(backendRoot, "public/curator-invite.html"),
  ]) {
    const source = readFileSync(file, "utf8");
    assert.doesNotMatch(source, /creator\.html\?id=|\/creator\.html\?id=/, `${file} mints numeric creator links`);
    assert.doesNotMatch(source, /miaoda\.feishu\.cn\/fonts|Space Grotesk/, `${file} depends on remote Feishu fonts`);
  }
});

test("visualization sessions use Secure cookies over HTTPS", async () => {
  visualization.createVisualizationUser({
    name: "Phase 2F",
    phone: "18830000995",
    password: "Phase2F-viz-pass",
  });
  const response = await vizAuthRoute.POST(new Request(
    "https://tde.thedesignexpo.org.cn/api/viz/auth",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "login",
        phone: "18830000995",
        password: "Phase2F-viz-pass",
      }),
    },
  ));
  assert.equal(response.status, 200);
  assert.match(response.headers.get("set-cookie") || "", /;\s*Secure(?:;|$)/);
});
