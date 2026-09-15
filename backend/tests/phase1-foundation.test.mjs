import assert from "node:assert/strict";
import { after, test } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const dataDir = mkdtempSync(path.join(tmpdir(), "tde-phase1-foundation-"));
process.env.DATA_DIR = dataDir;
process.env.NODE_ENV = "test";
process.env.QIDENG_BOOTSTRAP_INVITE_CODE = "PHASE126";

const database = await import("../lib/database.ts");
const repository = await import("../lib/repository.ts");
const catalog = await import("../lib/catalog.ts");
const miniAuth = await import("../lib/mini-auth.ts");
const profileRoute = await import("../app/api/web/profile/route.ts");

const creatorId = Number(database.run(
  `INSERT INTO creators(phone, password_hash, password_salt, invite_code, registered_with_code)
   VALUES (?, ?, ?, ?, ?)`,
  "18830000991",
  "test-hash",
  "test-salt",
  "PHASE1C",
  "PHASE126",
).lastInsertRowid);

const routeCreatorId = Number(database.run(
  `INSERT INTO creators(phone, password_hash, password_salt, invite_code, registered_with_code)
   VALUES (?, ?, ?, ?, ?)`,
  "18830000992",
  "test-hash",
  "test-salt",
  "PHASE1D",
  "PHASE126",
).lastInsertRowid);

after(() => {
  database.getDb().close();
  rmSync(dataDir, { recursive: true, force: true });
});

test("web profile schedule updates only manual periods and records explicit confirmation", async () => {
  database.run(
    `INSERT INTO busy_periods(creator_id, start_date, end_date, note, source, source_id)
     VALUES (?, ?, ?, ?, 'event', ?)`,
    routeCreatorId,
    "2027-02-01",
    "2027-02-02",
    "运营台活动",
    801,
  );
  const session = miniAuth.createMiniSession("creator", routeCreatorId);
  const response = await profileRoute.POST(new Request("http://localhost/api/web/profile", {
    method: "POST",
    headers: {
      authorization: `Bearer ${session.token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      action: "updateSchedule",
      busyPeriods: [{ startDate: "2027-03-01", endDate: "2027-03-03" }],
      noBookings: false,
    }),
  }));
  assert.equal(response.status, 200, await response.text());
  assert.deepEqual(
    database.all(
      "SELECT start_date, end_date, source, source_id FROM busy_periods WHERE creator_id = ? ORDER BY start_date",
      routeCreatorId,
    ),
    [
      { start_date: "2027-02-01", end_date: "2027-02-02", source: "event", source_id: 801 },
      { start_date: "2027-03-01", end_date: "2027-03-03", source: "manual", source_id: null },
    ],
  );
  assert.ok(database.one(
    "SELECT schedule_confirmed_at FROM creators WHERE id = ?",
    routeCreatorId,
  ).schedule_confirmed_at);
});

test("manual schedule replacement preserves other busy period sources and confirms the schedule", () => {
  database.run(
    `INSERT INTO busy_periods(creator_id, start_date, end_date, note, source, source_id)
     VALUES (?, ?, ?, ?, 'event', ?)`,
    creatorId,
    "2026-10-10",
    "2026-10-12",
    "运营台活动",
    701,
  );
  database.run(
    `INSERT INTO busy_periods(creator_id, start_date, end_date, note, source, source_id)
     VALUES (?, ?, ?, ?, 'application', ?)`,
    creatorId,
    "2026-11-01",
    "2026-11-02",
    "历史报名",
    702,
  );

  repository.replaceManualBusyPeriods(creatorId, [
    { startDate: "2026-09-20", endDate: "2026-09-20", note: "单日安排" },
    { startDate: "2026-09-30", endDate: "2026-10-02", note: "跨月安排" },
    { startDate: "2026-12-31", endDate: "2027-01-02", note: "跨年安排" },
  ], false);

  assert.deepEqual(
    database.all(
      "SELECT start_date, end_date, source, source_id FROM busy_periods WHERE creator_id = ? ORDER BY start_date",
      creatorId,
    ),
    [
      { start_date: "2026-09-20", end_date: "2026-09-20", source: "manual", source_id: null },
      { start_date: "2026-09-30", end_date: "2026-10-02", source: "manual", source_id: null },
      { start_date: "2026-10-10", end_date: "2026-10-12", source: "event", source_id: 701 },
      { start_date: "2026-11-01", end_date: "2026-11-02", source: "application", source_id: 702 },
      { start_date: "2026-12-31", end_date: "2027-01-02", source: "manual", source_id: null },
    ],
  );
  const confirmed = database.one(
    "SELECT no_bookings, schedule_confirmed_at FROM creators WHERE id = ?",
    creatorId,
  );
  assert.equal(confirmed.no_bookings, 0);
  assert.ok(confirmed.schedule_confirmed_at);
});

test("explicitly clearing manual dates preserves other sources and records a fresh confirmation", () => {
  const before = database.one(
    "SELECT schedule_confirmed_at FROM creators WHERE id = ?",
    creatorId,
  ).schedule_confirmed_at;
  repository.replaceManualBusyPeriods(creatorId, [], true);

  assert.deepEqual(
    database.all(
      "SELECT start_date, end_date, source, source_id FROM busy_periods WHERE creator_id = ? ORDER BY start_date",
      creatorId,
    ),
    [
      { start_date: "2026-10-10", end_date: "2026-10-12", source: "event", source_id: 701 },
      { start_date: "2026-11-01", end_date: "2026-11-02", source: "application", source_id: 702 },
    ],
  );
  const confirmed = database.one(
    "SELECT no_bookings, schedule_confirmed_at FROM creators WHERE id = ?",
    creatorId,
  );
  assert.equal(confirmed.no_bookings, 1);
  assert.ok(confirmed.schedule_confirmed_at);
  assert.ok(confirmed.schedule_confirmed_at >= before);
});

test("taxonomy terms use stable keys and preserve legacy tag categories", () => {
  const tag = database.one(
    "SELECT id, label, category FROM tags WHERE category = '我的身份' AND status = 'active' ORDER BY id LIMIT 1",
  );
  assert.ok(tag);
  const mappings = repository.listTagTaxonomyMappings(tag.id);
  assert.equal(mappings.length, 1);
  assert.equal(mappings[0].namespace, "R");
  assert.equal(mappings[0].label, tag.label);
  assert.equal(mappings[0].source, "legacy");
  assert.equal(mappings[0].termKey, catalog.legacyTaxonomyTermKey("R", tag.label));
  assert.notEqual(mappings[0].termKey, String(tag.id));

  const terms = repository.listTaxonomyTerms("R");
  assert.ok(terms.some((term) => term.termKey === mappings[0].termKey));
  assert.deepEqual(catalog.creatorTaxonomyNamespaces, ["R", "I", "O", "X", "P", "E", "S"]);
  assert.equal(
    database.one("SELECT category FROM tags WHERE id = ?", tag.id).category,
    "我的身份",
  );
});

test("invalid empty manual schedule cannot masquerade as a confirmed state", () => {
  assert.throws(
    () => repository.replaceManualBusyPeriods(creatorId, [], false),
    /请标记已有安排/,
  );
});
