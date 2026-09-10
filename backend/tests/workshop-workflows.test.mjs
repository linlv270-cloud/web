import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, test } from "node:test";

const dataDir = mkdtempSync(path.join(tmpdir(), "qideng-workshop-workflows-test-"));
Object.assign(process.env, {
  DATA_DIR: dataDir,
  NODE_ENV: "production",
  MINI_AUTH_MOCK: "true",
  WECHAT_MINI_APP_ID: "",
  WECHAT_MINI_APP_SECRET: "",
  CREATOR_CLAIM_CODE_PEPPER: "workshop-workflows-test-pepper",
});

const database = await import("../lib/database.ts");
const repository = await import("../lib/repository.ts");
const auth = await import("../lib/auth.ts");
const miniAuth = await import("../lib/mini-auth.ts");
const miniProgram = await import("../lib/mini-program.ts");
const reviewWorkflow = await import("../lib/review-workflow.ts");
const creatorsRoute = await import("../app/api/admin/creators/route.ts");

after(() => {
  database.getDb().close();
  rmSync(dataDir, { recursive: true, force: true });
});

function request(pathname, init = {}) {
  return new Request(`http://localhost${pathname}`, init);
}

async function json(response) {
  return { status: response.status, body: await response.json() };
}

test("creator claims, project review, discovery, and contact rules stay connected", async (t) => {
  const managerA = repository.registerAdminAccount("18860000101", "18860000101");
  repository.updateAdminAccount(managerA.id, "active", "TEAM610", "超级管理员");
  const managerB = repository.registerAdminAccount("18860000102", "18860000102");
  repository.updateAdminAccount(managerB.id, "active", "TEAM620", "超级管理员");
  const creatorA = repository.createManagedCreator(managerA.id, {
    phone: "18860000111",
    brandName: "奇灯陶艺新遇官",
    province: "北京市",
    city: "北京市",
    district: "朝阳区",
  }, "超级管理员");
  const creatorB = repository.createManagedCreator(managerB.id, {
    phone: "18860000112",
    brandName: "奇灯摄影新遇官",
    province: "北京市",
    city: "北京市",
    district: "海淀区",
  }, "超级管理员");
  const superPrincipal = { id: null, role: "super", label: "超级管理员" };
  const managerAPrincipal = { id: managerA.id, role: "subadmin", label: managerA.phone };
  const managerBPrincipal = { id: managerB.id, role: "subadmin", label: managerB.phone };

  await t.test("managed profiles use revocable one-time claims and enforce administrator scope", async () => {
    const first = repository.generateCreatorClaimCode(creatorA.id, "超级管理员");
    const second = repository.generateCreatorClaimCode(creatorA.id, "超级管理员");
    assert.match(second.code, /^[2-9A-HJ-NP-Z]{8}$/);
    assert.notEqual(first.code, second.code);

    const wrongPhoneConsumer = await miniAuth.loginMiniConsumer("claim-wrong-phone");
    await assert.rejects(
      () => miniAuth.claimManagedCreator({
        consumerId: wrongPhoneConsumer.consumer.id,
        code: first.code,
        phoneCode: "mock",
        mockPhone: creatorA.phone,
        agreed: true,
      }),
      /认领码无效或已过期/,
    );
    await assert.rejects(
      () => miniAuth.claimManagedCreator({
        consumerId: wrongPhoneConsumer.consumer.id,
        code: second.code,
        phoneCode: "mock",
        mockPhone: "18860000999",
        agreed: true,
      }),
      /手机号.*不一致/,
    );

    repository.revokeCreatorClaimCodes(creatorA.id, "超级管理员");
    await assert.rejects(
      () => miniAuth.claimManagedCreator({
        consumerId: wrongPhoneConsumer.consumer.id,
        code: second.code,
        phoneCode: "mock",
        mockPhone: creatorA.phone,
        agreed: true,
      }),
      /认领码无效或已过期/,
    );

    const expired = repository.generateCreatorClaimCode(creatorA.id, "超级管理员");
    database.run(
      "UPDATE creator_claim_tokens SET expires_at = '2000-01-01T00:00:00.000Z' WHERE code_hash = ?",
      repository.creatorClaimCodeHash(expired.code),
    );
    await assert.rejects(
      () => miniAuth.claimManagedCreator({
        consumerId: wrongPhoneConsumer.consumer.id,
        code: expired.code,
        phoneCode: "mock",
        mockPhone: creatorA.phone,
        agreed: true,
      }),
      /认领码无效或已过期/,
    );

    const managerASession = auth.createAdminSession(request("/api/admin/creators"), managerAPrincipal);
    const outOfScope = await json(await creatorsRoute.PATCH(request("/api/admin/creators", {
      method: "PATCH",
      headers: { cookie: managerASession.cookie, "content-type": "application/json" },
      body: JSON.stringify({ action: "generateClaimCode", creatorId: creatorB.id }),
    })));
    assert.equal(outOfScope.status, 403);

    const current = repository.generateCreatorClaimCode(creatorA.id, "超级管理员");
    const consumer = await miniAuth.loginMiniConsumer("claim-success");
    const claimed = await miniAuth.claimManagedCreator({
      consumerId: consumer.consumer.id,
      code: current.code,
      phoneCode: "mock",
      mockPhone: creatorA.phone,
      agreed: true,
    });
    assert.equal(claimed.creatorId, creatorA.id);
    assert.equal(claimed.roles.creatorId, creatorA.id);
    assert.equal(miniAuth.miniPrincipalFromRequest(request("/api/mini/creator/home", {
      headers: { authorization: `Bearer ${claimed.session.token}` },
    }))?.actorId, creatorA.id);
    assert.throws(() => repository.generateCreatorClaimCode(creatorA.id, "超级管理员"), /已经绑定微信/);
  });

  await t.test("projects only use approved creator tags and selected dates match exactly", () => {
    const workTags = database.all("SELECT id, label FROM tags WHERE category = '我的作品' AND status = 'active' ORDER BY id LIMIT 2");
    const interestTags = ["我的客群", "我的风格", "现场体验"].map((category) =>
      database.one("SELECT id, label, category FROM tags WHERE category = ? AND status = 'active' ORDER BY id LIMIT 1", category));
    const sceneTag = database.one("SELECT id FROM tags WHERE category = '项目场景' AND status = 'active' ORDER BY id LIMIT 1");
    const firstLaunchTag = database.one("SELECT id FROM tags WHERE category = '项目运营' AND label = '首发尝鲜'");
    assert.equal(workTags.length, 2);
    assert.ok(sceneTag?.id && firstLaunchTag?.id && interestTags.every((tag) => tag?.id));
    repository.assignCreatorTag(creatorA.id, workTags[0].id);
    for (const tag of interestTags) repository.assignCreatorTag(creatorA.id, tag.id);
    const ownerConsumerId = database.one(
      "SELECT consumer_id FROM creator_wechat_bindings WHERE creator_id = ?",
      creatorA.id,
    ).consumer_id;
    database.run(
      `INSERT INTO creator_applications(
        creator_id, consumer_id, status, phone, brand_name, province, city, district, tag_ids,
        public_authorized, consent_at, phone_public_authorized
       ) VALUES (?, ?, 'active', ?, ?, '北京市', '北京市', '朝阳区', ?, 1, CURRENT_TIMESTAMP, 0)`,
      creatorA.id,
      ownerConsumerId,
      creatorA.phone,
      creatorA.brandName,
      JSON.stringify([workTags[0].id, ...interestTags.map((tag) => tag.id)]),
    );
    assert.deepEqual(
      new Set(miniProgram.workshopAdminOverview(superPrincipal).approvedProjectTagIdsByCreator[creatorA.id]),
      new Set([workTags[0].id, ...interestTags.map((tag) => tag.id)]),
    );

    const year = new Date().getUTCFullYear() + 1;
    const firstDate = `${year}-05-10`;
    const gapDate = `${year}-05-11`;
    const secondDate = `${year}-05-12`;
    assert.throws(
      () => miniProgram.saveWorkshopProject(creatorA.id, {
        title: "不能越权使用的项目",
        oneLiner: "尝试使用未归属的品类标签",
        province: "北京市",
        city: "北京市",
        district: "朝阳区",
        schedules: [{ availableDate: firstDate }],
        tagIds: [workTags[1].id],
      }),
      /已经审核通过的标签/,
    );
    const project = miniProgram.saveWorkshopProject(creatorA.id, {
      title: "周末陶艺体验",
      oneLiner: "一起完成一件属于自己的陶艺作品",
      description: "适合第一次尝试陶艺的朋友。",
      province: "北京市",
      city: "北京市",
      district: "朝阳区",
      minPeople: 1,
      maxPeople: 6,
      priceCents: 16800,
      durationMinutes: 120,
      ageRange: "8岁以上",
      difficulty: "easy",
      safetyNotes: "儿童需由成人陪同。",
      schedules: [{ availableDate: firstDate }, { availableDate: secondDate }],
      tagIds: [workTags[0].id, ...interestTags.map((tag) => tag.id), sceneTag.id],
      selectedForDisplay: true,
    });
    assert.equal(project.status, "pending");
    assert.equal(project.primaryCategoryTagId, workTags[0].id);
    assert.throws(
      () => miniProgram.saveWorkshopProject(creatorA.id, {
        id: project.id,
        status: "pending",
        tagIds: [workTags[0].id, firstLaunchTag.id],
      }, superPrincipal),
      /单独申请并由平台审核/,
    );
    assert.equal(miniProgram.miniCompanionPlay({ city: "北京市", date: gapDate }).projects.length, 0);

    const thread = reviewWorkflow.listCreatorReviewThreads(creatorA.id).find((item) => item.entityType === "project" && item.entityId === project.id);
    assert.ok(thread);
    assert.throws(
      () => reviewWorkflow.addAdminReviewReply(thread.id, managerBPrincipal, "越权回复"),
      /不能回复/,
    );
    const replied = reviewWorkflow.addAdminReviewReply(thread.id, managerAPrincipal, "请补充项目展示图片后提交发布。" );
    assert.equal(replied.messages.at(-1).senderType, "admin");
    assert.throws(
      () => reviewWorkflow.addCreatorReviewSubmission(thread.id, creatorB.id, "越权补充"),
      /不能回复/,
    );

    assert.throws(
      () => miniProgram.saveWorkshopProject(creatorA.id, { id: project.id, status: "published" }, superPrincipal),
      /体验项目封面|申请代表图/,
    );
    miniProgram.setWorkshopProjectCover(project.id, "tests/project-cover.webp", superPrincipal);
    assert.throws(
      () => miniProgram.saveWorkshopProject(creatorA.id, { id: project.id, status: "published" }, superPrincipal),
      /授权公开注册手机号/,
    );
    const contactConsent = miniProgram.updateCreatorPhonePublicAuthorization(creatorA.id, true);
    assert.equal(contactConsent.phonePublicAuthorized, true);
    assert.equal(contactConsent.contactPhoneMasked, "188****0111");
    const published = miniProgram.saveWorkshopProject(creatorA.id, { id: project.id, status: "published" }, superPrincipal);
    assert.equal(published.status, "published");
    assert.deepEqual(new Set(miniProgram.miniCompanionPlay({ city: "北京市" }).filters.interests), new Set([workTags[0].label, ...interestTags.map((tag) => tag.label)]));
    assert.equal(miniProgram.miniCompanionPlay({ city: "北京市", tag: interestTags[0].label }).projects.some((item) => item.id === project.id), true);
    assert.equal(miniProgram.miniCompanionPlay({ city: "北京市" }).projects.some((item) => item.id === project.id), true);
    assert.equal(miniProgram.miniCompanionPlay({ city: "北京市", date: firstDate }).projects.some((item) => item.id === project.id), true);
    assert.equal(miniProgram.miniCompanionPlay({ city: "北京市", date: gapDate }).projects.some((item) => item.id === project.id), false);

    const before = database.one("SELECT consultation_count FROM workshop_projects WHERE id = ?", project.id).consultation_count;
    const publicDetail = miniProgram.getWorkshopProjectDetail(project.id);
    assert.deepEqual(publicDetail.phoneContact, { available: true, maskedPhone: "188****0111" });
    assert.doesNotMatch(JSON.stringify(publicDetail), /18860000111/);
    const click = miniProgram.recordWorkshopContactClick({ projectId: project.id, guestId: "workflow-guest" }, ownerConsumerId);
    assert.equal(click.recorded, true);
    assert.equal(click.phone, "18860000111");
    assert.match(click.reminder, /通过奇灯小程序发现/);
    assert.equal(database.one("SELECT consultation_count FROM workshop_projects WHERE id = ?", project.id).consultation_count, before + 1);
    assert.equal(database.one("SELECT COUNT(*) AS count FROM phone_contact_view_events WHERE project_id = ?", project.id).count, 1);

    const firstLaunch = miniProgram.submitProjectOperationRequest(creatorA.id, {
      projectId: project.id,
      requestType: "first_launch",
      ruleAcknowledged: true,
      reason: "这是首次公开发布并可稳定体验的原创项目",
    });
    assert.throws(
      () => miniProgram.reviewProjectOperationRequest(firstLaunch.id, "approved", "", managerBPrincipal),
      /不能审核/,
    );
    const approved = miniProgram.reviewProjectOperationRequest(firstLaunch.id, "approved", "", managerAPrincipal);
    assert.equal(approved.status, "approved");
    assert.equal(miniProgram.listWorkshopProjects(superPrincipal).find((item) => item.id === project.id).tags.some((tag) => tag.label === "首发尝鲜"), true);

    const limited = miniProgram.submitProjectOperationRequest(creatorA.id, {
      projectId: project.id,
      requestType: "limited",
      ruleAcknowledged: true,
      reason: "该体验仅在已经公布的可体验日期内开放",
    });
    assert.equal(limited.quantityNote, "");
    assert.equal(limited.startsAt, new Date(`${firstDate}T00:00:00.000+08:00`).toISOString());
    assert.equal(limited.endsAt, new Date(`${secondDate}T23:59:59.999+08:00`).toISOString());
    database.run("UPDATE project_schedules SET status = 'closed' WHERE project_id = ?", project.id);
    const pendingWithoutDates = miniProgram.listProjectOperationRequests(creatorA.id).find((item) => item.id === limited.id);
    assert.equal(pendingWithoutDates.status, "pending");
    assert.equal(pendingWithoutDates.startsAt, null);
    assert.equal(pendingWithoutDates.endsAt, null);
    assert.throws(
      () => miniProgram.reviewProjectOperationRequest(limited.id, "approved", "", managerAPrincipal),
      /没有未来可体验日期/,
    );
    database.run("UPDATE project_schedules SET status = 'open' WHERE project_id = ?", project.id);
    assert.equal(
      miniProgram.listProjectOperationRequests(creatorA.id).find((item) => item.id === limited.id).endsAt,
      new Date(`${secondDate}T23:59:59.999+08:00`).toISOString(),
    );
    const approvedLimited = miniProgram.reviewProjectOperationRequest(limited.id, "approved", "", managerAPrincipal);
    assert.equal(approvedLimited.status, "approved");
    assert.equal(miniProgram.listWorkshopProjects(superPrincipal).find((item) => item.id === project.id).tags.some((tag) => tag.label === "限时限量"), true);
    database.run("UPDATE project_schedules SET status = 'closed' WHERE project_id = ?", project.id);
    assert.equal(miniProgram.listProjectOperationRequests(creatorA.id).find((item) => item.id === limited.id).status, "expired");
    assert.equal(miniProgram.listWorkshopProjects(superPrincipal).find((item) => item.id === project.id).tags.some((tag) => tag.label === "限时限量"), false);

    database.run("UPDATE project_operation_requests SET ends_at = '2000-01-01T00:00:00.000Z' WHERE id = ?", firstLaunch.id);
    assert.equal(miniProgram.listProjectOperationRequests(creatorA.id).find((item) => item.id === firstLaunch.id).status, "expired");
    assert.equal(miniProgram.listWorkshopProjects(superPrincipal).find((item) => item.id === project.id).tags.some((tag) => tag.label === "首发尝鲜"), false);
  });
});
