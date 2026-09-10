import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, test } from "node:test";

const dataDir = mkdtempSync(path.join(tmpdir(), "qideng-wecom-test-"));
Object.assign(process.env, {
  DATA_DIR: dataDir,
  NODE_ENV: "production",
  WECOM_CORP_ID: "ww02dc21aceaae88af",
  WECOM_DIRECTORY_SECRET: "directory-secret",
  WECOM_APP_AGENT_ID: "1000042",
  WECOM_APP_SECRET: "application-secret",
});

const originalFetch = globalThis.fetch;
const requests = [];
let failDirectoryLookup = false;
globalThis.fetch = async (input, init = {}) => {
  const url = new URL(String(input));
  const body = init.body ? JSON.parse(String(init.body)) : null;
  requests.push({ pathname: url.pathname, body });
  const response = (payload) => new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
  if (url.pathname.endsWith("/gettoken"))
    return response({ errcode: 0, errmsg: "ok", access_token: `token-${url.searchParams.get("corpsecret")}`, expires_in: 7200 });
  if (url.pathname.endsWith("/user/getuserid")) {
    if (failDirectoryLookup) return response({ errcode: 60111, errmsg: "user not found" });
    return response({ errcode: 0, errmsg: "ok", userid: "creator_a_userid" });
  }
  if (url.pathname.endsWith("/message/send"))
    return response({ errcode: 0, errmsg: "ok", msgid: "wecom-message-1", invaliduser: "" });
  throw new Error(`Unexpected WeCom request: ${url.pathname}`);
};

const database = await import("../lib/database.ts");
const repository = await import("../lib/repository.ts");
const auth = await import("../lib/auth.ts");
const bindingRoute = await import("../app/api/admin/wecom/bindings/route.ts");
const messagesRoute = await import("../app/api/admin/messages/route.ts");

after(() => {
  globalThis.fetch = originalFetch;
  database.getDb().close();
  rmSync(dataDir, { recursive: true, force: true });
});

function request(pathname, init = {}) {
  return new Request(`http://localhost${pathname}`, init);
}

async function json(response) {
  return { status: response.status, body: await response.json() };
}

function bodyRequest(pathname, cookie, body) {
  return request(pathname, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

test("Enterprise WeChat notification binding stays scoped and does not create consumer service accounts", async () => {
  const managerA = repository.registerAdminAccount("18870000101", "18870000101");
  repository.updateAdminAccount(managerA.id, "active", "WECOMA1", "超级管理员");
  const managerB = repository.registerAdminAccount("18870000102", "18870000102");
  repository.updateAdminAccount(managerB.id, "active", "WECOMB1", "超级管理员");
  const creatorA = repository.createManagedCreator(managerA.id, { phone: "18870000111", brandName: "奇灯陶艺新遇官" }, "超级管理员");
  const creatorB = repository.createManagedCreator(managerB.id, { phone: "18870000112", brandName: "奇灯摄影新遇官" }, "超级管理员");
  const managerPrincipal = { id: managerA.id, role: "subadmin", label: managerA.phone };
  const managerSession = auth.createAdminSession(request("/api/admin/wecom/bindings"), managerPrincipal);

  const approved = await json(await bindingRoute.POST(bodyRequest("/api/admin/wecom/bindings", managerSession.cookie, {
    creatorId: creatorA.id,
    action: "approve",
  })));
  assert.equal(approved.status, 200, JSON.stringify(approved.body));
  assert.equal(approved.body.binding.status, "approved");
  assert.equal(approved.body.binding.wecomUserId, "creator_a_userid");
  assert.equal(approved.body.binding.openKfid, "");
  assert.equal(approved.body.binding.contactUrl, "");
  assert.equal(database.one("SELECT COUNT(*) AS count FROM creator_contact_channels WHERE creator_id = ?", creatorA.id).count, 0);

  failDirectoryLookup = true;
  const failedRebind = await json(await bindingRoute.POST(bodyRequest("/api/admin/wecom/bindings", managerSession.cookie, {
    creatorId: creatorA.id,
    action: "rebind",
  })));
  failDirectoryLookup = false;
  assert.equal(failedRebind.status, 400);
  const preserved = database.one("SELECT status, wecom_user_id, last_error FROM creator_wecom_bindings WHERE creator_id = ?", creatorA.id);
  assert.equal(preserved.status, "approved");
  assert.equal(preserved.wecom_user_id, "creator_a_userid");
  assert.match(preserved.last_error, /user not found/);
  assert.equal(database.one("SELECT action FROM creator_wecom_binding_audit WHERE creator_id = ? ORDER BY id DESC LIMIT 1", creatorA.id).action, "rebind_failed");

  const outOfScope = await json(await bindingRoute.POST(bodyRequest("/api/admin/wecom/bindings", managerSession.cookie, {
    creatorId: creatorB.id,
    action: "approve",
  })));
  assert.equal(outOfScope.status, 403);

  const sent = await json(await messagesRoute.POST(bodyRequest("/api/admin/messages", managerSession.cookie, {
    creatorIds: [creatorA.id],
    subject: "项目提醒",
    body: "请在站内通知查看本周项目安排。",
  })));
  assert.equal(sent.status, 200, JSON.stringify(sent.body));
  assert.equal(sent.body.sent, 1);
  assert.deepEqual(sent.body.wecom, { requested: 1, sent: 1, failed: 0, unbound: 0 });
  const delivery = database.one("SELECT status, provider_message_id FROM wecom_notification_deliveries WHERE campaign_id = ?", sent.body.notification.id);
  assert.deepEqual(delivery, { status: "sent", provider_message_id: "wecom-message-1" });

  const subadminDelete = await json(await bindingRoute.POST(bodyRequest("/api/admin/wecom/bindings", managerSession.cookie, {
    creatorId: creatorA.id,
    action: "delete",
  })));
  assert.equal(subadminDelete.status, 403);

  const disabled = await json(await bindingRoute.POST(bodyRequest("/api/admin/wecom/bindings", managerSession.cookie, {
    creatorId: creatorA.id,
    action: "disable",
  })));
  assert.equal(disabled.status, 200, JSON.stringify(disabled.body));
  assert.equal(disabled.body.binding.status, "disabled");
  assert.ok(requests.some((item) => item.pathname.endsWith("/user/getuserid")));
  assert.ok(requests.some((item) => item.pathname.endsWith("/message/send")));
  assert.equal(requests.some((item) => item.pathname.includes("/kf/")), false);
  assert.equal(requests.some((item) => item.pathname.endsWith("/media/upload")), false);
});
