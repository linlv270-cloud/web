import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, test } from "node:test";
import JSZip from "jszip";

const dataDir = mkdtempSync(path.join(tmpdir(), "qideng-permissions-test-"));
process.env.DATA_DIR = dataDir;
process.env.NODE_ENV = "production";
delete process.env.QIDENG_BOOTSTRAP_INVITE_CODE;

const database = await import("../lib/database.ts");
const repository = await import("../lib/repository.ts");
const auth = await import("../lib/auth.ts");
const miniAuth = await import("../lib/mini-auth.ts");
const miniProgram = await import("../lib/mini-program.ts");
const inviteRoute = await import("../app/api/admin/invites/route.ts");
const exportRoute = await import("../app/api/admin/export/route.ts");

after(() => {
  database.getDb().close();
  rmSync(dataDir, { recursive: true, force: true });
});

function request(pathname, init = {}) {
  return new Request(`http://localhost${pathname}`, init);
}

test("invitation trees and administrator boundaries remain enforced without an HTTP server", async () => {
  assert.equal(database.one("SELECT id FROM invite_codes WHERE code = 'QIDENG26'"), null);

  const firstManager = repository.registerAdminAccount("18820000901", "18820000901");
  repository.updateAdminAccount(firstManager.id, "active", "TEAM901", "超级管理员");
  const secondManager = repository.registerAdminAccount("18820000902", "18820000902");
  repository.updateAdminAccount(secondManager.id, "active", "TEAM902", "超级管理员");

  const directId = repository.registerCreator(
    "18820000911",
    "CreatorTest911!",
    "team901",
    false,
    "北京市",
    "北京市",
  );
  const direct = repository.getCreator(directId);
  assert.ok(direct);
  assert.equal(direct.managerAdminId, firstManager.id);
  assert.equal(direct.invitedByCreatorId, null);
  assert.match(direct.inviteCode, /^[2-9A-HJ-NP-Z]{6}$/);
  assert.throws(
    () => database.run("INSERT INTO invite_codes(code, source, active) VALUES (?, 'platform', 1)", direct.inviteCode),
    /邀请码已存在/,
  );
  assert.throws(
    () => database.run("UPDATE creators SET invite_code = ? WHERE id = ?", "TEAM902", directId),
    /邀请码已存在/,
  );

  const descendantId = repository.registerCreator(
    "18820000912",
    "CreatorTest912!",
    direct.inviteCode,
    false,
    "北京市",
    "北京市",
  );
  const descendant = repository.getCreator(descendantId);
  assert.equal(descendant.managerAdminId, firstManager.id);
  assert.equal(descendant.invitedByCreatorId, directId);
  assert.equal(repository.getCreator(directId).copyQuota.freeLimit, 5);
  assert.equal(repository.getCreator(directId).copyQuota.upgradeLimit, 5);

  const outsiderId = repository.registerCreator(
    "18820000913",
    "CreatorTest913!",
    "TEAM902",
    false,
    "北京市",
    "北京市",
  );
  const scopedWorkshop = miniProgram.workshopAdminOverview({
    id: firstManager.id,
    role: "subadmin",
    label: firstManager.phone,
  });
  assert.equal("onlineCreators" in scopedWorkshop.metrics, false);
  assert.equal("onlineCreators" in miniProgram.workshopAdminOverview({ id: null, role: "super", label: "超级管理员" }).metrics, false);

  const subSession = auth.createAdminSession(request("/api/admin/invites"), {
    id: firstManager.id,
    role: "subadmin",
    label: firstManager.phone,
  });
  const deniedInviteManagement = await inviteRoute.POST(request("/api/admin/invites", {
    method: "POST",
    headers: { cookie: subSession.cookie, "content-type": "application/json" },
    body: JSON.stringify({ code: "NOPE901" }),
  }));
  assert.equal(deniedInviteManagement.status, 403);
  const deniedExport = await exportRoute.POST(request("/api/admin/export", {
    method: "POST",
    headers: { cookie: subSession.cookie, "content-type": "application/json" },
    body: JSON.stringify({ creatorIds: [directId] }),
  }));
  assert.equal(deniedExport.status, 403);

  const creatorSession = auth.createCreatorSession(directId, request("/api/auth/me"));
  const miniSession = miniAuth.createMiniSession("creator", directId);
  assert.equal(auth.creatorIdFromRequest(request("/api/auth/me", { headers: { cookie: creatorSession.cookie } })), directId);
  assert.equal(miniAuth.miniPrincipalFromRequest(request("/api/mini/creator/home", {
    headers: { authorization: `Bearer ${miniSession.token}` },
  }))?.actorId, directId);
  repository.setManagedCreatorSuspended(directId, true, "超级管理员");
  assert.equal(auth.creatorIdFromRequest(request("/api/auth/me", { headers: { cookie: creatorSession.cookie } })), null);
  assert.equal(miniAuth.miniPrincipalFromRequest(request("/api/mini/creator/home", {
    headers: { authorization: `Bearer ${miniSession.token}` },
  })), null);
  repository.setManagedCreatorSuspended(directId, false, "超级管理员");

  const consumerId = Number(database.run(
    "INSERT INTO consumer_accounts(openid, nickname) VALUES (?, ?)",
    "permissions-consumer",
    "权限测试用户",
  ).lastInsertRowid);
  const creatorThreadId = Number(database.run(
    `INSERT INTO consultation_threads(reference, kind, consumer_id, creator_id, status, subject, reply_timeout_minutes)
     VALUES ('ZXPERM01', 'creator', ?, ?, 'waiting', '普通创作者咨询', 120)`,
    consumerId,
    directId,
  ).lastInsertRowid);
  const officialThreadId = Number(database.run(
    `INSERT INTO consultation_threads(reference, kind, consumer_id, status, subject, reply_timeout_minutes)
     VALUES ('ZXPERM02', 'official', ?, 'waiting', '平台官方咨询', 120)`,
    consumerId,
  ).lastInsertRowid);
  const superPrincipal = { id: null, role: "super", label: "超级管理员" };
  assert.throws(
    () => miniProgram.adminReplyConsultation(superPrincipal, creatorThreadId, "越权代答"),
    /只能回复平台官方咨询/,
  );
  assert.equal(
    miniProgram.adminReplyConsultation(superPrincipal, officialThreadId, "平台已收到").messages.at(-1).body,
    "平台已收到",
  );

  repository.updateAdminAccount(firstManager.id, "suspended", "TEAM901", "超级管理员");
  assert.equal(repository.validateInviteCode("TEAM901"), false);
  assert.equal(repository.validateInviteCode(direct.inviteCode), false);
  assert.throws(
    () => repository.registerCreator(
      "18820000914",
      "CreatorTest914!",
      direct.inviteCode,
      false,
      "北京市",
      "北京市",
    ),
    /邀请码无效/,
  );
  assert.equal(repository.loginCreator("18820000911", "CreatorTest911!"), directId);
  assert.equal(auth.adminPrincipalFromRequest(request("/api/admin/overview", {
    headers: { cookie: subSession.cookie },
  })), null);

  const superSession = auth.createAdminSession(request("/api/admin/export"), superPrincipal);
  const exported = await exportRoute.POST(request("/api/admin/export", {
    method: "POST",
    headers: { cookie: superSession.cookie, "content-type": "application/json" },
    body: JSON.stringify({ creatorIds: [directId] }),
  }));
  assert.equal(exported.status, 200);
  const archive = await JSZip.loadAsync(Buffer.from(await exported.arrayBuffer()));
  const summary = await archive.file("汇总表.csv").async("string");
  assert.match(summary, /微信ID/);
  assert.match(summary, /社交账号/);
});
