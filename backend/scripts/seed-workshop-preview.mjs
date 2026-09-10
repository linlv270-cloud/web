import { readFile } from "node:fs/promises";
import { getDb } from "../lib/database.ts";
import {
  linkVenueKit,
  listProjectOperationRequests,
  reviewProjectOperationRequest,
  saveHomepageBanner,
  saveVenueHour,
  saveWorkshopKit,
  saveWorkshopProject,
  saveWorkshopVenue,
  setWorkshopProjectCover,
  submitProjectOperationRequest,
} from "../lib/mini-program.ts";
import { getCreator, registerCreator, updateProfile } from "../lib/repository.ts";
import { putObject } from "../lib/storage.ts";

if (process.env.CONFIRM_PREVIEW_SEED !== "YES") {
  throw new Error("Set CONFIRM_PREVIEW_SEED=YES to create removable preview data.");
}

const db = getDb();
const admin = { id: null, role: "super", label: "体验数据脚本" };
const marker = "QIDENG_PREVIEW_DEMO";
const requestedOperationLabels = new Set(["首发尝鲜", "限时限量"]);
const projectOperationLabels = new Set(["今日上新", ...requestedOperationLabels]);
const coverSources = await Promise.all([
  "./preview-covers/pottery.jpg",
  "./preview-covers/paper.jpg",
  "./preview-covers/botanical.jpg",
].map((file) => readFile(new URL(file, import.meta.url))));

function shanghaiDate(daysFromToday = 0) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(Date.now() + daysFromToday * 86400000));
}

const tagId = (label) => Number(db.prepare("SELECT id FROM tags WHERE label = ? AND status = 'active' ORDER BY id LIMIT 1").get(label)?.id || 0);
const ids = (...labels) => labels.map(tagId).filter(Boolean);

const venues = [
  ["[测试] 三里屯周末快闪", "朝阳区", "三里屯", "朝阳区工体北路周末快闪区"],
  ["[测试] 国贸午后体验点", "朝阳区", "国贸", "朝阳区建国门外大街体验区"],
  ["[测试] 五道口兴趣角", "海淀区", "五道口", "海淀区成府路青年体验区"],
].map(([name, district, businessArea, address], index) => {
  const existing = db.prepare("SELECT id FROM venues WHERE name = ?").get(name);
  const venue = existing
    ? saveWorkshopVenue({ id: existing.id, name, kind: "popup", province: "北京市", city: "北京市", district, businessArea, address, routeHint: "到达后按奇灯现场标识进入", status: "published", sortOrder: 100 - index })
    : saveWorkshopVenue({ name, kind: "popup", province: "北京市", city: "北京市", district, businessArea, address, routeHint: "到达后按奇灯现场标识进入", status: "published", sortOrder: 100 - index });
  db.prepare("DELETE FROM venue_hours WHERE venue_id = ? AND note = ?").run(venue.id, marker);
  for (let weekday = 0; weekday < 7; weekday += 1) saveVenueHour({ venueId: venue.id, weekday, openTime: "10:00", closeTime: "20:00", closed: false, note: marker });
  return venue;
});

const bannerTitle = "[测试] 本周快闪材料包上新";
const existingBanner = db.prepare("SELECT id FROM homepage_banners WHERE title = ?").get(bannerTitle);
saveHomepageBanner({
  ...(existingBanner ? { id: existingBanner.id } : {}),
  title: bannerTitle,
  subtitle: "营业时间内到开放体验点，选好材料包即可开始。",
  linkType: "topic",
  linkValue: "今日上新",
  city: "北京市",
  enabled: true,
  sortOrder: 100,
});

const kitSeeds = [
  ["把晚霞留在石膏画里", "30分钟完成一幅渐变石膏画", ["自己放空", "今日上新"]],
  ["亲子一起做一盏纸艺灯", "零基础亲子纸艺", ["带孩子玩", "首发尝鲜"]],
  ["给朋友做一枚名字胸针", "现场制作专属胸针", ["和朋友玩", "限时限量"]],
  ["做一份不会撞款的生日礼物", "自由搭配礼物材料", ["定制礼物", "今日上新"]],
  ["双人植物拓印帆布袋", "一起完成两只帆布袋", ["和朋友玩", "首发尝鲜"]],
  ["儿童软陶小摆件", "适合亲子共同完成", ["带孩子玩", "好评精选"]],
];

const kits = kitSeeds.map(([title, subtitle, labels], index) => {
  const existing = db.prepare("SELECT id FROM kits WHERE title = ?").get(title);
  const kit = saveWorkshopKit({
    ...(existing ? { id: existing.id } : {}), title, subtitle, description: subtitle,
    priceCents: 6900 + index * 1000, ageRange: index % 2 ? "6岁以上" : "12岁以上",
    durationMinutes: 30 + index * 10, difficulty: "easy", messLevel: "low", guidanceType: "self",
    safetyNotes: "按现场说明使用材料", status: "published", sortOrder: 100 - index, tagIds: ids(...labels),
  });
  const venue = venues[index % venues.length];
  linkVenueKit({ venueId: venue.id, kitId: kit.id, available: true });
  const guideSteps = [
    [1, "核对材料", `打开“${title}”材料包，按清单确认材料和工具。`],
    [2, "跟着步骤完成", "从基础步骤开始，完成一项再进入下一项。"],
    [3, "整理并归位", "作品完成后清洁桌面，把公共工具放回原处。"],
  ];
  for (const [stepOrder, guideTitle, body] of guideSteps) {
    const guide = db.prepare("SELECT id FROM kit_guides WHERE kit_id = ? AND step_order = ?").get(kit.id, stepOrder);
    if (guide) db.prepare("UPDATE kit_guides SET title = ?, body = ?, safety_level = 'normal', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(guideTitle, body, guide.id);
    else db.prepare("INSERT INTO kit_guides(kit_id, step_order, title, body) VALUES (?, ?, ?, ?)").run(kit.id, stepOrder, guideTitle, body);
  }
  return kit;
});

const creatorSeeds = [
  ["奇灯陶艺陪玩官", "18810009001", "陪你捏一只带着手感的陶杯", "朝阳区", ["自己放空", "今日上新"]],
  ["奇灯纸艺陪玩官", "18810009002", "和孩子一起做一盏会发光的纸灯", "海淀区", ["带孩子玩", "首发尝鲜"]],
  ["奇灯银饰陪玩官", "18810009003", "把一句悄悄话敲进银戒里", "东城区", ["定制礼物", "限时限量"]],
  ["奇灯植物染陪玩官", "18810009004", "和朋友把一片叶子留在布上", "西城区", ["和朋友玩", "今日上新"]],
  ["奇灯拼贴陪玩官", "18810009005", "用旧杂志拼出今天的心情", "朝阳区", ["自己放空", "首发尝鲜"]],
  ["奇灯甜品陪玩官", "18810009006", "一起装饰一盒只属于你的曲奇", "丰台区", ["带孩子玩", "限时限量"]],
];

for (const [index, [brandName, phone, oneLiner, district, labels]] of creatorSeeds.entries()) {
  let row = db.prepare("SELECT id FROM creators WHERE phone = ?").get(phone);
  if (!row) {
    const creatorId = registerCreator(phone, `Preview-${phone}`, "QIDENG26", false, "北京市", "北京市", "", ["opportunity"], [], false, true);
    row = { id: creatorId };
  }
  updateProfile(row.id, { brandName, intro: oneLiner, province: "北京市", city: "北京市", district, opportunityTypes: [], opportunityOptIn: false });
  db.prepare("UPDATE creators SET admin_note = ? WHERE id = ?").run(marker, row.id);
  const existingProject = db.prepare("SELECT id FROM workshop_projects WHERE creator_id = ? AND review_note = ?").get(row.id, marker);
  const directTagIds = ids(...labels.filter((label) => !projectOperationLabels.has(label)));
  let project = saveWorkshopProject(row.id, {
    ...(existingProject ? { id: existingProject.id } : {}), title: oneLiner, oneLiner,
    description: "轻松沟通后确认见面方式和体验内容。", province: "北京市", city: "北京市", district,
    addressHint: `${district}，具体地点沟通后确认`, startDate: shanghaiDate(1), endDate: shanghaiDate(180),
    noPlan: false, minPeople: 1, maxPeople: 4, durationMinutes: 90, priceCents: 9900,
    schedules: [
      { availableDate: shanghaiDate(index + 1), startTime: "10:00", endTime: "12:00", note: marker },
      { availableDate: shanghaiDate(index + 8), startTime: "14:00", endTime: "16:00", note: marker },
    ],
    status: "pending", reviewNote: marker, sortOrder: 100, tagIds: directTagIds,
  }, admin);

  const coverKey = `workshop/preview/experience-${String(index + 1).padStart(2, "0")}.jpg`;
  await putObject(coverKey, coverSources[index % coverSources.length]);
  setWorkshopProjectCover(project.id, coverKey, admin);
  db.prepare(
    `INSERT OR IGNORE INTO consumer_accounts(openid, nickname, phone)
     VALUES (?, ?, ?)`,
  ).run(`qideng-preview-${phone}`, brandName, phone);
  const consumerId = Number(db.prepare("SELECT id FROM consumer_accounts WHERE openid = ?").get(`qideng-preview-${phone}`).id);
  db.prepare(
    `INSERT INTO creator_applications(
      creator_id, consumer_id, status, phone, brand_name, province, city, district,
      representative_image_key, tag_ids, public_authorized, consent_at,
      phone_public_authorized, phone_consent_at
     ) VALUES (?, ?, 'active', ?, ?, '北京市', '北京市', ?, ?, ?, 1, CURRENT_TIMESTAMP, 1, CURRENT_TIMESTAMP)
     ON CONFLICT(creator_id) DO UPDATE SET consumer_id = excluded.consumer_id, status = 'active',
       phone = excluded.phone, brand_name = excluded.brand_name, district = excluded.district,
       representative_image_key = excluded.representative_image_key, tag_ids = excluded.tag_ids,
       public_authorized = 1, consent_at = CURRENT_TIMESTAMP,
       phone_public_authorized = 1, phone_consent_at = CURRENT_TIMESTAMP,
       updated_at = CURRENT_TIMESTAMP`,
  ).run(row.id, consumerId, phone, brandName, district, coverKey, JSON.stringify(directTagIds));

  project = saveWorkshopProject(row.id, {
    id: project.id,
    status: "published",
    selectedForDisplay: true,
    reviewNote: marker,
  }, admin);

  const operationLabel = labels.find((label) => requestedOperationLabels.has(label));
  if (operationLabel) {
    const requestType = operationLabel === "首发尝鲜" ? "first_launch" : "limited";
    let request = listProjectOperationRequests(row.id).find((item) =>
      item.projectId === project.id && item.requestType === requestType && ["pending", "approved"].includes(item.status));
    if (!request) {
      request = submitProjectOperationRequest(row.id, {
        projectId: project.id,
        requestType,
        ruleAcknowledged: true,
        reason: `${operationLabel}官方预览项目，用于验证前后台审核与展示流程`,
        ...(requestType === "limited" ? {
          startsAt: shanghaiDate(1),
          endsAt: shanghaiDate(30),
          quantityNote: "预览测试限量20份",
        } : {}),
      });
    }
    if (request.status === "pending") reviewProjectOperationRequest(request.id, "approved", "官方预览数据", admin);
  }
}

console.log(`Preview data ready: ${venues.length} venues, ${kits.length} kits, ${creatorSeeds.length} creator projects.`);
