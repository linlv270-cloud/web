import { NextRequest } from "next/server";
import { requireAdmin } from "../../../../../../lib/auth";
import { apiError } from "../../../../../../lib/http";
import { svgToCmykPdf } from "../../../../../../lib/design-pdf";
import { getDesignDraft, getDesignSession, getDesignSolarTerm } from "../../../../../../lib/repository";
import { QIDENG_COLORS } from "../../../../../design-system-values";

const MAX_EXPORT_BYTES = 200 * 1024; // 印刷厂硬约束：单文件 ≤200KB

/** 导出印刷文件：?format=svg（默认，矢量可编辑）| pdf（CMYK 转曲矢量） */
export async function GET(request: NextRequest, { params }: { params: Promise<{ draftId: string }> }) {
  try {
    const denied = requireAdmin(request);
    if (denied) return denied;
    const { draftId: idStr } = await params;
    const url = new URL(request.url);
    const format = url.searchParams.get("format") || "svg";
    const bleed = url.searchParams.get("bleed") === "1";
    const draft = getDesignDraft(Number(idStr));
    if (!draft) return Response.json({ error: "草稿不存在" }, { status: 404 });
    if (!draft.svg) return Response.json({ error: "该版本还未完成渲染，无法导出" }, { status: 400 });

    const session = getDesignSession(draft.session_id);
    const term = session ? getDesignSolarTerm(session.solar_term_id) : null;
    const baseName = `TDE-${term?.name || "市集"}-${draft.brief_json?.theme || "海报"}-v${draft.version}`.replace(/[\\/:*?"<>|\s]+/g, "-");

    if (format === "pdf") {
      let pdf: Buffer;
      try {
        pdf = svgToCmykPdf(draft.svg);
      } catch (error) {
        return apiError(error instanceof Error ? error : new Error("PDF 生成失败"), "PDF 生成失败");
      }
      if (pdf.length > MAX_EXPORT_BYTES) {
        return Response.json(
          { error: `PDF 文件 ${Math.round(pdf.length / 1024)}KB 超过印刷硬约束 200KB，请减少元素或更换风格后重试` },
          { status: 413 },
        );
      }
      return new Response(new Uint8Array(pdf), {
        headers: {
          "content-type": "application/pdf",
          "content-disposition": `attachment; filename="${baseName}.pdf"`,
        },
      });
    }

    let outputSvg = draft.svg;
    if (bleed) {
      outputSvg = outputSvg.replace(
        "</svg>",
        `<rect x="-10" y="-10" width="1020" height="1353" fill="none" stroke="${QIDENG_COLORS.night}" stroke-width="1" stroke-dasharray="8 6"/><rect x="0" y="0" width="1000" height="1333" fill="none" stroke="${QIDENG_COLORS.danger}" stroke-width="1"/></svg>`,
      );
    }
    const svgBytes = Buffer.byteLength(outputSvg, "utf8");
    if (svgBytes > MAX_EXPORT_BYTES) {
      return Response.json(
        { error: `SVG 文件 ${Math.round(svgBytes / 1024)}KB 超过印刷硬约束 200KB，请减少元素或更换风格后重试` },
        { status: 413 },
      );
    }
    return new Response(outputSvg, {
      headers: {
        "content-type": "image/svg+xml; charset=utf-8",
        "content-disposition": `attachment; filename="${baseName}${bleed ? "-印刷出血线" : ""}.svg"`,
      },
    });
  } catch (error) {
    return apiError(error);
  }
}
