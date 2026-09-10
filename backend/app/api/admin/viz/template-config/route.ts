import { requireSuperAdmin } from "../../../../../lib/auth";
import { apiError } from "../../../../../lib/http";
import { getVizTemplateConfig, updateVizTemplateConfig } from "../../../../../lib/viz-template";

export async function GET(request: Request) {
  try {
    const denied = requireSuperAdmin(request);
    if (denied) return denied;
    const config = getVizTemplateConfig();
    return Response.json({ config });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const denied = requireSuperAdmin(request);
    if (denied) return denied;
    const data = await request.json();
    const config = updateVizTemplateConfig({
      brandName: data.brandName !== undefined ? String(data.brandName) : undefined,
      brandSubtitle: data.brandSubtitle !== undefined ? String(data.brandSubtitle) : undefined,
      footerText: data.footerText !== undefined ? String(data.footerText) : undefined,
      qrCodeImageUrl: data.qrCodeImageUrl !== undefined ? (data.qrCodeImageUrl || null) : undefined,
      autoYear: data.autoYear !== undefined ? Boolean(data.autoYear) : undefined,
    });
    return Response.json({ config });
  } catch (error) {
    return apiError(error);
  }
}
