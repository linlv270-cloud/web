export function apiError(error: unknown, fallback = "请求失败") {
  const message = error instanceof Error ? error.message : fallback;
  return Response.json({ error: message }, { status: 400, headers: { "cache-control": "no-store" } });
}

export function isNativeFormRequest(request: Request) {
  return request.headers
    .get("content-type")
    ?.toLowerCase()
    .includes("application/x-www-form-urlencoded");
}

export async function requestData(request: Request) {
  if (!isNativeFormRequest(request))
    return (await request.json()) as Record<string, unknown>;
  const form = await request.formData();
  return Object.fromEntries(form.entries());
}

export function nativeFormError(error: unknown, backTo: string) {
  const rawMessage = error instanceof Error ? error.message : "请求失败";
  const message = rawMessage
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
  return new Response(
    `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>提交失败</title><main style="max-width:32rem;margin:15vh auto;padding:24px;font:16px/1.6 system-ui,sans-serif"><h1 style="font-size:22px">提交失败</h1><p>${message}</p><a href="${backTo}">返回重试</a></main></html>`,
    {
      status: 400,
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
      },
    },
  );
}

export const noStore = { "cache-control": "no-store" };
