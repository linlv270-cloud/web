import { getDb } from "../lib/database.ts";
import { deleteObject } from "../lib/storage.ts";

if (process.env.CONFIRM_PREVIEW_CLEAR !== "YES") {
  throw new Error("Set CONFIRM_PREVIEW_CLEAR=YES to remove preview data.");
}

const db = getDb();
const kitTitles = [
  "把晚霞留在石膏画里",
  "亲子一起做一盏纸艺灯",
  "给朋友做一枚名字胸针",
  "做一份不会撞款的生日礼物",
  "双人植物拓印帆布袋",
  "儿童软陶小摆件",
];
const creatorPhones = [
  "18810009001",
  "18810009002",
  "18810009003",
  "18810009004",
  "18810009005",
  "18810009006",
];
const coverKeys = creatorPhones.flatMap((phone, index) => [
  `workshop/preview/experience-${String(index + 1).padStart(2, "0")}.jpg`,
  `workshop/preview/${phone}.jpg`,
]);
db.exec("BEGIN IMMEDIATE");
try {
  db.prepare("DELETE FROM venues WHERE name LIKE '[测试] %'").run();
  const deleteKit = db.prepare("DELETE FROM kits WHERE title = ?");
  for (const title of kitTitles) deleteKit.run(title);
  db.prepare("DELETE FROM homepage_banners WHERE title = '[测试] 本周快闪材料包上新'").run();
  db.prepare("DELETE FROM creators WHERE admin_note = 'QIDENG_PREVIEW_DEMO'").run();
  db.prepare("DELETE FROM consumer_accounts WHERE openid LIKE 'qideng-preview-%'").run();
  db.exec("COMMIT");
  await Promise.all(coverKeys.map((key) => deleteObject(key)));
  console.log("Preview data removed.");
} catch (error) {
  db.exec("ROLLBACK");
  throw error;
}
