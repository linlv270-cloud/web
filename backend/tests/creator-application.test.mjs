import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, test } from "node:test";

const dataDir = mkdtempSync(path.join(tmpdir(), "qideng-creator-application-test-"));
process.env.DATA_DIR = dataDir;
process.env.NODE_ENV = "production";

const database = await import("../lib/database.ts");
const repository = await import("../lib/repository.ts");
const miniAuth = await import("../lib/mini-auth.ts");
const miniProgram = await import("../lib/mini-program.ts");
const storage = await import("../lib/storage.ts");
const registerRoute = await import("../app/api/mini/auth/creator-register/route.ts");
const imageRoute = await import("../app/api/mini/creator-application/image/route.ts");
const projectImageRoute = await import("../app/api/mini/creator/project-image/route.ts");
const assetRoute = await import("../app/api/assets/[...key]/route.ts");
const dossierRoute = await import("../app/api/mini/creator/dossier/route.ts");
const sharp = (await import("sharp")).default;

after(() => {
  database.getDb().close();
  rmSync(dataDir, { recursive: true, force: true });
});

function consumerRequest(token, body) {
  return new Request("http://localhost/api/mini/auth/creator-register", {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function consumerGetRequest(token) {
  return new Request("http://localhost/api/mini/auth/creator-register", {
    headers: { authorization: `Bearer ${token}` },
  });
}

function creatorRequest(token, body) {
  return new Request("http://localhost/api/mini/creator/dossier", {
    method: "PATCH",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function imageRequest(token, body, target = "representative") {
  const form = new FormData();
  form.set("file", new File([body], "representative.jpg", { type: "image/jpeg" }));
  if (target === "logo") form.set("target", "logo");
  return new Request("http://localhost/api/mini/creator-application/image", {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
    body: form,
  });
}

function projectImageRequest(token, projectId, body) {
  const form = new FormData();
  form.set("projectId", String(projectId));
  form.set("file", new File([body], "project.jpg", { type: "image/jpeg" }));
  return new Request("http://localhost/api/mini/creator/project-image", {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
    body: form,
  });
}

async function payload(response) {
  return { status: response.status, body: await response.json() };
}

test("creator application is atomic and gates publishing until approval", async () => {
  const manager = repository.registerAdminAccount("18830000901", "18830000901");
  repository.updateAdminAccount(manager.id, "active", "APPLY26", "超级管理员");
  const otherManager = repository.registerAdminAccount("18830000902", "18830000902");
  repository.updateAdminAccount(otherManager.id, "active", "OTHER26", "超级管理员");
  const currentSettings = miniProgram.getMiniProgramSettings();
  miniProgram.updateMiniProgramSettings({
    ...currentSettings,
    creatorInvitationsEnabled: false,
    creatorApplicationFields: {
      ...currentSettings.creatorApplicationFields,
      intro: { ...currentSettings.creatorApplicationFields.intro, required: true },
    },
  });
  const consumerId = Number(database.run(
    "INSERT INTO consumer_accounts(openid, nickname) VALUES (?, ?)",
    "creator-application-consumer",
    "申请测试用户",
  ).lastInsertRowid);
  const consumerToken = miniAuth.createMiniSession("consumer", consumerId).token;
  const initialApplication = await payload(await registerRoute.GET(consumerGetRequest(consumerToken)));
  assert.equal(initialApplication.body.consumerId, consumerId);
  assert.equal(initialApplication.body.application, null);
  assert.equal(initialApplication.body.creatorInvitationsEnabled, false);
  assert.equal(initialApplication.body.creatorApplicationFields.intro.required, true);
  const sourceImage = await sharp({
    create: { width: 12, height: 15, channels: 3, background: "#ffffff" },
  }).jpeg().toBuffer();
  const firstImage = await payload(await imageRoute.POST(imageRequest(consumerToken, sourceImage)));
  const secondImage = await payload(await imageRoute.POST(imageRequest(consumerToken, sourceImage)));
  const logoImage = await payload(await imageRoute.POST(imageRequest(consumerToken, sourceImage, "logo")));
  assert.equal(firstImage.body.consumerId, consumerId);
  assert.notEqual(firstImage.body.imageKey, secondImage.body.imageKey);
  assert.ok(await storage.getObject(firstImage.body.imageKey));
  assert.equal(logoImage.body.target, "logo");
  assert.match(logoImage.body.imageKey, /\/logo-/);
  const imageKey = secondImage.body.imageKey;

  const base = {
    inviteCode: "",
    phone: "18830000931",
    confirmPhone: "18830000931",
    brandName: "奇灯申请测试",
    intro: "专注让普通人也能轻松参与的线下创作体验。",
    province: "北京市",
    city: "北京市",
    district: "朝阳区",
    opportunityTypes: ["现场体验"],
    busyPeriods: [{ startDate: "2026-08-22", endDate: "2026-08-22", note: "已有活动" }],
    noBookings: false,
    representativeImageKey: imageKey,
    logoImageKey: logoImage.body.imageKey,
    agreed: true,
    publicAuthorized: true,
    phonePublicAuthorized: true,
  };

  const missingPhoneConsent = await payload(await registerRoute.POST(consumerRequest(consumerToken, {
    ...base,
    phonePublicAuthorized: false,
  })));
  assert.equal(missingPhoneConsent.status, 400);
  assert.match(missingPhoneConsent.body.error, /手机号公开授权/);

  const failed = await payload(await registerRoute.POST(consumerRequest(consumerToken, {
    ...base,
    customTags: [{ category: "我的身份", label: "赌博" }],
  })));
  assert.equal(failed.status, 400);
  assert.match(failed.body.error, /暂不允许提交/);
  assert.equal(database.one("SELECT id FROM creators WHERE phone = ?", base.phone), null);
  assert.equal(database.one("SELECT creator_id FROM creator_wechat_bindings WHERE consumer_id = ?", consumerId), null);

  const tag = database.one("SELECT id FROM tags WHERE category = '我的身份' AND status = 'active' ORDER BY id LIMIT 1");
  const workTags = database.all("SELECT id FROM tags WHERE category = '我的作品' AND status = 'active' ORDER BY id LIMIT 2");
  assert.ok(tag?.id);
  assert.equal(workTags.length, 2);
  const missingIntro = await payload(await registerRoute.POST(consumerRequest(consumerToken, {
    ...base,
    intro: "",
    tagIds: [tag.id],
    customTags: [],
  })));
  assert.equal(missingIntro.status, 400);
  assert.match(missingIntro.body.error, /完整介绍/);
  const missingDatePlan = await payload(await registerRoute.POST(consumerRequest(consumerToken, {
    ...base,
    busyPeriods: [],
    noBookings: false,
    tagIds: [tag.id],
    customTags: [],
  })));
  assert.equal(missingDatePlan.status, 400);
  assert.match(missingDatePlan.body.error, /近期无其他活动安排/);
  const submitted = await payload(await registerRoute.POST(consumerRequest(consumerToken, {
    ...base,
    tagIds: [tag.id, workTags[0].id],
    customTags: [],
  })));
  assert.equal(submitted.status, 201, JSON.stringify(submitted.body));
  assert.equal(submitted.body.applicationStatus, "pending");
  assert.equal(miniAuth.getConsumerCreatorApplication(consumerId).phonePublicAuthorized, true);
  const creatorId = submitted.body.home.creator.id;
  const personalInvite = repository.getCreator(creatorId).inviteCode;
  assert.equal(repository.getCreator(creatorId).managerAdminId, null);
  assert.equal(database.one("SELECT password_login_enabled FROM creators WHERE id = ?", creatorId).password_login_enabled, 0);
  assert.equal(submitted.body.home.creator.inviteCode, "");
  assert.deepEqual(submitted.body.home.approvedProjectTagIds, []);
  assert.equal("presence" in submitted.body.home, false);
  assert.equal(repository.loginCreator(base.phone, base.phone), null);
  assert.equal(repository.loginCreatorByVerifiedPhone(base.phone), null);
  assert.throws(() => repository.resetCreatorPassword(base.phone, "NewPassword26!"), /微信授权登录/);
  assert.equal(repository.validateInviteCode(personalInvite), false);
  assert.throws(
    () => miniProgram.saveWorkshopProject(creatorId, {
      title: "申请期标签项目",
      oneLiner: "申请审核前不能使用待审核标签",
      province: "北京市",
      city: "北京市",
      district: "朝阳区",
      startDate: "2027-08-22",
      endDate: "2027-08-22",
      tagIds: [workTags[0].id],
    }),
    /已经审核通过的标签/,
  );
  const missingScheduleChoice = await payload(await dossierRoute.PATCH(creatorRequest(submitted.body.session.token, {
    action: "schedule",
    busyPeriods: [],
    noBookings: false,
  })));
  assert.equal(missingScheduleChoice.status, 400);
  assert.match(missingScheduleChoice.body.error, /请选择活动日期或近期无其他活动安排/);
  const conflictingScheduleChoice = await payload(await dossierRoute.PATCH(creatorRequest(submitted.body.session.token, {
    action: "schedule",
    busyPeriods: [{ startDate: "2026-08-23", endDate: "2026-08-23", note: "已有活动" }],
    noBookings: true,
  })));
  assert.equal(conflictingScheduleChoice.status, 400);
  assert.match(conflictingScheduleChoice.body.error, /不能同时选择/);
  const scheduleUpdate = await payload(await dossierRoute.PATCH(creatorRequest(submitted.body.session.token, {
    action: "schedule",
    busyPeriods: [{ startDate: "2026-08-23", endDate: "2026-08-23", note: "已有活动" }],
    noBookings: false,
  })));
  assert.equal(scheduleUpdate.status, 200, JSON.stringify(scheduleUpdate.body));
  const draft = miniProgram.saveWorkshopProject(creatorId, {
    title: "申请期项目",
    oneLiner: "先保存一份项目草稿",
    province: "北京市",
    city: "北京市",
    district: "朝阳区",
    startDate: "2026-08-22",
    endDate: "2026-08-22",
    tagIds: [],
    operationDraft: {
      requestLimited: true,
      limitedReason: "计划一天开放十份",
    },
  });
  assert.equal(draft.status, "draft");
  assert.equal(draft.operationDraft.requestLimited, true);
  assert.equal(draft.operationDraft.limitedReason, "计划一天开放十份");
  assert.equal("limitedEndsAt" in draft.operationDraft, false);

  const superPrincipal = { id: null, role: "super", label: "超级管理员" };
  const managerPrincipal = { id: manager.id, role: "subadmin", label: manager.phone };
  const otherPrincipal = { id: otherManager.id, role: "subadmin", label: otherManager.phone };
  const scopedApplication = miniProgram.workshopAdminOverview(superPrincipal).creatorApplications[0];
  assert.equal(scopedApplication.creatorId, creatorId);
  assert.deepEqual(scopedApplication.opportunityTypes, ["现场体验"]);
  assert.equal(scopedApplication.intro, base.intro);
  assert.equal(scopedApplication.busyPeriods[0].startDate, "2026-08-23");
  assert.equal(repository.getCreator(creatorId).busyPeriods[0].startDate, "2026-08-23");
  assert.ok(scopedApplication.representativeImageUrl);
  assert.ok(scopedApplication.logoImageUrl);
  assert.equal(scopedApplication.workspaceEnabled, true);
  assert.equal(miniProgram.workshopAdminOverview(managerPrincipal).creatorApplications.length, 0);
  assert.equal(miniProgram.workshopAdminOverview(otherPrincipal).creatorApplications.length, 0);
  assert.throws(
    () => miniProgram.reviewCreatorApplication(creatorId, "needs_changes", "越权审核", managerPrincipal),
    /不能审核/,
  );
  assert.throws(
    () => miniProgram.reviewCreatorApplication(creatorId, "needs_changes", "", superPrincipal),
    /审核意见/,
  );
  miniProgram.reviewCreatorApplication(creatorId, "needs_changes", "请补充品牌说明", superPrincipal);
  assert.equal(miniAuth.getMiniAccountRoles(consumerId).creatorStatus, "needs_changes");
  assert.equal(miniAuth.createBoundCreatorSession(consumerId).status, "needs_changes");

  const replacementImage = await payload(await imageRoute.POST(imageRequest(consumerToken, sourceImage)));

  const resubmitted = await payload(await registerRoute.POST(consumerRequest(consumerToken, {
    ...base,
    brandName: "奇灯申请测试工作室",
    busyPeriods: [],
    noBookings: true,
    representativeImageKey: replacementImage.body.imageKey,
    tagIds: [tag.id, workTags[0].id],
    customTags: [],
  })));
  assert.equal(resubmitted.status, 200, JSON.stringify(resubmitted.body));
  assert.equal(resubmitted.body.applicationStatus, "pending");
  assert.equal(miniAuth.getCreatorApplication(creatorId).revision, 2);
  assert.equal(miniAuth.getCreatorApplication(creatorId).noBookings, true);
  assert.equal(repository.getCreator(creatorId).noBookings, true);
  assert.equal(await storage.getObject(imageKey), null);
  assert.ok(await storage.getObject(replacementImage.body.imageKey));

  miniProgram.reviewCreatorApplication(creatorId, "active", "", superPrincipal);
  assert.equal(miniAuth.getMiniAccountRoles(consumerId).creatorStatus, "active");
  assert.equal(repository.validateInviteCode(personalInvite), true);
  assert.deepEqual(miniProgram.getMiniCreatorHome(creatorId).approvedProjectTagIds, [workTags[0].id]);
  assert.deepEqual(
    miniProgram.workshopAdminOverview(superPrincipal).approvedProjectTagIdsByCreator[creatorId],
    [workTags[0].id],
  );
  repository.assignCreatorTag(creatorId, workTags[1].id);
  assert.deepEqual(miniProgram.getMiniCreatorHome(creatorId).approvedProjectTagIds, [workTags[0].id]);
  assert.throws(
    () => miniProgram.saveWorkshopProject(creatorId, {
      title: "未审核新增标签项目",
      oneLiner: "后来新增但未审核的标签仍不能用于项目",
      province: "北京市",
      city: "北京市",
      district: "朝阳区",
      startDate: "2027-08-23",
      endDate: "2027-08-23",
      tagIds: [workTags[1].id],
    }, superPrincipal),
    /已经审核通过的标签/,
  );

  const projectInput = {
    title: "第二个陪玩项目",
    oneLiner: "一起做一件新的小作品",
    province: "北京市",
    city: "北京市",
    district: "朝阳区",
    startDate: "2026-08-23",
    endDate: "2026-08-23",
    minPeople: 2,
    maxPeople: 6,
    durationMinutes: 90,
    tagIds: [workTags[0].id],
  };
  const secondProject = miniProgram.saveWorkshopProject(creatorId, projectInput);
  assert.equal(secondProject.status, "pending");
  assert.equal(secondProject.minPeople, 2);
  assert.equal(secondProject.maxPeople, 6);
  assert.equal(secondProject.durationMinutes, 90);
  assert.equal(secondProject.selectedForDisplay, false);
  assert.equal(secondProject.coverSource, "representative");
  assert.ok(secondProject.coverUrl);
  const projectImage = await payload(await projectImageRoute.POST(
    projectImageRequest(submitted.body.session.token, secondProject.id, sourceImage),
  ));
  assert.equal(projectImage.status, 200, JSON.stringify(projectImage.body));
  assert.match(projectImage.body.url, /^\/api\/assets\/workshop\/project\//);
  assert.equal(projectImage.body.target.coverSource, "project");
  const assetKey = projectImage.body.url
    .replace(/^\/api\/assets\//, "")
    .split("/")
    .map(decodeURIComponent);
  const publicImage = await assetRoute.GET(
    new Request(`http://localhost${projectImage.body.url}`),
    { params: Promise.resolve({ key: assetKey }) },
  );
  assert.equal(publicImage.status, 200);
  assert.equal(publicImage.headers.get("content-type"), "image/webp");
  assert.match(publicImage.headers.get("cache-control") || "", /^public/);
  const projectImageMetadata = await sharp(Buffer.from(await publicImage.arrayBuffer())).metadata();
  assert.equal(projectImageMetadata.width, 1440);
  assert.equal(projectImageMetadata.height, 1800);
  assert.equal(projectImageMetadata.format, "webp");
  const selectedSecondProject = miniProgram.saveWorkshopProject(creatorId, { id: secondProject.id, selectedForDisplay: true }, superPrincipal);
  assert.equal(selectedSecondProject.selectedForDisplay, true);
  const retained = miniProgram.getMiniCreatorHome(creatorId).projects.filter((item) => item.status !== "archived");
  assert.equal(retained.filter((item) => item.selectedForDisplay).length, 1);
  assert.equal(retained.find((item) => item.id === draft.id)?.selectedForDisplay, false);

  assert.equal(miniProgram.saveWorkshopProject(creatorId, { id: secondProject.id, status: "archived" }, superPrincipal).status, "archived");
  const replacementProject = miniProgram.saveWorkshopProject(creatorId, {
    ...projectInput,
    title: "替补陪玩项目",
    startDate: "2026-08-24",
    endDate: "2026-08-24",
  });
  assert.equal(replacementProject.status, "pending");
  assert.equal(miniProgram.getMiniCreatorHome(creatorId).projects.filter((item) => item.status !== "archived").length, 2);
  const draftImage = await payload(await projectImageRoute.POST(
    projectImageRequest(submitted.body.session.token, draft.id, sourceImage),
  ));
  assert.equal(draftImage.status, 200, JSON.stringify(draftImage.body));
  const published = miniProgram.saveWorkshopProject(creatorId, {
    id: draft.id,
    title: draft.title,
    oneLiner: draft.oneLiner,
    province: draft.province,
    city: draft.city,
    district: draft.district,
    schedules: [
      { availableDate: "2027-08-22", startTime: "", endTime: "", note: "" },
      { availableDate: "2027-08-24", startTime: "", endTime: "", note: "" },
    ],
    tagIds: [],
    selectedForDisplay: true,
    status: "published",
  }, superPrincipal);
  assert.equal(published.status, "published");
  assert.ok(miniProgram.miniCompanionPlay({ city: "北京市" }).projects.some((item) => item.id === published.id));
  assert.equal(miniProgram.miniCompanionPlay({ city: "北京市", date: "2027-08-22" }).projects.some((item) => item.id === published.id), true);
  assert.equal(miniProgram.miniCompanionPlay({ city: "北京市", date: "2027-08-23" }).projects.some((item) => item.id === published.id), false);
  assert.throws(
    () => miniProgram.createConsultation(consumerId, { kind: "creator", workshopProjectId: published.id }),
    /体验详情联系新遇官/,
  );
  const detail = miniProgram.getWorkshopProjectDetail(published.id);
  assert.equal(detail.recommendedContact, null);
  assert.deepEqual(detail.phoneContact, { available: true, maskedPhone: "188****0931" });
  assert.doesNotMatch(JSON.stringify(detail), /18830000931/);
  assert.equal(detail.creatorPublic.name, "奇灯申请测试工作室");
  assert.ok(detail.creatorPublic.logoUrl);
  const directContact = miniProgram.recordWorkshopContactClick({ projectId: published.id, guestId: "creator-application-test" }, consumerId);
  assert.equal(directContact.phone, "18830000931");
  assert.match(directContact.reminder, /通过奇灯小程序发现/);
  assert.equal(database.one("SELECT COUNT(*) AS count FROM phone_contact_view_events WHERE project_id = ?", published.id).count, 1);

  const restored = miniProgram.restoreCreatorToVisitor(creatorId, superPrincipal);
  assert.equal(restored.workspaceEnabled, false);
  assert.equal(miniAuth.getMiniAccountRoles(consumerId).creatorId, null);
  assert.equal(miniAuth.getMiniAccountRoles(consumerId).creatorStatus, "none");
  assert.throws(() => miniAuth.createBoundCreatorSession(consumerId), /恢复游客状态/);
  const restoredProject = database.one("SELECT status, selected_for_display FROM workshop_projects WHERE id = ?", published.id);
  assert.equal(restoredProject.status, "paused");
  assert.equal(restoredProject.selected_for_display, 0);
  assert.ok(database.one("SELECT id FROM audit_logs WHERE action = 'creator_restore_visitor'"));
});
