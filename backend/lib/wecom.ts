import crypto from "node:crypto";

type WecomTokenKind = "directory" | "application";

type TokenCacheEntry = {
  token: string;
  expiresAt: number;
};

const tokenCache = new Map<string, TokenCacheEntry>();

function env(name: string) {
  return String(process.env[name] || "").trim();
}

function corpId() {
  return env("WECOM_CORP_ID") || env("WORKSHOP_WECOM_CORP_ID");
}

function secretFor(kind: WecomTokenKind) {
  if (kind === "directory") return env("WECOM_DIRECTORY_SECRET") || env("WECOM_APP_SECRET");
  return env("WECOM_APP_SECRET");
}

function agentId() {
  return Number(env("WECOM_APP_AGENT_ID") || 0);
}

function configured(kind: WecomTokenKind) {
  return /^ww[A-Za-z0-9]{16,30}$/.test(corpId()) && Boolean(secretFor(kind));
}

export function wecomRuntimeStatus() {
  return {
    corpIdConfigured: /^ww[A-Za-z0-9]{16,30}$/.test(corpId()),
    directoryConfigured: configured("directory"),
    applicationConfigured: configured("application") && Number.isInteger(agentId()) && agentId() > 0,
  };
}

function tokenKey(kind: WecomTokenKind, secret: string) {
  return `${kind}:${crypto.createHash("sha256").update(secret).digest("hex")}`;
}

async function parseResponse(response: Response) {
  const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
  const errcode = Number(payload.errcode || 0);
  if (!response.ok || errcode) {
    const message = String(payload.errmsg || `HTTP ${response.status}`);
    throw new Error(`企业微信接口调用失败（${errcode || response.status}）：${message}`);
  }
  return payload;
}

async function accessToken(kind: WecomTokenKind) {
  const id = corpId();
  const secret = secretFor(kind);
  if (!/^ww[A-Za-z0-9]{16,30}$/.test(id) || !secret)
    throw new Error(kind === "application" ? "企业微信应用消息尚未完成服务器配置" : "企业微信成员目录尚未完成服务器配置");
  const key = tokenKey(kind, secret);
  const cached = tokenCache.get(key);
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token;
  const url = new URL("https://qyapi.weixin.qq.com/cgi-bin/gettoken");
  url.searchParams.set("corpid", id);
  url.searchParams.set("corpsecret", secret);
  const payload = await parseResponse(await fetch(url, { cache: "no-store" }));
  const token = String(payload.access_token || "");
  if (!token) throw new Error("企业微信没有返回访问凭证");
  const expiresIn = Math.max(300, Number(payload.expires_in || 7200));
  tokenCache.set(key, { token, expiresAt: Date.now() + expiresIn * 1000 });
  return token;
}

async function wecomPost(kind: WecomTokenKind, path: string, body: Record<string, unknown>) {
  const token = await accessToken(kind);
  const url = new URL(`https://qyapi.weixin.qq.com/cgi-bin/${path}`);
  url.searchParams.set("access_token", token);
  return parseResponse(await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  }));
}

function validUserId(value: string) {
  return /^[A-Za-z0-9_.@-]{1,64}$/.test(value);
}

export async function resolveWecomUserId(phoneInput: string) {
  const phone = String(phoneInput || "").replace(/\D/g, "");
  if (!/^1\d{10}$/.test(phone)) throw new Error("新遇官手机号不完整，无法匹配企业微信成员");
  const payload = await wecomPost("directory", "user/getuserid", { mobile: phone });
  const userId = String(payload.userid || "");
  if (!validUserId(userId)) throw new Error("没有找到手机号对应的企业微信成员，请先邀请本人加入企业微信");
  return userId;
}

export async function sendWecomApplicationText(userId: string, contentInput: string) {
  if (!wecomRuntimeStatus().applicationConfigured) throw new Error("企业微信应用消息尚未完成服务器配置");
  if (!validUserId(userId)) throw new Error("企业微信成员标识不正确");
  const content = Array.from(String(contentInput || "").trim()).slice(0, 1900).join("");
  if (!content) throw new Error("企业微信通知内容为空");
  const payload = await wecomPost("application", "message/send", {
    touser: userId,
    msgtype: "text",
    agentid: agentId(),
    text: { content },
    safe: 0,
    enable_duplicate_check: 1,
    duplicate_check_interval: 1800,
  });
  const invalidUser = String(payload.invaliduser || "");
  if (invalidUser) throw new Error("该新遇官不在企业微信应用的可见范围内");
  return String(payload.msgid || payload.response_code || "");
}
