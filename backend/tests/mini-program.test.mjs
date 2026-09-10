import assert from "node:assert/strict";
import { after, test } from "node:test";
import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { pathToFileURL } from "node:url";
import sharp from "sharp";

const root = path.resolve(import.meta.dirname, "..");
const dataDir = mkdtempSync(path.join(tmpdir(), "qideng-mini-test-"));
Object.assign(process.env, {
  NODE_ENV: "production",
  DATA_DIR: dataDir,
  QIDENG_BOOTSTRAP_INVITE_CODE: "QIDENG26",
  ADMIN_USERNAME: "mini-admin",
  ADMIN_PASSWORD: "MiniTestPassword-811!",
  MINI_AUTH_MOCK: "true",
  WECHAT_MINI_APP_ID: "",
  WECHAT_MINI_APP_SECRET: "",
  SMS_ENABLED: "false",
  ALIYUN_SMS_ACCESS_KEY_ID: "",
  ALIYUN_SMS_ACCESS_KEY_SECRET: "",
});

function resolveRoute(pathname) {
  const segments = pathname.split("/").filter(Boolean);
  const params = {};
  let current = path.join(root, "app");
  for (let index = 0; index < segments.length; index += 1) {
    const exact = path.join(current, segments[index]);
    if (existsSync(exact)) {
      current = exact;
      continue;
    }
    const dynamic = readdirSync(current, { withFileTypes: true })
      .find((entry) => entry.isDirectory() && /^\[.*\]$/.test(entry.name));
    if (!dynamic) throw new Error(`No API route matches ${pathname}`);
    const catchAll = dynamic.name.match(/^\[\.\.\.(.+)\]$/);
    const key = catchAll ? catchAll[1] : dynamic.name.slice(1, -1);
    params[key] = catchAll ? segments.slice(index) : segments[index];
    current = path.join(current, dynamic.name);
    if (catchAll) break;
  }
  const file = path.join(current, "route.ts");
  if (!existsSync(file)) throw new Error(`API route file is missing for ${pathname}`);
  return { file, params };
}

async function routeResponse(pathname, options = {}) {
  const url = new URL(pathname, "http://localhost");
  const { file, params } = resolveRoute(url.pathname);
  const route = await import(pathToFileURL(file).href);
  const method = String(options.method || "GET").toUpperCase();
  if (typeof route[method] !== "function") throw new Error(`${method} is not implemented for ${url.pathname}`);
  return route[method](new Request(url, options), { params: Promise.resolve(params) });
}

async function api(pathname, options = {}) {
  const response = await routeResponse(pathname, options);
  const payload = await response.json().catch(() => ({}));
  return { response, payload };
}

function jsonHeaders(tokenOrCookie, bearer = false) {
  return {
    "content-type": "application/json",
    ...(tokenOrCookie
      ? bearer
        ? { authorization: `Bearer ${tokenOrCookie}` }
        : { cookie: tokenOrCookie }
      : {}),
  };
}

after(async () => {
  const database = await import("../lib/database.ts");
  database.getDb().close();
  rmSync(dataDir, { recursive: true, force: true });
});

test("mini-program platform works end to end with fair draws and scoped permissions", async (t) => {
  let adminCookie = "";
  let subadminCookie = "";
  let subadminId = 0;
  const creators = [];
  const activities = [];
  let consumerToken = "";
  let creatorToken = "";
  let workshopKitId = 0;
  let workshopVenueId = 0;
  let workshopProjectId = 0;

  await t.test("database migration and locked public copy are available", async () => {
    const config = await api("/api/mini/config");
    assert.equal(config.response.status, 200);
    assert.equal(config.payload.settings.openingCopy, "精选800+新遇官团队 原创体验、审美训练、情绪疗愈、稀奇美味…大人小孩，可逛可玩");
    assert.equal(config.payload.settings.slogan, "在城市里，发现一次新遇");
    assert.equal(config.payload.settings.drawButton, "马上探照新遇");
    assert.equal(config.payload.settings.creatorInvitationsEnabled, false);
    const db = new DatabaseSync(path.join(dataDir, "qideng-curated-invitations.sqlite"));
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((item) => item.name);
    for (const name of ["consumer_accounts", "mini_sessions", "activities", "draw_sessions", "workshop_discovery_sessions", "consultation_threads", "consultation_messages", "mini_program_settings"])
      assert.ok(tables.includes(name), `${name} should exist`);
    for (const name of [
      "venues",
      "venue_hours",
      "kits",
      "venue_kits",
      "kit_guides",
      "workshop_projects",
      "creator_presence",
      "project_schedules",
      "project_tags",
      "creator_contact_channels",
      "creator_applications",
      "phone_contact_view_events",
      "homepage_banners",
      "homepage_slots",
      "points_ledger",
      "checkins",
      "support_tickets",
      "kit_reviews",
      "lightup_records",
    ])
      assert.ok(tables.includes(name), `${name} should exist`);
    const creatorColumns = db.prepare("PRAGMA table_info(creators)").all().map((item) => item.name);
    for (const name of ["district", "activity_limit", "reply_timeout_minutes"])
      assert.ok(creatorColumns.includes(name), `${name} should exist on creators`);
    const applicationColumns = db.prepare("PRAGMA table_info(creator_applications)").all();
    const phoneConsentColumn = applicationColumns.find((item) => item.name === "phone_public_authorized");
    assert.equal(String(phoneConsentColumn?.dflt_value), "0");
    assert.ok(applicationColumns.some((item) => item.name === "phone_consent_at"));
    db.close();
  });

  await t.test("super-admin approves scoped subadmins and creates district-aware creators", async () => {
    const login = await api("/api/admin/login", {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify({ username: "mini-admin", password: "MiniTestPassword-811!" }),
    });
    assert.equal(login.response.status, 200, JSON.stringify(login.payload));
    adminCookie = (login.response.headers.get("set-cookie") || "").split(";")[0];

    for (const phone of ["18810000811", "18810000812"]) {
      const registration = await api("/api/admin/register", {
        method: "POST",
        headers: jsonHeaders(),
        body: JSON.stringify({ phone, confirmPhone: phone }),
      });
      assert.equal(registration.response.status, 201, JSON.stringify(registration.payload));
    }
    const accounts = await api("/api/admin/accounts", { headers: { cookie: adminCookie } });
    const first = accounts.payload.accounts.find((item) => item.phone === "18810000811");
    const second = accounts.payload.accounts.find((item) => item.phone === "18810000812");
    assert.ok(first && second);
    subadminId = first.id;
    for (const [account, inviteCode] of [[first, "MINI811"], [second, "MINI812"]]) {
      const approved = await api("/api/admin/accounts", {
        method: "PATCH",
        headers: jsonHeaders(adminCookie),
        body: JSON.stringify({ id: account.id, status: "active", inviteCode }),
      });
      assert.equal(approved.response.status, 200, JSON.stringify(approved.payload));
    }
    const subLogin = await api("/api/admin/login", {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify({ username: "18810000811", password: "18810000811" }),
    });
    assert.equal(subLogin.response.status, 200, JSON.stringify(subLogin.payload));
    subadminCookie = (subLogin.response.headers.get("set-cookie") || "").split(";")[0];

    const creatorSeeds = [
      ["18810000821", "朝阳陶艺人", "朝阳区"],
      ["18810000822", "海淀摄影人", "海淀区"],
      ["18810000823", "东城插画人", "东城区"],
    ];
    for (const [phone, brandName, district] of creatorSeeds) {
      const created = await api("/api/admin/creators", {
        method: "POST",
        headers: jsonHeaders(adminCookie),
        body: JSON.stringify({
          action: "create",
          managerAdminId: first.id,
          phone,
          brandName,
          province: "北京市",
          city: "北京市",
          district,
        }),
      });
      assert.equal(created.response.status, 201, JSON.stringify(created.payload));
      assert.equal(created.payload.creator.district, district);
      creators.push(created.payload.creator);
    }
    const outsider = await api("/api/admin/creators", {
      method: "POST",
      headers: jsonHeaders(adminCookie),
      body: JSON.stringify({
        action: "create",
        managerAdminId: second.id,
        phone: "18810000824",
        brandName: "西城独立创作者",
        province: "北京市",
        city: "北京市",
        district: "西城区",
      }),
    });
    assert.equal(outsider.response.status, 201, JSON.stringify(outsider.payload));
    creators.push(outsider.payload.creator);

    const districtSearch = await api("/api/admin/creators", {
      method: "POST",
      headers: jsonHeaders(adminCookie),
      body: JSON.stringify({ province: "北京市", city: "北京市", district: "海淀区" }),
    });
    assert.deepEqual(districtSearch.payload.creators.map((item) => item.phone), ["18810000822"]);
  });

  await t.test("creator application requires an invite and preserves the invitation tree through approval", async () => {
    const enabled = await api("/api/admin/mini/settings", {
      method: "PATCH",
      headers: jsonHeaders(adminCookie),
      body: JSON.stringify({ creatorInvitationsEnabled: true }),
    });
    assert.equal(enabled.response.status, 200, JSON.stringify(enabled.payload));
    assert.equal(enabled.payload.settings.creatorInvitationsEnabled, true);
    const login = await api("/api/mini/auth/wechat", {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify({ code: "invited-creator-wechat-811" }),
    });
    assert.equal(login.response.status, 200, JSON.stringify(login.payload));
    const consumerToken = login.payload.session.token;
    const tags = await api("/api/tags");
    const tagId = tags.payload.tags.find((tag) => tag.category === "我的身份")?.id;
    assert.ok(tagId);
    const image = await sharp({
      create: { width: 400, height: 500, channels: 3, background: "#55b96f" },
    }).jpeg().toBuffer();
    const applicationImageForm = new FormData();
    applicationImageForm.set("file", new File([image], "creator.jpg", { type: "image/jpeg" }));
    const applicationImageResponse = await api("/api/mini/creator-application/image", {
      method: "POST",
      headers: { authorization: `Bearer ${consumerToken}` },
      body: applicationImageForm,
    });
    assert.equal(applicationImageResponse.response.status, 200, JSON.stringify(applicationImageResponse.payload));
    const applicationImage = applicationImageResponse.payload;

    const invalid = await api("/api/mini/auth/creator-register", {
      method: "POST",
      headers: jsonHeaders(consumerToken, true),
      body: JSON.stringify({
        inviteCode: "BAD811",
        phone: "18810000831",
        confirmPhone: "18810000831",
        brandName: "受邀创作者测试",
        province: "北京市",
        city: "北京市",
        district: "朝阳区",
        tagIds: [tagId],
        noBookings: true,
        representativeImageKey: applicationImage.imageKey,
        agreed: true,
        publicAuthorized: true,
        phonePublicAuthorized: true,
      }),
    });
    assert.equal(invalid.response.status, 400);
    assert.match(invalid.payload.error, /邀请码无效/);

    const unsupportedExperience = await api("/api/mini/auth/creator-register", {
      method: "POST",
      headers: jsonHeaders(consumerToken, true),
      body: JSON.stringify({
        inviteCode: creators[0].inviteCode,
        phone: "18810000831",
        confirmPhone: "18810000831",
        brandName: "受邀创作者测试",
        province: "北京市",
        city: "北京市",
        district: "朝阳区",
        tagIds: [tagId],
        noBookings: true,
        representativeImageKey: applicationImage.imageKey,
        opportunityTypes: ["快闪合作"],
        agreed: true,
        publicAuthorized: true,
        phonePublicAuthorized: true,
      }),
    });
    assert.equal(unsupportedExperience.response.status, 400);
    assert.match(unsupportedExperience.payload.error, /线下体验类型不正确/);

    const missingBrand = await api("/api/mini/auth/creator-register", {
      method: "POST",
      headers: jsonHeaders(consumerToken, true),
      body: JSON.stringify({
        inviteCode: creators[0].inviteCode,
        phone: "18810000831",
        confirmPhone: "18810000831",
        brandName: "",
        province: "北京市",
        city: "北京市",
        district: "朝阳区",
        tagIds: [tagId],
        noBookings: true,
        representativeImageKey: applicationImage.imageKey,
        agreed: true,
        publicAuthorized: true,
        phonePublicAuthorized: true,
      }),
    });
    assert.equal(missingBrand.response.status, 400);
    assert.match(missingBrand.payload.error, /品牌或工作室名称/);

    const missingDistrict = await api("/api/mini/auth/creator-register", {
      method: "POST",
      headers: jsonHeaders(consumerToken, true),
      body: JSON.stringify({
        inviteCode: creators[0].inviteCode,
        phone: "18810000831",
        confirmPhone: "18810000831",
        brandName: "受邀创作者测试",
        province: "北京市",
        city: "北京市",
        district: "",
        tagIds: [tagId],
        noBookings: true,
        representativeImageKey: applicationImage.imageKey,
        agreed: true,
        publicAuthorized: true,
        phonePublicAuthorized: true,
      }),
    });
    assert.equal(missingDistrict.response.status, 400);
    assert.match(missingDistrict.payload.error, /完整的省、市、区/);

    const submitted = await api("/api/mini/auth/creator-register", {
      method: "POST",
      headers: jsonHeaders(consumerToken, true),
      body: JSON.stringify({
        inviteCode: creators[0].inviteCode,
        phone: "18810000831",
        confirmPhone: "18810000831",
        brandName: "受邀创作者测试",
        province: "北京市",
        city: "北京市",
        district: "朝阳区",
        tagIds: [tagId],
        noBookings: true,
        opportunityTypes: ["现场体验"],
        representativeImageKey: applicationImage.imageKey,
        agreed: true,
        publicAuthorized: true,
        phonePublicAuthorized: true,
      }),
    });
    assert.equal(submitted.response.status, 201, JSON.stringify(submitted.payload));
    assert.equal(submitted.payload.applicationStatus, "pending");
    assert.deepEqual(submitted.payload.home.creator.opportunityTypes, ["现场体验"]);
    const pendingCreatorId = submitted.payload.home.creator.id;
    assert.equal(submitted.payload.home.creator.inviteCode, "");

    const relationships = await api("/api/admin/overview", { headers: { cookie: adminCookie } });
    const invited = relationships.payload.creators.find((creator) => creator.id === pendingCreatorId);
    assert.equal(invited.registeredWithCode, creators[0].inviteCode);
    assert.equal(invited.invitedByCreatorId, creators[0].id);
    assert.equal(invited.managerAdminId, subadminId);

    const approved = await api("/api/admin/workshop/creator-application", {
      method: "PATCH",
      headers: jsonHeaders(adminCookie),
      body: JSON.stringify({ creatorId: pendingCreatorId, status: "active" }),
    });
    assert.equal(approved.response.status, 200, JSON.stringify(approved.payload));
    assert.equal(approved.payload.application.status, "active");

    const roles = await api("/api/mini/me", { headers: { authorization: `Bearer ${consumerToken}` } });
    assert.equal(roles.payload.roles.creatorId, pendingCreatorId);
    assert.equal(roles.payload.roles.creatorStatus, "active");
    const switched = await api("/api/mini/auth/switch-creator", {
      method: "POST",
      headers: jsonHeaders(consumerToken, true),
    });
    assert.equal(switched.response.status, 200, JSON.stringify(switched.payload));
    assert.equal(switched.payload.status, "active");
    assert.equal(switched.payload.home.creator.registeredWithCode, creators[0].inviteCode);
    const disabled = await api("/api/admin/mini/settings", {
      method: "PATCH",
      headers: jsonHeaders(adminCookie),
      body: JSON.stringify({ creatorInvitationsEnabled: false }),
    });
    assert.equal(disabled.response.status, 200, JSON.stringify(disabled.payload));
    assert.equal(disabled.payload.settings.creatorInvitationsEnabled, false);
  });

  await t.test("admins can maintain activities and compress a dedicated cover", async () => {
    const limit = await api("/api/admin/mini/creator-settings", {
      method: "PATCH",
      headers: jsonHeaders(adminCookie),
      body: JSON.stringify({ creatorId: creators[0].id, activityLimit: 2, replyTimeoutMinutes: 30 }),
    });
    assert.equal(limit.response.status, 200, JSON.stringify(limit.payload));

    const activitySeeds = [
      [creators[0], "一起捏一只陶杯", "朝阳区", false],
      [creators[0], "一起画一只陶盘", "朝阳区", false],
      [creators[1], "在街角拍一组照片", "海淀区", true],
      [creators[2], "画一张城市速写", "东城区", false],
    ];
    for (const [creator, title, district, acceptsQidengDuringActivity] of activitySeeds) {
      const created = await api("/api/admin/mini/activity", {
        method: "POST",
        headers: jsonHeaders(adminCookie),
        body: JSON.stringify({
          creatorId: creator.id,
          title,
          shortIntro: `让${creator.brandName}陪你完成一次有趣体验`,
          description: "一场面向普通人的轻松线下体验。",
          province: "北京市",
          city: "北京市",
          district,
          address: `${district}测试地点`,
          startDate: "2027-01-01",
          endDate: "2027-12-31",
          acceptsQidengDuringActivity,
          status: "published",
          tagIds: [],
        }),
      });
      assert.equal(created.response.status, 200, JSON.stringify(created.payload));
      activities.push(created.payload.activity);
    }

    const source = await sharp({
      create: { width: 500, height: 500, channels: 3, background: "#d9a949" },
    }).jpeg().toBuffer();
    const imageForm = new FormData();
    imageForm.set("activityId", String(activities[0].id));
    imageForm.set("file", new File([source], "activity.jpg", { type: "image/jpeg" }));
    const upload = await api("/api/admin/mini/activity-image", {
      method: "POST",
      headers: { cookie: subadminCookie },
      body: imageForm,
    });
    const uploadPayload = upload.payload;
    assert.equal(upload.response.status, 200, JSON.stringify(uploadPayload));
    assert.match(uploadPayload.activity.imageUrl, /^\/api\/assets\/activities\//);
    const stored = await routeResponse(uploadPayload.activity.imageUrl);
    const metadata = await sharp(Buffer.from(await stored.arrayBuffer())).metadata();
    assert.equal(metadata.width, 1440);
    assert.equal(metadata.height, 1800);
    assert.equal(metadata.format, "webp");
  });

  await t.test("workshop admin APIs keep super-admin globals and scoped creator operations", async () => {
    const adminOverview = await api("/api/admin/overview", { headers: { cookie: adminCookie } });
    const tagId = (label) => adminOverview.payload.tags.find((tag) => tag.label === label)?.id;
    const limitedTagId = tagId("限时限量");
    const todayTagId = tagId("今日上新");
    const firstLaunchTagId = tagId("首发尝鲜");
    const featuredTagId = tagId("好评精选");
    assert.ok(limitedTagId && todayTagId && firstLaunchTagId && featuredTagId);

    const venue = await api("/api/admin/workshop/venue", {
      method: "POST",
      headers: jsonHeaders(adminCookie),
      body: JSON.stringify({
        name: "奇灯快闪体验点",
        kind: "popup",
        province: "北京市",
        city: "北京市",
        district: "朝阳区",
        businessArea: "三里屯",
        address: "测试街区 1 号",
        routeHint: "到达后按现场指引入场",
        status: "published",
      }),
    });
    assert.equal(venue.response.status, 200, JSON.stringify(venue.payload));
    assert.equal(venue.payload.venue.businessArea, "三里屯");
    workshopVenueId = venue.payload.venue.id;

    const kit = await api("/api/admin/workshop/kit", {
      method: "POST",
      headers: jsonHeaders(adminCookie),
      body: JSON.stringify({
        title: "奶油胶相框材料包",
        subtitle: "适合第一次到店自在",
        ageRange: "6 岁以上",
        durationMinutes: 60,
        priceCents: 6900,
        tagIds: [limitedTagId, featuredTagId],
        status: "published",
      }),
    });
    assert.equal(kit.response.status, 200, JSON.stringify(kit.payload));
    assert.equal(kit.payload.kit.title, "奶油胶相框材料包");
    workshopKitId = kit.payload.kit.id;

    const linked = await api("/api/admin/workshop/venue-kit", {
      method: "POST",
      headers: jsonHeaders(adminCookie),
      body: JSON.stringify({ venueId: venue.payload.venue.id, kitId: kit.payload.kit.id, available: true }),
    });
    assert.equal(linked.response.status, 200, JSON.stringify(linked.payload));
    assert.equal(linked.payload.venueKit.available, true);

    const guide = await api("/api/admin/workshop/kit-guide", {
      method: "POST",
      headers: jsonHeaders(adminCookie),
      body: JSON.stringify({ kitId: kit.payload.kit.id, stepOrder: 1, title: "核对材料", body: "按清单确认材料和公共工具。", safetyLevel: "notice" }),
    });
    assert.equal(guide.response.status, 200, JSON.stringify(guide.payload));
    assert.equal(guide.payload.guide.kitId, kit.payload.kit.id);

    const scopedGuide = await api("/api/admin/workshop/kit-guide", {
      method: "POST",
      headers: jsonHeaders(subadminCookie),
      body: JSON.stringify({ kitId: kit.payload.kit.id, stepOrder: 2, title: "开始制作", body: "按步骤完成材料组合。" }),
    });
    assert.equal(scopedGuide.response.status, 200, JSON.stringify(scopedGuide.payload));
    assert.equal(scopedGuide.payload.guide.stepOrder, 2);

    const venueRule = await api("/api/admin/workshop/venue-rule", {
      method: "POST",
      headers: jsonHeaders(subadminCookie),
      body: JSON.stringify({ venueId: venue.payload.venue.id, stepOrder: 1, title: "工具归位", body: "体验完成后清洁桌面并归还工具。" }),
    });
    assert.equal(venueRule.response.status, 200, JSON.stringify(venueRule.payload));
    assert.equal(venueRule.payload.venueRule.stepOrder, 1);

    const hour = await api("/api/admin/workshop/venue-hour", {
      method: "POST",
      headers: jsonHeaders(adminCookie),
      body: JSON.stringify({
        venueId: venue.payload.venue.id,
        weekday: 6,
        openTime: "10:30",
        closeTime: "21:30",
        note: "周末延长营业",
      }),
    });
    assert.equal(hour.response.status, 200, JSON.stringify(hour.payload));
    assert.equal(hour.payload.venueHour.weekday, 6);
    assert.equal(hour.payload.venueHour.openTime, "10:30");

    const project = await api("/api/admin/workshop/project", {
      method: "POST",
      headers: jsonHeaders(subadminCookie),
      body: JSON.stringify({
        creatorId: creators[1].id,
        oneLiner: "一起拍一组像电影剧照的周末照片",
        title: "周末街角摄影体验",
        province: "北京市",
        city: "北京市",
        district: "海淀区",
        startDate: "2027-02-14",
        endDate: "2027-02-14",
        minPeople: 1,
        maxPeople: 3,
        durationMinutes: 90,
        tagIds: [],
        status: "published",
      }),
    });
    assert.equal(project.response.status, 200, JSON.stringify(project.payload));
    assert.equal(project.payload.project.creatorId, creators[1].id);
    workshopProjectId = project.payload.project.id;
    assert.equal(project.payload.project.oneLiner, "一起拍一组像电影剧照的周末照片");
    assert.equal(project.payload.project.status, "pending");

    const blockedDirectOperationTag = await api("/api/admin/workshop/project", {
      method: "PATCH",
      headers: jsonHeaders(adminCookie),
      body: JSON.stringify({
        creatorId: creators[1].id,
        id: project.payload.project.id,
        tagIds: [firstLaunchTagId],
        status: "pending",
      }),
    });
    assert.equal(blockedDirectOperationTag.response.status, 400, JSON.stringify(blockedDirectOperationTag.payload));
    assert.match(blockedDirectOperationTag.payload.error, /单独申请并由平台审核/);

    const blockedPublish = await api("/api/admin/workshop/project", {
      method: "PATCH",
      headers: jsonHeaders(adminCookie),
      body: JSON.stringify({
        creatorId: creators[1].id,
        id: project.payload.project.id,
        status: "published",
      }),
    });
    assert.equal(blockedPublish.response.status, 400, JSON.stringify(blockedPublish.payload));
    assert.match(blockedPublish.payload.error, /体验项目封面|申请代表图/);

    const retiredContactEditor = await api("/api/admin/workshop/contact", {
      method: "POST",
      headers: jsonHeaders(subadminCookie),
      body: JSON.stringify({
        creatorId: creators[1].id,
      }),
    });
    assert.equal(retiredContactEditor.response.status, 410);
    assert.match(retiredContactEditor.payload.error, /注册手机号直接联系/);

    const schedule = await api("/api/admin/workshop/project-schedule", {
      method: "POST",
      headers: jsonHeaders(subadminCookie),
      body: JSON.stringify({
        projectId: project.payload.project.id,
        availableDate: "2027-02-14",
        startTime: "14:00",
        endTime: "16:00",
        status: "open",
        note: "情人节限定体验",
      }),
    });
    assert.equal(schedule.response.status, 200, JSON.stringify(schedule.payload));
    assert.equal(schedule.payload.schedule.availableDate, "2027-02-14");
    assert.equal(schedule.payload.schedule.status, "open");
    assert.equal("capacity" in schedule.payload.schedule, false);
    assert.equal("reservedCount" in schedule.payload.schedule, false);

    const banner = await api("/api/admin/workshop/homepage-banner", {
      method: "POST",
      headers: jsonHeaders(adminCookie),
      body: JSON.stringify({
        title: "本周末来工坊试着玩",
        subtitle: "自在和结伴都在这里",
        linkType: "kit",
        linkValue: String(kit.payload.kit.id),
        city: "北京市",
      }),
    });
    assert.equal(banner.response.status, 200, JSON.stringify(banner.payload));

    const slot = await api("/api/admin/workshop/homepage-slot", {
      method: "POST",
      headers: jsonHeaders(adminCookie),
      body: JSON.stringify({
        slotKey: "new_today",
        contentType: "project",
        contentId: project.payload.project.id,
        titleOverride: "今日上新摄影体验",
      }),
    });
    assert.equal(slot.response.status, 200, JSON.stringify(slot.payload));
    assert.equal(slot.payload.slot.slotKey, "new_today");

    const workshopImage = await sharp({
      create: { width: 900, height: 900, channels: 3, background: "#64b878" },
    }).jpeg().toBuffer();
    for (const [kind, id, cookie] of [
      ["venue", venue.payload.venue.id, adminCookie],
      ["kit", kit.payload.kit.id, adminCookie],
      ["banner", banner.payload.banner.id, adminCookie],
      ["project", project.payload.project.id, subadminCookie],
    ]) {
      const form = new FormData();
      form.set("kind", kind);
      form.set("id", String(id));
      form.set("file", new File([workshopImage], `${kind}.jpg`, { type: "image/jpeg" }));
      const upload = await api("/api/admin/workshop/image", {
        method: "POST",
        headers: { cookie },
        body: form,
      });
      const uploadPayload = upload.payload;
      assert.equal(upload.response.status, 200, JSON.stringify(uploadPayload));
      assert.match(uploadPayload.url, /^\/api\/assets\/workshop\//);
    }

    const database = await import("../lib/database.ts");
    const applicationConsumerId = Number(database.run(
      "INSERT INTO consumer_accounts(openid, nickname, phone) VALUES (?, ?, ?)",
      "workshop-project-owner-811",
      "摄影新遇官",
      creators[1].phone,
    ).lastInsertRowid);
    database.run(
      `INSERT INTO creator_applications(
        creator_id, consumer_id, status, phone, brand_name, province, city, district,
        public_authorized, consent_at, phone_public_authorized, phone_consent_at
       ) VALUES (?, ?, 'active', ?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP, 1, CURRENT_TIMESTAMP)`,
      creators[1].id,
      applicationConsumerId,
      creators[1].phone,
      creators[1].brandName,
      creators[1].province,
      creators[1].city,
      creators[1].district,
    );

    const republishedAfterImage = await api("/api/admin/workshop/project", {
      method: "PATCH",
      headers: jsonHeaders(adminCookie),
      body: JSON.stringify({ creatorId: creators[1].id, id: project.payload.project.id, status: "published" }),
    });
    assert.equal(republishedAfterImage.response.status, 200, JSON.stringify(republishedAfterImage.payload));
    assert.equal(republishedAfterImage.payload.project.status, "published");

    const miniProgram = await import("../lib/mini-program.ts");
    const firstLaunchRequest = miniProgram.submitProjectOperationRequest(creators[1].id, {
      projectId: project.payload.project.id,
      requestType: "first_launch",
      ruleAcknowledged: true,
      reason: "这是首次在奇灯公开发布的原创摄影体验",
    });
    assert.equal(firstLaunchRequest.status, "pending");
    const approvedFirstLaunch = await api("/api/admin/workshop/project-operation", {
      method: "PATCH",
      headers: jsonHeaders(subadminCookie),
      body: JSON.stringify({ id: firstLaunchRequest.id, status: "approved" }),
    });
    assert.equal(approvedFirstLaunch.response.status, 200, JSON.stringify(approvedFirstLaunch.payload));
    assert.equal(approvedFirstLaunch.payload.request.status, "approved");

    const blockedImage = new FormData();
    blockedImage.set("kind", "kit");
    blockedImage.set("id", String(kit.payload.kit.id));
    blockedImage.set("file", new File([workshopImage], "blocked.jpg", { type: "image/jpeg" }));
    const blockedUpload = await api("/api/admin/workshop/image", {
      method: "POST",
      headers: { cookie: subadminCookie },
      body: blockedImage,
    });
    assert.equal(blockedUpload.response.status, 403);

    const subGlobalBlocked = await api("/api/admin/workshop/kit", {
      method: "POST",
      headers: jsonHeaders(subadminCookie),
      body: JSON.stringify({ title: "越权材料包" }),
    });
    assert.equal(subGlobalBlocked.response.status, 403);

    const subHourBlocked = await api("/api/admin/workshop/venue-hour", {
      method: "POST",
      headers: jsonHeaders(subadminCookie),
      body: JSON.stringify({ venueId: venue.payload.venue.id, weekday: 1, openTime: "10:00", closeTime: "18:00" }),
    });
    assert.equal(subHourBlocked.response.status, 403);

    const subOutsiderBlocked = await api("/api/admin/workshop/project", {
      method: "POST",
      headers: jsonHeaders(subadminCookie),
      body: JSON.stringify({
        creatorId: creators[3].id,
        oneLiner: "越权项目",
        province: "北京市",
        city: "北京市",
      }),
    });
    assert.equal(subOutsiderBlocked.response.status, 403);

    const overview = await api("/api/admin/workshop/overview", { headers: { cookie: adminCookie } });
    assert.equal(overview.response.status, 200, JSON.stringify(overview.payload));
    assert.equal(overview.payload.metrics.venues, 1);
    assert.equal(overview.payload.metrics.kits, 1);
    assert.equal(overview.payload.metrics.projects, 1);
    assert.equal("onlineCreators" in overview.payload.metrics, false);
    assert.equal(overview.payload.venueHours.length, 1);
    assert.equal(overview.payload.venueKits.length, 1);
    assert.equal(overview.payload.kitGuides.length, 2);
    assert.equal(overview.payload.venueRules.length, 1);
    assert.equal(overview.payload.projects[0].schedules.length, 1);
    const scopedWorkshopOverview = await api("/api/admin/workshop/overview", { headers: { cookie: subadminCookie } });
    assert.equal(scopedWorkshopOverview.response.status, 200, JSON.stringify(scopedWorkshopOverview.payload));
    assert.equal("onlineCreators" in scopedWorkshopOverview.payload.metrics, false);
    assert.ok(scopedWorkshopOverview.payload.projects.every((item) => item.creatorId !== creators[3].id));

    const publicHome = await api("/api/mini/workshop/home?city=%E5%8C%97%E4%BA%AC%E5%B8%82");
    assert.equal(publicHome.response.status, 200, JSON.stringify(publicHome.payload));
    assert.equal(publicHome.payload.banners.length, 1);
    assert.equal(publicHome.payload.banners[0].path, `/pages/kit-detail/kit-detail?id=${kit.payload.kit.id}`);
    assert.equal(publicHome.payload.slots.new_today.length, 1);
    assert.equal(publicHome.payload.slots.new_today[0].path, `/pages/project-detail/project-detail?id=${project.payload.project.id}`);
    assert.equal(publicHome.payload.slots.limited[0].path, `/pages/kit-detail/kit-detail?id=${kit.payload.kit.id}`);
    assert.equal(publicHome.payload.slots.first_launch[0].path, `/pages/project-detail/project-detail?id=${project.payload.project.id}`);
    assert.equal(publicHome.payload.slots.featured[0].path, `/pages/kit-detail/kit-detail?id=${kit.payload.kit.id}`);
    assert.equal(publicHome.payload.intentEntries.includes("带孩子玩"), true);
    assert.equal(publicHome.payload.discoveryCount, 2);
    assert.doesNotMatch(JSON.stringify(publicHome.payload), /18810000822/);

    const discoverySequence = [];
    for (let index = 0; index < 4; index += 1) {
      const discovery = await api("/api/mini/workshop/discovery", {
        method: "POST",
        headers: jsonHeaders(),
        body: JSON.stringify({ guestId: "workshop-discovery-guest", city: "北京市" }),
      });
      assert.equal(discovery.response.status, 201, JSON.stringify(discovery.payload));
      assert.ok(["kit", "project"].includes(discovery.payload.draw.contentType));
      assert.match(discovery.payload.draw.key, /^(kit|project):/);
      discoverySequence.push(discovery.payload.draw.key);
    }
    assert.equal(new Set(discoverySequence.slice(0, 2)).size, 2, JSON.stringify(discoverySequence));
    for (let index = 1; index < discoverySequence.length; index += 1)
      assert.notEqual(discoverySequence[index], discoverySequence[index - 1]);

    const emptyDiscovery = await api("/api/mini/workshop/discovery", {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify({ guestId: "empty-discovery-guest", city: "拉萨市" }),
    });
    assert.equal(emptyDiscovery.response.status, 400);
    assert.match(emptyDiscovery.payload.error, /还没有可以探照的奇遇/);

    const publicSelfPlay = await api("/api/mini/workshop/self-play?city=%E5%8C%97%E4%BA%AC%E5%B8%82&businessArea=%E4%B8%89%E9%87%8C%E5%B1%AF");
    assert.equal(publicSelfPlay.response.status, 200, JSON.stringify(publicSelfPlay.payload));
    assert.equal(publicSelfPlay.payload.venues.length, 1);
    assert.equal(publicSelfPlay.payload.venueKits[0].kitId, kit.payload.kit.id);
    assert.equal(publicSelfPlay.payload.venueKits[0].available, true);

    const publicCompanion = await api("/api/mini/workshop/companion?city=%E5%8C%97%E4%BA%AC%E5%B8%82&date=2027-02-14");
    assert.equal(publicCompanion.response.status, 200, JSON.stringify(publicCompanion.payload));
    const publicProject = publicCompanion.payload.projects.find((item) => item.id === workshopProjectId);
    assert.equal(publicProject?.id, workshopProjectId, JSON.stringify(publicCompanion.payload));
    assert.equal("presenceStatus" in publicProject, false);
    assert.doesNotMatch(JSON.stringify(publicCompanion.payload), /18810000822/);

    const venueDetail = await api(`/api/mini/workshop/venues/${venue.payload.venue.id}`);
    assert.equal(venueDetail.response.status, 200, JSON.stringify(venueDetail.payload));
    assert.equal(venueDetail.payload.venue.id, venue.payload.venue.id);
    assert.equal(venueDetail.payload.venueKits[0].kitId, kit.payload.kit.id);

    const kitDetail = await api(`/api/mini/workshop/kits/${kit.payload.kit.id}?venueId=${venue.payload.venue.id}`);
    assert.equal(kitDetail.response.status, 200, JSON.stringify(kitDetail.payload));
    assert.equal(kitDetail.payload.selectedVenueKit.venueId, venue.payload.venue.id);
    assert.match(kitDetail.payload.openingLabel, /营业时间|10:30/);

    const projectDetail = await api(`/api/mini/workshop/projects/${project.payload.project.id}`);
    assert.equal(projectDetail.response.status, 200, JSON.stringify(projectDetail.payload));
    assert.equal(projectDetail.payload.project.oneLiner, "一起拍一组像电影剧照的周末照片");
    assert.equal(projectDetail.payload.recommendedContact, null);
    assert.deepEqual(projectDetail.payload.phoneContact, { available: true, maskedPhone: "188****0822" });
    assert.doesNotMatch(JSON.stringify(projectDetail.payload), /18810000822/);
    const anonymousContact = await api("/api/mini/workshop/contact", {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify({ projectId: project.payload.project.id, guestId: "anonymous-workshop-consumer" }),
    });
    assert.equal(anonymousContact.response.status, 401);

    const consumerLogin = await api("/api/mini/auth/wechat", {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify({ code: "workshop-consumer" }),
    });
    assert.equal(consumerLogin.response.status, 200, JSON.stringify(consumerLogin.payload));
    const directContact = await api("/api/mini/workshop/contact", {
      method: "POST",
      headers: jsonHeaders(consumerLogin.payload.session.token, true),
      body: JSON.stringify({ projectId: project.payload.project.id, guestId: "workshop-consumer" }),
    });
    assert.equal(directContact.response.status, 200, JSON.stringify(directContact.payload));
    assert.equal(directContact.payload.phone, "18810000822");
    assert.match(directContact.payload.reminder, /通过奇灯小程序发现/);
    assert.equal(database.one("SELECT COUNT(*) AS count FROM phone_contact_view_events WHERE project_id = ?", project.payload.project.id).count, 1);
    const workshopThread = await api("/api/mini/consultations", {
      method: "POST",
      headers: jsonHeaders(consumerLogin.payload.session.token, true),
      body: JSON.stringify({ kind: "creator", workshopProjectId: project.payload.project.id }),
    });
    assert.equal(workshopThread.response.status, 410, JSON.stringify(workshopThread.payload));
    assert.match(workshopThread.payload.error, /在线咨询已关闭/);
  });

  await t.test("draws are random, creator-balanced, and do not repeat consecutively", async () => {
    const sequence = [];
    for (let index = 0; index < 9; index += 1) {
      const result = await api("/api/mini/draw", {
        method: "POST",
        headers: jsonHeaders(),
        body: JSON.stringify({
          guestId: "fair-random-guest",
          city: "北京市",
          district: "",
          dateIntent: "any",
        }),
      });
      assert.equal(result.response.status, 201, JSON.stringify(result.payload));
      sequence.push(result.payload.draw.activity.creatorId);
    }
    assert.equal(new Set(sequence.slice(0, 3)).size, 3);
    for (let index = 1; index < sequence.length; index += 1)
      assert.notEqual(sequence[index], sequence[index - 1], "the same creator should not appear twice in a row");
    const counts = [...sequence.reduce((map, id) => map.set(id, (map.get(id) || 0) + 1), new Map()).values()];
    assert.equal(counts.length, 3);
    assert.ok(Math.max(...counts) - Math.min(...counts) <= 1, JSON.stringify(sequence));

    for (let index = 0; index < 4; index += 1) {
      const result = await api("/api/mini/draw", {
        method: "POST",
        headers: jsonHeaders(),
        body: JSON.stringify({ guestId: "district-guest", city: "北京市", district: "朝阳区", dateIntent: "any" }),
      });
      assert.equal(result.payload.draw.activity.creatorId, creators[0].id);
      assert.equal(result.payload.draw.activity.district, "朝阳区");
    }
  });

  await t.test("experience projects use direct phone contact while platform support stays static", async () => {
    const consumerLogin = await api("/api/mini/auth/wechat", {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify({ code: "mini-consumer-code-811" }),
    });
    assert.equal(consumerLogin.response.status, 200, JSON.stringify(consumerLogin.payload));
    consumerToken = consumerLogin.payload.session.token;

    const bindingDb = new DatabaseSync(path.join(dataDir, "qideng-curated-invitations.sqlite"));
    const consumerRow = bindingDb.prepare("SELECT id, openid, unionid FROM consumer_accounts WHERE id = ?").get(consumerLogin.payload.consumer.id);
    bindingDb.prepare(
      "INSERT INTO creator_wechat_bindings(creator_id, consumer_id, openid, unionid, status) VALUES (?, ?, ?, ?, 'active')",
    ).run(creators[1].id, consumerRow.id, consumerRow.openid, consumerRow.unionid || "");
    bindingDb.close();
    const creatorLogin = await api("/api/mini/auth/switch-creator", {
      method: "POST",
      headers: jsonHeaders(consumerToken, true),
    });
    assert.equal(creatorLogin.response.status, 200, JSON.stringify(creatorLogin.payload));
    creatorToken = creatorLogin.payload.session.token;

    const thread = await api("/api/mini/consultations", {
      method: "POST",
      headers: jsonHeaders(consumerToken, true),
      body: JSON.stringify({
        kind: "creator",
        activityId: activities[2].id,
        message: "周末第一次参加，需要准备什么？",
      }),
    });
    assert.equal(thread.response.status, 410, JSON.stringify(thread.payload));
    assert.match(thread.payload.error, /在线咨询已关闭/);

    const creatorConsultations = await api("/api/mini/consultations", {
      headers: { authorization: `Bearer ${creatorToken}` },
    });
    assert.equal(creatorConsultations.response.status, 403, JSON.stringify(creatorConsultations.payload));

    const feedback = await api("/api/mini/workshop/support", {
      method: "POST",
      headers: jsonHeaders(consumerToken, true),
      body: JSON.stringify({ kitId: workshopKitId, venueId: workshopVenueId, subject: "教程看不懂", body: "第一步需要更清楚的说明。" }),
    });
    assert.equal(feedback.response.status, 410, JSON.stringify(feedback.payload));
    assert.match(feedback.payload.error, /联系奇灯/);
  });

  await t.test("official online support is retired and subadmins remain scoped", async () => {
    const official = await api("/api/mini/consultations", {
      method: "POST",
      headers: jsonHeaders(consumerToken, true),
      body: JSON.stringify({ kind: "official", subject: "建议", message: "希望增加无障碍活动筛选。" }),
    });
    assert.equal(official.response.status, 410, JSON.stringify(official.payload));
    assert.match(official.payload.error, /联系奇灯/);

    const subOverview = await api("/api/admin/mini/overview", { headers: { cookie: subadminCookie } });
    assert.equal(subOverview.response.status, 200);
    assert.ok(subOverview.payload.consultations.every((item) => item.kind === "creator"));
    assert.ok(subOverview.payload.activities.every((item) => [creators[0].id, creators[1].id, creators[2].id].includes(item.creatorId)));

    const blockedReply = await api("/api/admin/mini/consultations/1", {
      method: "POST",
      headers: jsonHeaders(subadminCookie),
      body: JSON.stringify({ body: "越权回复" }),
    });
    assert.equal(blockedReply.response.status, 403);

    const adminReply = await api("/api/admin/mini/consultations/1", {
      method: "POST",
      headers: jsonHeaders(adminCookie),
      body: JSON.stringify({ body: "建议已记录，我们会在筛选规划中评估。" }),
    });
    assert.equal(adminReply.response.status, 410, JSON.stringify(adminReply.payload));

    const blockedActivity = await api("/api/admin/mini/activity", {
      method: "POST",
      headers: jsonHeaders(subadminCookie),
      body: JSON.stringify({ creatorId: creators[3].id, noPlan: true }),
    });
    assert.equal(blockedActivity.response.status, 403);

    const scopedMessages = await api("/api/admin/messages", {
      method: "POST",
      headers: jsonHeaders(subadminCookie),
      body: JSON.stringify({ creatorIds: [creators[0].id], subject: "范围内通知", body: "站内信保留，并尝试企业微信提醒。" }),
    });
    assert.equal(scopedMessages.response.status, 200, JSON.stringify(scopedMessages.payload));
    assert.equal(scopedMessages.payload.sent, 1);
    assert.equal(scopedMessages.payload.wecom.unbound, 1);

    const blockedMessages = await api("/api/admin/messages", {
      method: "POST",
      headers: jsonHeaders(subadminCookie),
      body: JSON.stringify({ creatorIds: [creators[3].id], subject: "越权通知", body: "不应发送" }),
    });
    assert.equal(blockedMessages.response.status, 403);
    const blockedExport = await api("/api/admin/export", {
      method: "POST",
      headers: jsonHeaders(subadminCookie),
      body: JSON.stringify({ creatorIds: [creators[0].id] }),
    });
    assert.equal(blockedExport.response.status, 403);

  });

  await t.test("creator home exposes profile data and unread counters", async () => {
    const home = await api("/api/mini/creator/home", {
      headers: { authorization: `Bearer ${creatorToken}` },
    });
    assert.equal(home.response.status, 200, JSON.stringify(home.payload));
    assert.equal(home.payload.home.creator.district, "海淀区");
    assert.ok(home.payload.home.activities.some((item) => item.id === activities[2].id));
    assert.equal(typeof home.payload.home.replyUnreadCount, "number");
    assert.equal(typeof home.payload.home.noticeUnreadCount, "number");
    assert.equal(home.payload.home.replyTimeoutMinutes, 120);
    assert.equal("presence" in home.payload.home, false);
    assert.equal(subadminId > 0, true);
  });

  await t.test("date-only project edits stay published while content edits return to review", async () => {
    const home = await api("/api/mini/creator/home", { headers: { authorization: `Bearer ${creatorToken}` } });
    const project = home.payload.home.projects.find((item) => item.creatorId === creators[1].id);
    assert.equal(project.status, "published");
    const ordinaryTagIds = project.tags
      .filter((tag) => !["项目运营", "平台运营"].includes(tag.category))
      .map((tag) => tag.id);
    const dateOnly = await api("/api/mini/creator/project", {
      method: "PATCH",
      headers: jsonHeaders(creatorToken, true),
      body: JSON.stringify({
        id: project.id, title: project.title, oneLiner: project.oneLiner, description: project.description,
        province: project.province, city: project.city, district: project.district, addressHint: project.addressHint,
        startDate: "2027-02-14", endDate: "2027-02-15", noPlan: false, tagIds: ordinaryTagIds,
      }),
    });
    assert.equal(dateOnly.response.status, 201, JSON.stringify(dateOnly.payload));
    assert.equal(dateOnly.payload.project.status, "published", JSON.stringify(dateOnly.payload));

    const contentEdit = await api("/api/mini/creator/project", {
      method: "PATCH",
      headers: jsonHeaders(creatorToken, true),
      body: JSON.stringify({
        id: project.id, title: project.title, oneLiner: `${project.oneLiner}（新版）`, description: project.description,
        province: project.province, city: project.city, district: project.district, addressHint: project.addressHint,
        startDate: "2027-02-14", endDate: "2027-02-15", noPlan: false, tagIds: ordinaryTagIds,
      }),
    });
    assert.equal(contentEdit.response.status, 201, JSON.stringify(contentEdit.payload));
    assert.equal(contentEdit.payload.project.status, "pending");

    const republished = await api("/api/admin/workshop/project", {
      method: "PATCH",
      headers: jsonHeaders(adminCookie),
      body: JSON.stringify({ creatorId: creators[1].id, id: project.id, status: "published" }),
    });
    assert.equal(republished.response.status, 200, JSON.stringify(republished.payload));
    assert.equal(republished.payload.project.status, "published");
  });

  await t.test("suspending a creator invalidates an existing mini-program session immediately", async () => {
    const suspended = await api("/api/admin/creators", {
      method: "PATCH",
      headers: jsonHeaders(adminCookie),
      body: JSON.stringify({ action: "setSuspended", creatorId: creators[1].id, suspended: true }),
    });
    assert.equal(suspended.response.status, 200, JSON.stringify(suspended.payload));
    const blockedHome = await api("/api/mini/creator/home", {
      headers: { authorization: `Bearer ${creatorToken}` },
    });
    assert.equal(blockedHome.response.status, 401);
    const restored = await api("/api/admin/creators", {
      method: "PATCH",
      headers: jsonHeaders(adminCookie),
      body: JSON.stringify({ action: "setSuspended", creatorId: creators[1].id, suspended: false }),
    });
    assert.equal(restored.response.status, 200, JSON.stringify(restored.payload));
  });
});
