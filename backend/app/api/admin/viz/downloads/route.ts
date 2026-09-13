import { requireSuperAdmin } from "../../../../../lib/auth";
import { buildVisualizationDownloadsXlsx, listVisualizationDownloads } from "../../../../../lib/visualization-downloads";

export async function GET(request: Request) {
  const denied = requireSuperAdmin(request);
  if (denied) return denied;
  const records = listVisualizationDownloads(5000);
  if (new URL(request.url).searchParams.get("export") === "xlsx") {
    const workbook = await buildVisualizationDownloadsXlsx(records);
    return new Response(workbook as BodyInit, {
      headers: {
        "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "content-disposition": `attachment; filename="TDE-visualization-downloads-${new Date().toISOString().slice(0, 10)}.xlsx"`,
        "cache-control": "no-store",
      },
    });
  }
  return Response.json({ records }, { headers: { "cache-control": "no-store" } });
}
