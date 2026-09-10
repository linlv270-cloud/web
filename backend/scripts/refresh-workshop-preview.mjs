import { readFile } from "node:fs/promises";
import { getDb } from "../lib/database.ts";
import { setWorkshopProjectCover } from "../lib/mini-program.ts";
import { putObject } from "../lib/storage.ts";

if (process.env.CONFIRM_PREVIEW_REFRESH !== "YES") {
  throw new Error("Set CONFIRM_PREVIEW_REFRESH=YES to refresh marked preview data.");
}

const db = getDb();
const marker = "QIDENG_PREVIEW_DEMO";
const admin = { id: null, role: "super", label: "体验数据刷新脚本" };
const previewCreators = [
  ["18810009001", "陶瓷", "pottery.jpg"],
  ["18810009002", "纸艺", "paper.jpg"],
  ["18810009003", "银饰", "silver.jpg"],
  ["18810009004", "染织", "botanical.jpg"],
  ["18810009005", "纯艺创作", "collage.jpg"],
  ["18810009006", "甜品", "cookies.jpg"],
];
const coverSources = new Map(await Promise.all(previewCreators.map(async ([, , filename]) => [
  filename,
  await readFile(new URL(`./preview-covers/${filename}`, import.meta.url)),
])));

function shanghaiDate(daysFromToday = 0) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(Date.now() + daysFromToday * 86400000));
}

const startDate = shanghaiDate();
const endDate = shanghaiDate(180);
const insertCreatorTag = db.prepare(
  "INSERT OR IGNORE INTO creator_tags(creator_id, tag_id, source) VALUES (?, ?, 'admin')",
);
const insertProjectTag = db.prepare(
  "INSERT OR IGNORE INTO project_tags(project_id, tag_id, tag_type) VALUES (?, ?, 'interest')",
);

db.exec("BEGIN IMMEDIATE");
try {
  let refreshed = 0;
  for (const [index, [phone, workLabel, coverFilename]] of previewCreators.entries()) {
    const creator = db.prepare(
      "SELECT id FROM creators WHERE phone = ? AND admin_note = ?",
    ).get(phone, marker);
    if (!creator) throw new Error(`Marked preview creator is missing: ${phone}`);

    const project = db.prepare(
      `SELECT id FROM workshop_projects
       WHERE creator_id = ? AND review_note = ? AND status = 'published'
       ORDER BY id LIMIT 1`,
    ).get(creator.id, marker);
    if (!project) throw new Error(`Published preview project is missing: ${phone}`);

    const tag = db.prepare(
      "SELECT id FROM tags WHERE label = ? AND category = '我的作品' AND status = 'active' ORDER BY id LIMIT 1",
    ).get(workLabel);
    if (!tag) throw new Error(`Active work tag is missing: ${workLabel}`);

    insertCreatorTag.run(creator.id, tag.id);
    insertProjectTag.run(project.id, tag.id);
    const coverKey = `workshop/preview/experience-${String(index + 1).padStart(2, "0")}.jpg`;
    await putObject(coverKey, coverSources.get(coverFilename));
    setWorkshopProjectCover(project.id, coverKey, admin);
    db.prepare(
      `UPDATE workshop_projects
       SET primary_category_tag_id = ?, start_date = ?, end_date = ?, no_plan = 0,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
    ).run(tag.id, startDate, endDate, project.id);
    db.prepare(
      `UPDATE creator_applications SET representative_image_key = ?, public_authorized = 1,
       phone_public_authorized = 1, phone_consent_at = COALESCE(phone_consent_at, CURRENT_TIMESTAMP),
       updated_at = CURRENT_TIMESTAMP WHERE creator_id = ?`,
    ).run(coverKey, creator.id);
    refreshed += 1;
  }
  db.exec("COMMIT");
  console.log(`Preview data refreshed: ${refreshed} projects with direct phone contact, ${startDate} through ${endDate}.`);
} catch (error) {
  db.exec("ROLLBACK");
  throw error;
}
