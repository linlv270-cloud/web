import crypto from "node:crypto";

const rateLimits = new Map<string, { count: number; resetAt: number }>();

export function normalizePhone(value: unknown) {
  return String(value || "").replace(/\s+/g, "");
}

export function validPhone(phone: string) {
  return /^1[3-9]\d{9}$/.test(phone) && !/^1[3-9](\d)\1{8}$/.test(phone);
}

export function cleanText(value: unknown, maxLength: number) {
  return String(value || "").replace(/[<>]/g, "").trim().slice(0, maxLength);
}

export function hashSecret(secret: string, salt = crypto.randomBytes(16).toString("hex")) {
  return { salt, hash: crypto.scryptSync(secret, salt, 64).toString("hex") };
}

export function verifySecret(secret: string, salt: string, expected: string) {
  const actual = crypto.scryptSync(secret, salt, 64);
  const target = Buffer.from(expected, "hex");
  return actual.length === target.length && crypto.timingSafeEqual(actual, target);
}

export function clientAddress(request: Request) {
  return request.headers.get("x-real-ip") || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
}

export function rateLimit(request: Request, scope: string, limit: number, windowMs: number, subject = "") {
  const now = Date.now();
  const key = `${scope}:${clientAddress(request)}:${subject}`;
  const entry = rateLimits.get(key);
  if (!entry || entry.resetAt <= now) {
    rateLimits.set(key, { count: 1, resetAt: now + windowMs });
    return null;
  }
  if (entry.count >= limit) {
    return Response.json({ error: "操作过于频繁，请稍后再试" }, { status: 429, headers: { "retry-after": String(Math.ceil((entry.resetAt - now) / 1000)) } });
  }
  entry.count += 1;
  return null;
}

const blockedTerms = ["赌博", "毒品", "代开发票", "色情", "枪支"];
export function contentSafety(...values: string[]) {
  const body = values.join(" ").toLowerCase();
  const term = blockedTerms.find((item) => body.includes(item));
  return term ? `内容包含暂不允许提交的词语：${term}` : null;
}

export function randomToken() {
  return crypto.randomBytes(32).toString("base64url");
}
