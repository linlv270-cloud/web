import { requireSuperAdmin } from "../../../../lib/auth";
import { saveTempFile } from "../../../../lib/temp-storage";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const denied = requireSuperAdmin(request);
  if (denied) return denied;

  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return Response.json({ error: "未找到上传文件" }, { status: 400 });
    }

    if (file.size > 50 * 1024 * 1024) {
      return Response.json({ error: "文件过大（上限 50MB）" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const originalName = file.name || "download.zip";

    const meta = await saveTempFile(buffer, originalName);

    const downloadUrl = `/api/admin/temp-download/${meta.token}`;

    return Response.json({
      ok: true,
      token: meta.token,
      downloadUrl,
      originalName: meta.originalName,
      size: meta.size,
      expiresAt: meta.expiresAt,
    });
  } catch (error) {
    console.error("临时文件上传失败:", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "上传失败" },
      { status: 500 },
    );
  }
}
