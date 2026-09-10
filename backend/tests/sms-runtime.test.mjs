import assert from "node:assert/strict";
import { after, test } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const dataDir = mkdtempSync(path.join(tmpdir(), "qideng-sms-test-"));
Object.assign(process.env, {
  NODE_ENV: "test",
  DATA_DIR: dataDir,
  ADMIN_USERNAME: "sms-test-admin",
  ADMIN_PASSWORD: "SmsRuntimeTest-826!",
  SMS_ENABLED: "false",
  SMS_MOCK_CODE: "654321",
  ALIYUN_SMS_ACCESS_KEY_ID: "",
  ALIYUN_SMS_ACCESS_KEY_SECRET: "",
  SMS_VERIFICATION_SIGN_NAME: "",
  SMS_VERIFICATION_TEMPLATE_CODE: "",
});

const repository = await import("../lib/repository.ts");
const sms = await import("../lib/sms.ts");
const publicSettings = await import("../lib/public-settings.ts");

const initial = repository.getPlatformSettings();
repository.updatePlatformSettings({
  sms: {
    ...initial.sms,
    enabled: true,
    signName: "",
    verificationTemplateCode: "",
  },
});

after(async () => {
  const database = await import("../lib/database.ts");
  database.getDb().close();
  rmSync(dataDir, { recursive: true, force: true });
});

test("server SMS switch is a hard runtime gate", async () => {
  assert.equal(sms.isSmsConfigured(), false);
  assert.equal(publicSettings.getPublicPlatformSettings().sms.enabled, false);
  await assert.rejects(
    sms.sendVerificationCode("13800138000", "register", new Request("https://example.test", {
      headers: { "x-forwarded-for": "127.0.0.1" },
    })),
    /短信验证暂未开放/,
  );
});

test("development mock works only after both runtime switches are enabled", async () => {
  process.env.SMS_ENABLED = "true";
  assert.equal(sms.isSmsConfigured(), true);
  assert.equal(publicSettings.getPublicPlatformSettings().sms.enabled, true);
  await sms.sendVerificationCode("13800138001", "register", new Request("https://example.test", {
    headers: { "x-forwarded-for": "127.0.0.2" },
  }));
  assert.doesNotThrow(() => sms.consumeVerificationCode("13800138001", "register", "654321"));
});

test("approved environment values provide a fallback for empty database values", () => {
  delete process.env.SMS_MOCK_CODE;
  process.env.ALIYUN_SMS_ACCESS_KEY_ID = "LTAI5tExampleKey123456789";
  process.env.ALIYUN_SMS_ACCESS_KEY_SECRET = "ExampleSecret123456789012345678";
  process.env.SMS_VERIFICATION_SIGN_NAME = "奇灯";
  process.env.SMS_VERIFICATION_TEMPLATE_CODE = "SMS_123456789";
  assert.equal(sms.isSmsConfigured(), true);
});

test("disabling the database business switch immediately hides SMS", () => {
  const current = repository.getPlatformSettings();
  repository.updatePlatformSettings({ sms: { ...current.sms, enabled: false } });
  assert.equal(sms.isSmsConfigured(), false);
  assert.equal(publicSettings.getPublicPlatformSettings().sms.enabled, false);
});
