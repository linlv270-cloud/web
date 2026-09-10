import { APP_VERSION, RELEASED_AT, RELEASE_ID } from "@/lib/version";

export const dynamic = "force-dynamic";

export function GET() {
  const body = [
    "品牌：奇灯",
    `版本：v${APP_VERSION}`,
    `发布编号：${RELEASE_ID}`,
    `发布时间：${RELEASED_AT}`,
  ].join("\n");

  return new Response(`${body}\n`, {
    headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      "Content-Type": "text/plain; charset=utf-8",
      Expires: "0",
      Pragma: "no-cache",
      "X-Qideng-Version": APP_VERSION,
      "X-Qideng-Release": RELEASE_ID,
    },
  });
}
