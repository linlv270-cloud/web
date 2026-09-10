import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { after, test } from "node:test";
import { tmpdir } from "node:os";
import path from "node:path";
import JSZip from "jszip";

const dataDir = mkdtempSync(path.join(tmpdir(), "tde-profile-invite-test-"));
Object.assign(process.env, {
  DATA_DIR: dataDir,
  NODE_ENV: "test",
  QIDENG_BOOTSTRAP_INVITE_CODE: "QIDENG26",
});

const database = await import("../lib/database.ts");
const repository = await import("../lib/repository.ts");
const auth = await import("../lib/auth.ts");
const miniAuth = await import("../lib/mini-auth.ts");
const webProfile = await import("../app/api/web/profile/route.ts");
const adminCreators = await import("../app/api/admin/creators/route.ts");
const exportRoute = await import("../app/api/admin/export/route.ts");

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

test("精准邀约和品牌影响力贯通主理人、运营台筛选编辑与导出", async () => {
  const creatorId = repository.registerCreator(
    "18890000101",
    "FeaturePass-123",
    "QIDENG26",
    true,
    "北京市",
    "北京市",
  );
  repository.updateProfile(creatorId, {
    brandName: "精准邀约测试品牌",
    district: "朝阳区",
    intro: "品牌影响力接口验证",
  });

  const miniSession = miniAuth.createMiniSession("creator", creatorId);
  const creatorRequest = (body) =>
    request("/api/web/profile", {
      method: "POST",
      headers: {
        authorization: `Bearer ${miniSession.token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    });

  let result = await json(
    await webProfile.POST(
      creatorRequest({
        action: "updatePrecisionInvite",
        precisionInviteGoals: ["新品测试", "销售增长"],
        precisionInviteScenes: ["市集快闪", "行业展会"],
      }),
    ),
  );
  assert.equal(result.status, 200, JSON.stringify(result.body));

  result = await json(
    await webProfile.POST(
      creatorRequest({
        action: "updateTags",
        tagIds: [],
        opportunityTypes: [],
        precisionInviteGoals: ["新品测试"],
        precisionInviteScenes: ["KOL沙龙"],
        xiaohongshuFollowers: "12500",
        xiaohongshuUrl: "https://www.xiaohongshu.com/user/profile/test",
        douyinFollowers: "8800",
        douyinUrl: "https://www.douyin.com/user/test",
      }),
    ),
  );
  assert.equal(result.status, 200, JSON.stringify(result.body));

  result = await json(
    await webProfile.GET(
      request("/api/web/profile", {
        headers: { authorization: `Bearer ${miniSession.token}` },
      }),
    ),
  );
  assert.deepEqual(result.body.creator.precisionInviteGoals, ["新品测试"]);
  assert.deepEqual(result.body.creator.precisionInviteScenes, ["KOL沙龙"]);
  assert.equal(result.body.creator.xiaohongshuFollowers, 12500);
  assert.equal(result.body.creator.douyinFollowers, 8800);

  const adminSession = auth.createAdminSession(
    request("/api/admin/creators"),
    { id: null, role: "super", label: "测试超管" },
  );
  const adminRequest = (method, body) =>
    request("/api/admin/creators", {
      method,
      headers: {
        cookie: adminSession.cookie,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    });

  result = await json(
    await adminCreators.POST(
      adminRequest("POST", {
        precisionInviteGoal: "新品测试",
        precisionInviteScene: "KOL沙龙",
        xiaohongshuFollowersMin: "10000",
        douyinFollowersMin: "8000",
        xiaohongshuLinkStatus: "filled",
        douyinLinkStatus: "filled",
        accountStatus: "active",
      }),
    ),
  );
  assert.equal(result.status, 200, JSON.stringify(result.body));
  assert.ok(result.body.creators.some((item) => item.id === creatorId));

  result = await json(
    await adminCreators.PATCH(
      adminRequest("PATCH", {
        action: "updateDetails",
        creatorId,
        precisionInviteGoals: ["品牌推广"],
        precisionInviteScenes: ["艺术展览"],
        xiaohongshuFollowers: "13000",
        xiaohongshuUrl: "https://www.xiaohongshu.com/user/profile/edited",
        douyinFollowers: "9100",
        douyinUrl: "https://www.douyin.com/user/edited",
        adminRating: "good",
        adminNote: "影响力已复核",
      }),
    ),
  );
  assert.equal(result.status, 200, JSON.stringify(result.body));
  const edited = repository.getCreator(creatorId);
  assert.deepEqual(edited.precisionInviteGoals, ["品牌推广"]);
  assert.deepEqual(edited.precisionInviteScenes, ["艺术展览"]);
  assert.equal(edited.xiaohongshuFollowers, 13000);
  assert.equal(edited.douyinFollowers, 9100);

  const exportResponse = await exportRoute.POST(
    request("/api/admin/export", {
      method: "POST",
      headers: {
        cookie: adminSession.cookie,
        "content-type": "application/json",
      },
      body: JSON.stringify({ creatorIds: [creatorId] }),
    }),
  );
  assert.equal(exportResponse.status, 200);
  const zip = await JSZip.loadAsync(await exportResponse.arrayBuffer());
  const csv = await zip.file("汇总表.csv").async("string");
  const profilePath = Object.keys(zip.files).find((name) =>
    name.endsWith("/用户资料.txt"),
  );
  assert.ok(profilePath);
  const profile = await zip.file(profilePath).async("string");
  for (const value of [
    "精准邀约-合作目标",
    "精准邀约-期待场景",
    "小红书粉丝数",
    "抖音链接",
    "品牌推广",
    "艺术展览",
    "13000",
    "9100",
  ])
    assert.match(`${csv}\n${profile}`, new RegExp(value));
});
