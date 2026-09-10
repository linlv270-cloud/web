import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, test } from "node:test";

const dataDir = mkdtempSync(path.join(tmpdir(), "qideng-preview-data-test-"));
Object.assign(process.env, {
  DATA_DIR: dataDir,
  QIDENG_BOOTSTRAP_INVITE_CODE: "QIDENG26",
  CONFIRM_PREVIEW_SEED: "YES",
  CONFIRM_PREVIEW_REFRESH: "YES",
  CONFIRM_PREVIEW_CLEAR: "YES",
});

const database = await import("../lib/database.ts");

after(() => {
  database.getDb().close();
  rmSync(dataDir, { recursive: true, force: true });
});

test("preview data follows current project publication and operation-tag review rules", async () => {
  await import(`../scripts/seed-workshop-preview.mjs?seed=${Date.now()}`);

  assert.equal(database.one(
    "SELECT COUNT(*) AS count FROM creators WHERE admin_note = 'QIDENG_PREVIEW_DEMO'",
  ).count, 6);
  assert.equal(database.one(
    `SELECT COUNT(*) AS count FROM workshop_projects p
     JOIN creators c ON c.id = p.creator_id
     WHERE c.admin_note = 'QIDENG_PREVIEW_DEMO' AND p.status = 'published'
       AND p.cover_key != '' AND p.selected_for_display = 1`,
  ).count, 6);
  assert.equal(database.one(
    `SELECT COUNT(*) AS count FROM creator_applications a
     JOIN creators c ON c.id = a.creator_id
     WHERE c.admin_note = 'QIDENG_PREVIEW_DEMO' AND a.status = 'active'
       AND a.public_authorized = 1 AND a.phone_public_authorized = 1`,
  ).count, 6);
  assert.equal(database.one(
    `SELECT COUNT(*) AS count FROM project_operation_requests r
     JOIN creators c ON c.id = r.creator_id
     WHERE c.admin_note = 'QIDENG_PREVIEW_DEMO' AND r.status = 'approved'`,
  ).count, 4);

  const previewProjects = database.all(
    `SELECT p.id, p.cover_key FROM workshop_projects p
     JOIN creators c ON c.id = p.creator_id
     WHERE c.admin_note = 'QIDENG_PREVIEW_DEMO' AND p.status = 'published'
     ORDER BY p.id`,
  );
  assert.equal(previewProjects.length, 6);
  assert.ok(previewProjects.every((project) => /^workshop\/preview\/experience-\d{2}\.jpg$/.test(project.cover_key)));
  const miniProgram = await import("../lib/mini-program.ts");
  const publicPayload = {
    home: miniProgram.miniWorkshopHome({ city: "北京市" }),
    companion: miniProgram.miniCompanionPlay({ city: "北京市", limit: 50 }),
    details: previewProjects.map((project) => miniProgram.getWorkshopProjectDetail(project.id)),
  };
  assert.doesNotMatch(JSON.stringify(publicPayload), /1881000900[1-6]/);

  await import(`../scripts/refresh-workshop-preview.mjs?refresh=${Date.now()}`);
  const coverDirectory = path.join(dataDir, "uploads", "workshop", "preview");
  const coverHashes = readdirSync(coverDirectory)
    .filter((name) => name.endsWith(".jpg"))
    .map((name) => createHash("sha256").update(readFileSync(path.join(coverDirectory, name))).digest("hex"));
  assert.equal(coverHashes.length, 6);
  assert.equal(new Set(coverHashes).size, 6);
  assert.ok(readdirSync(coverDirectory).every((name) => !/^1[3-9]\d{9}\.jpg$/.test(name)));

  await import(`../scripts/clear-workshop-preview.mjs?clear=${Date.now()}`);
  assert.equal(database.one(
    "SELECT COUNT(*) AS count FROM creators WHERE admin_note = 'QIDENG_PREVIEW_DEMO'",
  ).count, 0);
  assert.equal(database.one(
    "SELECT COUNT(*) AS count FROM homepage_banners WHERE title = '[测试] 本周快闪材料包上新'",
  ).count, 0);
});
