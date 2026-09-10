import crypto from "node:crypto";
import { one, run } from "./database";
import { getPlatformSettings } from "./repository";
import { clientAddress, hashSecret, verifySecret } from "./security";
import type { PlatformSettings } from "./types";

export type SmsPurpose = "register" | "login" | "reset";

function encode(value: string) {
  return encodeURIComponent(value)
    .replaceAll("!", "%21")
    .replaceAll("'", "%27")
    .replaceAll("(", "%28")
    .replaceAll(")", "%29")
    .replaceAll("*", "%2A");
}

function smsCredentials() {
  return {
    id: (process.env.ALIYUN_SMS_ACCESS_KEY_ID || process.env.ALIBABA_CLOUD_ACCESS_KEY_ID || "").trim(),
    secret: (process.env.ALIYUN_SMS_ACCESS_KEY_SECRET || process.env.ALIBABA_CLOUD_ACCESS_KEY_SECRET || "").trim(),
  };
}

function smsMasterEnabled() {
  return process.env.SMS_ENABLED?.trim().toLowerCase() === "true";
}

function smsMockCode() {
  if (process.env.NODE_ENV === "production") return "";
  const code = (process.env.SMS_MOCK_CODE || "").trim();
  return /^\d{6}$/.test(code) ? code : "";
}

function validCredentials(credentials: ReturnType<typeof smsCredentials>) {
  return /^[A-Za-z0-9]{16,64}$/.test(credentials.id)
    && /^[A-Za-z0-9]{24,128}$/.test(credentials.secret);
}

function validTemplateCode(value: string) {
  return /^SMS_\d{6,20}$/.test(value);
}

function smsRuntime(settings: PlatformSettings = getPlatformSettings()) {
  const credentials = smsCredentials();
  return {
    credentials,
    enabled: smsMasterEnabled() && settings.sms.enabled,
    mockCode: smsMockCode(),
    signName: settings.sms.signName.trim() || (process.env.SMS_VERIFICATION_SIGN_NAME || "").trim(),
    verificationTemplateCode: settings.sms.verificationTemplateCode.trim()
      || (process.env.SMS_VERIFICATION_TEMPLATE_CODE || "").trim(),
  };
}

export function isSmsConfigured(settings: PlatformSettings = getPlatformSettings()) {
  const runtime = smsRuntime(settings);
  return runtime.enabled && Boolean(
    runtime.mockCode
    || (
      validCredentials(runtime.credentials)
      && runtime.signName.length > 0
      && runtime.signName.length <= 20
      && validTemplateCode(runtime.verificationTemplateCode)
    ),
  );
}

async function requestAliyun(phone: string, templateCode: string, params: Record<string, string>) {
  const settings = getPlatformSettings();
  const runtime = smsRuntime(settings);
  if (!runtime.enabled) throw new Error("短信服务当前已停用");
  if (runtime.mockCode) return { requestId: "mock", mocked: true };
  if (!validCredentials(runtime.credentials) || !runtime.signName || runtime.signName.length > 20 || !validTemplateCode(templateCode))
    throw new Error("短信服务尚未完成配置");
  const query: Record<string, string> = {
    AccessKeyId: runtime.credentials.id,
    Action: "SendSms",
    Format: "JSON",
    PhoneNumbers: phone,
    RegionId: "cn-hangzhou",
    SignName: runtime.signName,
    SignatureMethod: "HMAC-SHA1",
    SignatureNonce: crypto.randomUUID(),
    SignatureVersion: "1.0",
    Timestamp: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
    Version: "2017-05-25",
    TemplateCode: templateCode,
    TemplateParam: JSON.stringify(params),
  };
  const canonical = Object.keys(query).sort().map((key) => `${encode(key)}=${encode(query[key])}`).join("&");
  const signature = crypto.createHmac("sha1", `${runtime.credentials.secret}&`)
    .update(`GET&%2F&${encode(canonical)}`)
    .digest("base64");
  const response = await fetch(`https://dysmsapi.aliyuncs.com/?Signature=${encode(signature)}&${canonical}`, {
    signal: AbortSignal.timeout(15000),
  });
  const payload = await response.json() as { Code?: string; Message?: string; RequestId?: string };
  if (!response.ok || payload.Code !== "OK")
    throw new Error(`短信发送失败：${payload.Message || payload.Code || response.status}`);
  return { requestId: payload.RequestId || "", mocked: false };
}

export async function sendVerificationCode(phone: string, purpose: SmsPurpose, request: Request) {
  const settings = getPlatformSettings();
  const runtime = smsRuntime(settings);
  if (!isSmsConfigured(settings)) throw new Error("短信验证暂未开放，请稍后再试或联系TDE");
  const ip = clientAddress(request);
  const recentPhone = one<{ count: number }>(
    "SELECT COUNT(*) AS count FROM sms_verifications WHERE phone = ? AND created_at >= datetime('now', '-60 seconds')",
    phone,
  )?.count || 0;
  const dailyPhone = one<{ count: number }>(
    "SELECT COUNT(*) AS count FROM sms_verifications WHERE phone = ? AND created_at >= datetime('now', '-1 day')",
    phone,
  )?.count || 0;
  const hourlyIp = one<{ count: number }>(
    "SELECT COUNT(*) AS count FROM sms_verifications WHERE client_ip = ? AND created_at >= datetime('now', '-1 hour')",
    ip,
  )?.count || 0;
  if (recentPhone) throw new Error("验证码发送过于频繁，请60秒后再试");
  if (dailyPhone >= 5) throw new Error("该手机号今日验证码次数已用完");
  if (hourlyIp >= 20) throw new Error("当前网络请求过于频繁，请稍后再试");

  const code = runtime.mockCode || String(crypto.randomInt(100000, 1000000));
  const deliveryId = Number(run(
    `INSERT INTO sms_deliveries(phone, purpose, template_code, status)
     VALUES (?, ?, ?, 'sending')`,
    phone,
    purpose,
    runtime.verificationTemplateCode,
  ).lastInsertRowid);
  try {
    const sent = await requestAliyun(phone, runtime.verificationTemplateCode, { code });
    const secret = hashSecret(code);
    run(
      `INSERT INTO sms_verifications(phone, purpose, code_hash, code_salt, client_ip, expires_at)
       VALUES (?, ?, ?, ?, ?, datetime('now', '+5 minutes'))`,
      phone,
      purpose,
      secret.hash,
      secret.salt,
      ip,
    );
    run(
      "UPDATE sms_deliveries SET status = 'sent', provider_request_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
      sent.requestId,
      deliveryId,
    );
    return { retryAfter: 60 };
  } catch (error) {
    run(
      "UPDATE sms_deliveries SET status = 'failed', error = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
      error instanceof Error ? error.message : String(error),
      deliveryId,
    );
    throw error;
  }
}

export function consumeVerificationCode(phone: string, purpose: SmsPurpose, code: string) {
  if (!isSmsConfigured()) throw new Error("短信验证暂未开放，请稍后再试或联系TDE");
  const row = one<{
    id: number;
    code_hash: string;
    code_salt: string;
    attempts: number;
    expired: number;
  }>(
    `SELECT id, code_hash, code_salt, attempts,
      CASE WHEN datetime(expires_at) <= CURRENT_TIMESTAMP THEN 1 ELSE 0 END AS expired
     FROM sms_verifications
     WHERE phone = ? AND purpose = ? AND consumed_at IS NULL
     ORDER BY id DESC LIMIT 1`,
    phone,
    purpose,
  );
  if (!row) throw new Error("请先获取短信验证码");
  if (row.expired) throw new Error("验证码已过期，请重新获取");
  if (row.attempts >= 5) throw new Error("验证码错误次数过多，请重新获取");
  if (!/^\d{6}$/.test(code) || !verifySecret(code, row.code_salt, row.code_hash)) {
    run("UPDATE sms_verifications SET attempts = attempts + 1 WHERE id = ?", row.id);
    throw new Error("短信验证码不正确");
  }
  run("UPDATE sms_verifications SET consumed_at = CURRENT_TIMESTAMP WHERE id = ?", row.id);
}

export async function sendNotificationSms(input: {
  creatorId: number;
  campaignId: number;
  phone: string;
  typeKey: string;
}) {
  const settings = getPlatformSettings();
  const type = settings.sms.notificationTypes.find((item) => item.key === input.typeKey);
  if (!smsMasterEnabled() || !settings.sms.enabled || !type?.enabled || !type.smsEnabled || !validTemplateCode(type.templateCode))
    throw new Error("该通知类型未启用短信或模板尚未审核");
  const deliveryId = Number(run(
    `INSERT INTO sms_deliveries(creator_id, campaign_id, phone, purpose, template_code, status)
     VALUES (?, ?, ?, ?, ?, 'sending')`,
    input.creatorId,
    input.campaignId,
    input.phone,
    input.typeKey,
    type.templateCode,
  ).lastInsertRowid);
  try {
    const site = process.env.PUBLIC_SITE_URL || "https://thedesignexpo.org.cn";
    const sent = await requestAliyun(input.phone, type.templateCode, { url: `${site}${type.linkPath}` });
    run("UPDATE sms_deliveries SET status = 'sent', provider_request_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", sent.requestId, deliveryId);
    return true;
  } catch (error) {
    run("UPDATE sms_deliveries SET status = 'failed', error = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", error instanceof Error ? error.message : String(error), deliveryId);
    return false;
  }
}
