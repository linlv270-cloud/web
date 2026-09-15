import assert from "node:assert/strict";
import { after, test } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";

const dataDir = mkdtempSync(path.join(tmpdir(), "tde-phase2a-onboarding-"));
process.env.DATA_DIR = dataDir;
process.env.NODE_ENV = "test";

const database = await import("../lib/database.ts");
const registerRoute = await import("../app/api/web/auth/register-account/route.ts");
const profileRoute = await import("../app/api/web/profile/route.ts");
const uploadRoute = await import("../app/api/web/upload/route.ts");

let creatorId = 0;
let creatorToken = "";

after(() => {
  database.getDb().close();
  rmSync(dataDir, { recursive: true, force: true });
});

function jsonRequest(url, body, token = "") {
  return new Request(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": `127.0.1.${Math.floor(Math.random() * 200) + 1}`,
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

async function payload(response) {
  return { status: response.status, body: await response.json() };
}

test("phase2a registration uses the existing account system without invite or location", async () => {
  const mismatch = await payload(await registerRoute.POST(jsonRequest(
    "http://localhost/api/web/auth/register-account",
    {
      flow: "phase2a",
      phone: "18830000771",
      confirmPhone: "18830000772",
      password: "Phase2A-pass-771!",
      confirmPassword: "Phase2A-pass-771!",
      agreed: true,
    },
  )));
  assert.equal(mismatch.status, 400);
  assert.match(mismatch.body.error, /手机号不一致/);

  const registered = await payload(await registerRoute.POST(jsonRequest(
    "http://localhost/api/web/auth/register-account",
    {
      flow: "phase2a",
      phone: "18830000771",
      confirmPhone: "18830000771",
      password: "Phase2A-pass-771!",
      confirmPassword: "Phase2A-pass-771!",
      agreed: true,
    },
  )));
  assert.equal(registered.status, 201, JSON.stringify(registered.body));
  creatorId = registered.body.creator.id;
  creatorToken = registered.body.session.token;

  const row = database.one(
    "SELECT registered_with_code, province, city, district, schedule_confirmed_at FROM creators WHERE id = ?",
    creatorId,
  );
  assert.deepEqual(row, {
    registered_with_code: "",
    province: "",
    city: "",
    district: "",
    schedule_confirmed_at: null,
  });
  const section = database.one(
    "SELECT section FROM creator_section_updates WHERE creator_id = ? AND section = 'phase2a.account'",
    creatorId,
  );
  assert.ok(section);
});

test("phase2a progress advances through basics and required images", async () => {
  let profile = await payload(await profileRoute.GET(new Request("http://localhost/api/web/profile", {
    headers: { authorization: `Bearer ${creatorToken}` },
  })));
  assert.equal(profile.body.creator.onboarding.phase2A.basicsCompleted, false);
  assert.equal(profile.body.creator.onboarding.phase2A.imagesCompleted, false);
  assert.equal(profile.body.creator.onboarding.phase2A.scheduleConfirmed, false);

  const basics = await payload(await profileRoute.POST(jsonRequest(
    "http://localhost/api/web/profile",
    { action: "updateProfile", brandName: "Phase 2A 测试品牌" },
    creatorToken,
  )));
  assert.equal(basics.status, 200, JSON.stringify(basics.body));

  const location = await payload(await profileRoute.POST(jsonRequest(
    "http://localhost/api/web/profile",
    { action: "updateLocation", province: "北京市", city: "北京市", district: "朝阳区" },
    creatorToken,
  )));
  assert.equal(location.status, 200, JSON.stringify(location.body));

  const image = await sharp({
    create: { width: 32, height: 24, channels: 4, background: { r: 255, g: 230, b: 0, alpha: 1 } },
  }).png().toBuffer();
  const upload = async (name) => {
    const form = new FormData();
    form.set("file", new File([image], name, { type: "image/png" }));
    return payload(await uploadRoute.POST(new Request("http://localhost/api/web/upload", {
      method: "POST",
      headers: { authorization: `Bearer ${creatorToken}` },
      body: form,
    })));
  };
  const logo = await upload("phase2a-logo.png");
  const booth = await upload("phase2a-booth.png");
  assert.equal(logo.status, 200, JSON.stringify(logo.body));
  assert.equal(booth.status, 200, JSON.stringify(booth.body));

  const images = await payload(await profileRoute.POST(jsonRequest(
    "http://localhost/api/web/profile",
    { action: "updateImages", logoImageKey: logo.body.key, boothImageKey: booth.body.key },
    creatorToken,
  )));
  assert.equal(images.status, 200, JSON.stringify(images.body));

  profile = await payload(await profileRoute.GET(new Request("http://localhost/api/web/profile", {
    headers: { authorization: `Bearer ${creatorToken}` },
  })));
  assert.equal(profile.body.creator.onboarding.phase2A.basicsCompleted, true);
  assert.equal(profile.body.creator.onboarding.phase2A.imagesCompleted, true);
  assert.equal(profile.body.creator.onboarding.phase2A.scheduleConfirmed, false);
});

test("phase2a schedule confirmation preserves platform sources and supports no-bookings", async () => {
  database.run(
    `INSERT INTO busy_periods(creator_id, start_date, end_date, note, source, source_id)
     VALUES (?, ?, ?, ?, 'event', ?)`,
    creatorId,
    "2027-02-01",
    "2027-02-02",
    "平台活动",
    902,
  );

  const saved = await payload(await profileRoute.POST(jsonRequest(
    "http://localhost/api/web/profile",
    {
      action: "updateSchedule",
      busyPeriods: [{ startDate: "2027-03-01", endDate: "2027-03-03" }],
      noBookings: false,
    },
    creatorToken,
  )));
  assert.equal(saved.status, 200, JSON.stringify(saved.body));
  assert.deepEqual(
    database.all(
      "SELECT start_date, end_date, source, source_id FROM busy_periods WHERE creator_id = ? ORDER BY start_date",
      creatorId,
    ),
    [
      { start_date: "2027-02-01", end_date: "2027-02-02", source: "event", source_id: 902 },
      { start_date: "2027-03-01", end_date: "2027-03-03", source: "manual", source_id: null },
    ],
  );

  const confirmed = database.one(
    "SELECT no_bookings, schedule_confirmed_at FROM creators WHERE id = ?",
    creatorId,
  );
  assert.equal(confirmed.no_bookings, 0);
  assert.ok(confirmed.schedule_confirmed_at);

  const noBookings = await payload(await profileRoute.POST(jsonRequest(
    "http://localhost/api/web/profile",
    { action: "updateSchedule", busyPeriods: [], noBookings: true },
    creatorToken,
  )));
  assert.equal(noBookings.status, 200, JSON.stringify(noBookings.body));
  assert.deepEqual(
    database.all(
      "SELECT start_date, end_date, source, source_id FROM busy_periods WHERE creator_id = ? ORDER BY start_date",
      creatorId,
    ),
    [{ start_date: "2027-02-01", end_date: "2027-02-02", source: "event", source_id: 902 }],
  );
  assert.equal(database.one("SELECT no_bookings FROM creators WHERE id = ?", creatorId).no_bookings, 1);
});
