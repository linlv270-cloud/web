type RequestOptions = {
  method?: string;
  data?: unknown;
  actor?: "consumer" | "creator";
  silent?: boolean;
  cacheMs?: number;
};

type CacheEntry = { expiresAt: number; value: unknown };

const responseCache = new Map<string, CacheEntry>();
const inFlightRequests = new Map<string, Promise<unknown>>();
let consumerSessionRequest: Promise<string> | null = null;

function apiBase() {
  const ext = wx.getExtConfigSync ? wx.getExtConfigSync() : {};
  return String(
    ext.apiBase ||
      wx.getStorageSync("qideng_api_base") ||
      "https://api.thedesignexpo.org.cn",
  ).replace(/\/$/, "");
}

export function absoluteAsset(url: string | null | undefined) {
  if (!url) return "";
  if (/^(?:https?:\/\/|wxfile:\/\/|file:\/\/|cloud:\/\/|data:)/.test(url)) return url;
  if (url.startsWith("/assets/")) return url;
  return `${apiBase()}${url.startsWith("/") ? "" : "/"}${url}`;
}

export function tokenFor(actor: "consumer" | "creator" = "consumer") {
  return wx.getStorageSync(actor === "creator" ? "qideng_creator_token" : "qideng_consumer_token") || "";
}

export function clearRequestCache() {
  responseCache.clear();
}

export function request<T = any>(path: string, options: RequestOptions = {}): Promise<T> {
  const actor = options.actor || "consumer";
  const token = tokenFor(actor);
  const method = String(options.method || "GET").toUpperCase();
  const cacheMs = method === "GET" ? Math.max(0, Number(options.cacheMs || 0)) : 0;
  const cacheKey = `${actor}:${token}:${apiBase()}${path}`;
  if (cacheMs) {
    const cached = responseCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) return Promise.resolve(cached.value as T);
    if (cached) responseCache.delete(cacheKey);
  }
  if (method === "GET") {
    const pending = inFlightRequests.get(cacheKey);
    if (pending) return pending as Promise<T>;
  } else {
    clearRequestCache();
  }

  const task = new Promise<T>((resolve, reject) => {
    wx.request({
      url: `${apiBase()}${path}`,
      method,
      data: options.data,
      timeout: 10000,
      enableHttp2: true,
      header: {
        "content-type": "application/json",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      success(response: any) {
        const data = response.data || {};
        if (response.statusCode >= 200 && response.statusCode < 300) return resolve(data as T);
        if (response.statusCode === 401) {
          wx.removeStorageSync(actor === "creator" ? "qideng_creator_token" : "qideng_consumer_token");
        }
        const error = new Error(data.error || "连接奇灯失败，请稍后再试");
        if (!options.silent) wx.showToast({ title: error.message, icon: "none", duration: 2600 });
        reject(error);
      },
      fail(reason: any) {
        const error = new Error(reason.errMsg || "网络暂时不可用");
        if (!options.silent) wx.showToast({ title: error.message, icon: "none" });
        reject(error);
      },
    });
  });
  if (method !== "GET") return task;
  const tracked = task.then((value) => {
    if (cacheMs) responseCache.set(cacheKey, { value, expiresAt: Date.now() + cacheMs });
    return value;
  }).finally(() => inFlightRequests.delete(cacheKey));
  inFlightRequests.set(cacheKey, tracked);
  return tracked;
}

export function upload<T = any>(path: string, filePath: string, formData: Record<string, string>, actor: "consumer" | "creator" = "creator"): Promise<T> {
  const token = tokenFor(actor);
  return new Promise((resolve, reject) => {
    wx.uploadFile({
      url: `${apiBase()}${path}`,
      filePath,
      name: "file",
      formData,
      timeout: 30000,
      header: token ? { authorization: `Bearer ${token}` } : {},
      success(response: any) {
        let data: any = {};
        try { data = JSON.parse(response.data || "{}"); } catch { data = {}; }
        if (response.statusCode >= 200 && response.statusCode < 300) {
          clearRequestCache();
          return resolve(data as T);
        }
        const error = new Error(data.error || "图片上传失败");
        wx.showToast({ title: error.message, icon: "none" });
        reject(error);
      },
      fail(reason: any) { reject(new Error(reason.errMsg || "图片上传失败")); },
    });
  });
}

export function guestId() {
  let value = wx.getStorageSync("qideng_guest_id");
  if (!value) {
    value = `guest_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    wx.setStorageSync("qideng_guest_id", value);
  }
  return value;
}

export async function ensureConsumerSession() {
  const existing = tokenFor("consumer");
  if (existing) return existing;
  if (consumerSessionRequest) return consumerSessionRequest;
  consumerSessionRequest = (async () => {
    const code = await new Promise<string>((resolve, reject) => {
      wx.login({ success: (result: any) => result.code ? resolve(result.code) : reject(new Error("微信登录失败")), fail: reject });
    });
    const result = await request<any>("/api/mini/auth/wechat", { method: "POST", data: { code } });
    wx.setStorageSync("qideng_consumer_token", result.session.token);
    return result.session.token as string;
  })();
  try {
    return await consumerSessionRequest;
  } finally {
    consumerSessionRequest = null;
  }
}

export async function enterCreatorMode() {
  await ensureConsumerSession();
  const result = await request<any>("/api/mini/auth/switch-creator", { method: "POST" });
  wx.setStorageSync("qideng_creator_token", result.session.token);
  return result;
}

export async function ensureCreatorSession() {
  const existing = tokenFor("creator");
  if (existing) return existing;
  const result = await enterCreatorMode();
  return result.session.token as string;
}

export function formatDateRange(start: string, end: string) {
  if (!start) return "近期无计划";
  const format = (value: string) => `${Number(value.slice(5, 7))}月${Number(value.slice(8, 10))}日`;
  return start === end ? format(start) : `${format(start)}–${format(end)}`;
}
