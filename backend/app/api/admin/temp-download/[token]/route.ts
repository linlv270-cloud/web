import { getTempFile } from "../../../../../lib/temp-storage";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

  if (!token || !/^[a-f0-9]{48}$/.test(token)) {
    return Response.json({ error: "无效的下载链接" }, { status: 400 });
  }

  const result = await getTempFile(token);
  if (!result) {
    return Response.json(
      { error: "文件不存在或已过期（链接有效期 24 小时）" },
      { status: 404 },
    );
  }

  const { buffer, meta } = result;

  return new Response(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${encodeURIComponent(meta.originalName)}"`,
      "Content-Length": String(buffer.length),
      "Cache-Control": "no-store",
    },
  });
}
