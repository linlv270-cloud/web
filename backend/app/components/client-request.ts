export async function fetchJson(
  input: RequestInfo | URL,
  init: RequestInit = {},
  timeoutMs = 15000,
) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(input, { ...init, signal: controller.signal });
    const data = await response.json().catch(() => ({}));
    return { response, data };
  } catch {
    if (controller.signal.aborted) {
      throw new Error("请求超时，请检查网络后重试");
    }
    throw new Error("网络连接失败，请稍后重试");
  } finally {
    window.clearTimeout(timeout);
  }
}
