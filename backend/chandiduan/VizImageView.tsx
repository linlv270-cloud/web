"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import html2canvas from "html2canvas";
import JSZip from "jszip";
import { QIDENG_COLORS } from "../app/design-system-values";
import {
  Download,
  LoaderCircle,
  ChevronLeft,
  ChevronRight,
  Check,
  CheckCircle2,
  CheckSquare,
  Square,
  Trash2,
  Maximize,
  Minimize,
  FileText,
} from "lucide-react";
import { saveBlobWithPicker } from "../lib/download";
import { DownloadLinkDialog } from "./DownloadLinkDialog";
import { VizPage } from "./CreatorVisualization";

export interface VizCreator {
  id: number;
  userName: string;
  brandName: string;
  phone?: string;
  intro: string;
  province: string;
  city: string;
  logoUrl: string | null;
  workUrls: string[];
  tags: { id: number; label: string; category: string }[];
}

interface Props {
  creators: VizCreator[];
}

const PAGE_SIZE = 10;
const PAGE_WIDTH = 1280;
const PAGE_HEIGHT = 720;
const C = QIDENG_COLORS;

function safeFileName(value: string): string {
  return value.replace(/[\\/:*?"<>|]/g, "_").slice(0, 60) || "未命名";
}

function waitForImages(container: HTMLElement): Promise<void> {
  const imgs = Array.from(container.querySelectorAll("img"));
  if (!imgs.length) return Promise.resolve();
  return Promise.all(
    imgs.map(
      (img) =>
        new Promise<void>((resolve) => {
          if (img.complete && img.naturalWidth > 0) return resolve();
          img.onload = () => resolve();
          img.onerror = () => resolve();
          setTimeout(() => resolve(), 5000);
        }),
    ),
  ).then(() => undefined);
}

export function VizImageView({ creators }: Props) {
  const [page, setPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [stage, setStage] = useState<"preview" | "generating" | "done" | "error">("preview");
  const [progress, setProgress] = useState(0);
  const [errorMsg, setErrorMsg] = useState("");
  const [isMobile, setIsMobile] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [downloadFormat, setDownloadFormat] = useState<"ppt" | "zip">("ppt");
  const [previewScale, setPreviewScale] = useState(1);
  const previewContainerRef = useRef<HTMLDivElement>(null);
  const [templateConfig, setTemplateConfig] = useState<{
    brandName: string;
    resolvedSubtitle: string;
    footerText: string;
    qrCodeImageUrl: string | null;
  } | null>(null);
  const [downloadInfo, setDownloadInfo] = useState<{
    pageUrl: string;
    originalName: string;
    size: number;
    expiresAt: number;
  } | null>(null);
  const pagesRef = useRef<Array<HTMLDivElement | null>>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/viz/template-config")
      .then((res) => res.json())
      .then((data) => {
        if (data.config) {
          setTemplateConfig({
            brandName: data.config.brandName,
            resolvedSubtitle: data.resolvedSubtitle || data.config.brandSubtitle,
            footerText: data.config.footerText,
            qrCodeImageUrl: data.config.qrCodeImageUrl,
          });
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const checkMobile = () => {
      const hasFinePointer = window.matchMedia("(pointer: fine)").matches;
      const isMobileUA = /Android|iPhone|iPad|iPod|Mobile|HarmonyOS/i.test(navigator.userAgent);
      setIsMobile(!hasFinePointer || isMobileUA);
    };
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  // 自适应缩放：根据容器宽度自动计算缩放比例，确保图片完整显示，适配各种屏幕尺寸
  useEffect(() => {
    const updateScale = () => {
      if (previewContainerRef.current) {
        const containerWidth = previewContainerRef.current.clientWidth;
        const availableWidth = containerWidth - 40; // 减去左右 padding 和边框
        const scale = Math.min(1, availableWidth / PAGE_WIDTH);
        setPreviewScale(Math.max(0.2, scale));
      }
    };
    updateScale();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(updateScale);
    if (previewContainerRef.current) observer?.observe(previewContainerRef.current);
    window.addEventListener("resize", updateScale);
    const timer = setTimeout(updateScale, 150);
    return () => {
      window.removeEventListener("resize", updateScale);
      observer?.disconnect();
      clearTimeout(timer);
    };
  }, []);

  const totalPages = Math.max(1, Math.ceil(creators.length / PAGE_SIZE));
  const currentCreators = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return creators.slice(start, start + PAGE_SIZE);
  }, [creators, page]);

  const selectedCreators = useMemo(
    () => creators.filter((c) => selectedIds.has(c.id)),
    [creators, selectedIds],
  );

  const allCurrentSelected = currentCreators.length > 0 && currentCreators.every((c) => selectedIds.has(c.id));

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }, [page]);

  function toggleSelect(id: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectCurrentPage() {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allCurrentSelected) {
        currentCreators.forEach((c) => next.delete(c.id));
      } else {
        currentCreators.forEach((c) => next.add(c.id));
      }
      return next;
    });
  }

  function clearSelection() {
    setSelectedIds(new Set());
  }

  function handleExport() {
    if (selectedIds.size === 0 || stage === "generating") return;
    setStage("generating");
    setProgress(0);
    setErrorMsg("");
  }

  function handleExportAll() {
    if (creators.length === 0 || stage === "generating") return;
    setSelectedIds(new Set(creators.map((c) => c.id)));
    setStage("generating");
    setProgress(0);
    setErrorMsg("");
  }

  useEffect(() => {
    if (stage !== "generating") return;
    let cancelled = false;
    const raf1 = requestAnimationFrame(() => {
      const raf2 = requestAnimationFrame(async () => {
        if (cancelled) return;
        // eslint-disable-next-line react-hooks/immutability
        await doGenerate();
      });
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf1);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, selectedCreators.length]);

  async function doGenerate() {
    try {
      const dateStr = new Date().toISOString().slice(0, 10);
      let resultBlob: Blob;
      let fileName: string;
      let mimeType: string;

      if (downloadFormat === "ppt") {
        // 生成 PPTX
        const { default: PptxGenJS } = await import("pptxgenjs");
        const pptx = new PptxGenJS();
        pptx.layout = "LAYOUT_WIDE"; // 13.333 x 7.5 英寸 (16:9)

        for (let i = 0; i < selectedCreators.length; i++) {
          const creator = selectedCreators[i];
          const pageEl = pagesRef.current[i];
          if (!pageEl) continue;

          setProgress(i + 1);
          await waitForImages(pageEl);
          await new Promise((r) => setTimeout(r, 200));

          const canvas = await html2canvas(pageEl, {
            useCORS: true,
            allowTaint: false,
            scale: 2,
            backgroundColor: C.surface,
            logging: false,
            width: PAGE_WIDTH,
            height: PAGE_HEIGHT,
            windowWidth: PAGE_WIDTH,
            windowHeight: PAGE_HEIGHT,
          });

          const dataUrl = canvas.toDataURL("image/png");
          const slide = pptx.addSlide();
          slide.background = { color: C.surface };
          slide.addImage({
            data: dataUrl,
            x: 0,
            y: 0,
            w: 13.333,
            h: 7.5,
          });
        }

        resultBlob = await pptx.write({ outputType: "blob" }) as Blob;
        fileName = `TDE主理人名录_${dateStr}_${selectedCreators.length}人.pptx`;
        mimeType = "application/vnd.openxmlformats-officedocument.presentationml.presentation";
      } else {
        // 生成 ZIP（PNG打包）
        const zip = new JSZip();

        for (let i = 0; i < selectedCreators.length; i++) {
          const creator = selectedCreators[i];
          const pageEl = pagesRef.current[i];
          if (!pageEl) continue;

          setProgress(i + 1);
          await waitForImages(pageEl);
          await new Promise((r) => setTimeout(r, 200));

          const canvas = await html2canvas(pageEl, {
            useCORS: true,
            allowTaint: false,
            scale: 2,
            backgroundColor: C.surface,
            logging: false,
            width: PAGE_WIDTH,
            height: PAGE_HEIGHT,
            windowWidth: PAGE_WIDTH,
            windowHeight: PAGE_HEIGHT,
          });

          const blob = await new Promise<Blob>((resolve, reject) => {
            canvas.toBlob(
              (b) => (b ? resolve(b) : reject(new Error("canvas toBlob failed"))),
              "image/png",
            );
          });

          const displayName = creator.brandName || creator.userName || creator.phone || `user_${creator.id}`;
          const pngFileName = `${String(i + 1).padStart(2, "0")}_${safeFileName(displayName)}.png`;
          zip.file(pngFileName, blob);
        }

        resultBlob = await zip.generateAsync({ type: "blob" });
        fileName = `TDE主理人名录_${dateStr}_${selectedCreators.length}人.zip`;
        mimeType = "application/zip";
      }

      if (isMobile) {
        const formData = new FormData();
        formData.append("file", resultBlob, fileName);
        const uploadRes = await fetch("/api/viz/temp-upload", { method: "POST", body: formData });
        const uploadData = await uploadRes.json().catch(() => ({}));
        if (!uploadRes.ok || !uploadData.token) {
          throw new Error(uploadData.error || "生成下载链接失败");
        }
        setDownloadInfo({
          pageUrl: `/download/${uploadData.token}`,
          originalName: uploadData.originalName || fileName,
          size: uploadData.size || resultBlob.size,
          expiresAt: uploadData.expiresAt,
        });
      } else {
        const result = await saveBlobWithPicker(resultBlob, fileName, mimeType);
        if (result === "cancelled") {
          setStage("preview");
          return;
        }
      }

      if (downloadFormat === "ppt") {
        const logResponse = await fetch("/api/viz/downloads", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            downloadType: "creator_filter",
            creatorIds: selectedCreators.map((creator) => creator.id),
            fileName,
          }),
        });
        if (!logResponse.ok) console.error("下载记录保存失败", await logResponse.text());
      }

      setStage("done");
    } catch (e) {
      console.error("可视化生成失败:", e);
      setErrorMsg(e instanceof Error ? e.message : "生成失败，请重试");
      setStage("error");
    }
  }

  if (creators.length === 0) {
    return (
      <div style={{ textAlign: "center", padding: "64px 32px" }}>
        <p style={{ color: C.muted, fontSize: 14, margin: 0 }}>暂无符合当前条件的主理人</p>
      </div>
    );
  }

  return (
    <div
      style={
        isFullscreen
          ? {
              position: "fixed",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              zIndex: 9999,
              background: "#fff",
              display: "flex",
              flexDirection: "column",
            }
          : { display: "flex", flexDirection: "column", height: "100%" }
      }
    >
      {/* 隐藏区域：导出时渲染所有勾选用户的 VizPage */}
      {stage === "generating" && (
        <div
          style={{
            position: "fixed",
            left: "-99999px",
            top: 0,
            width: `${PAGE_WIDTH}px`,
            zIndex: -1,
            pointerEvents: "none",
          }}
          aria-hidden
        >
          {selectedCreators.map((creator, i) => (
            <VizPage
              key={creator.id}
              creator={creator}
              index={i}
              templateConfig={templateConfig || undefined}
              ref={(el) => {
                pagesRef.current[i] = el;
              }}
            />
          ))}
        </div>
      )}

      {stage === "preview" && (
        <>
          {/* 工具栏 */}
          <div
            className="viz-selection-toolbar"
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "10px 20px",
              borderBottom: `1px solid ${C.line}`,
            background: C.paper,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <button
                type="button"
                onClick={toggleSelectCurrentPage}
                style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 14px", border: `1px solid ${C.line}`, borderRadius: 6, background: "#fff", cursor: "pointer", fontSize: 13, color: C.text }}
              >
                {allCurrentSelected ? <CheckSquare size={16} color={C.accentPressed} /> : <Square size={16} />}
                {allCurrentSelected ? "取消当前页" : "全选当前页"}
              </button>
              <button
                type="button"
                onClick={clearSelection}
                disabled={selectedIds.size === 0}
                style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 14px", border: selectedIds.size === 0 ? `1px solid ${C.line}` : "1px solid #fecaca", borderRadius: 6, background: selectedIds.size === 0 ? C.surfaceSoft : "#fef2f2", cursor: selectedIds.size === 0 ? "not-allowed" : "pointer", fontSize: 13, color: selectedIds.size === 0 ? C.faint : "#dc2626", opacity: selectedIds.size === 0 ? 0.6 : 1 }}
              >
                <Trash2 size={14} />
                清空选择
              </button>
              <button
                type="button"
                onClick={() => setIsFullscreen(!isFullscreen)}
                style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 14px", border: `1px solid ${C.line}`, borderRadius: 6, background: "#fff", cursor: "pointer", fontSize: 13, color: C.text }}
              >
                {isFullscreen ? <Minimize size={16} /> : <Maximize size={16} />}
                {isFullscreen ? "退出全屏" : "全屏"}
              </button>
            </div>
            <div style={{ fontSize: 13, color: C.muted }}>
              共 {creators.length} 位，已选 <strong style={{ color: C.accentPressed }}>{selectedIds.size}</strong> 位
            </div>
          </div>

          {/* 预览卡片列表 */}
          <div
            ref={(el) => {
              previewContainerRef.current = el;
              scrollRef.current = el;
            }}
            style={{
              flex: 1,
              overflowY: "auto",
              padding: "12px 16px",
              background: C.surfaceSoft,
            }}
          >
            {currentCreators.map((creator, i) => {
              const isSelected = selectedIds.has(creator.id);
              const displayName = creator.brandName || creator.userName || creator.phone || "TDE主理人";
              return (
                <div
                  key={creator.id}
                  style={{
                    marginBottom: 12,
                    borderRadius: 8,
                    overflow: "hidden",
                    border: isSelected ? `2px solid ${C.accentPressed}` : `1px solid ${C.line}`,
                    boxShadow: isSelected ? `0 0 0 3px ${C.accentPressed}33` : "none",
                    background: "#fff",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "10px 14px",
                      background: isSelected ? C.accentPressed : C.paper,
                      borderBottom: `1px solid ${C.line}`,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                      <button
                        type="button"
                        onClick={() => toggleSelect(creator.id)}
                        style={{
                          width: 24,
                          height: 24,
                          borderRadius: 5,
                          border: isSelected ? "none" : `2px solid ${C.faint}`,
                          background: isSelected ? "#fff" : "transparent",
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          flexShrink: 0,
                        }}
                      >
                        {isSelected && <Check size={16} color={C.accentPressed} />}
                      </button>
                      <span
                        style={{
                          fontSize: 14,
                          fontWeight: 600,
                          color: isSelected ? "#fff" : C.ink,
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          maxWidth: 300,
                        }}
                      >
                        {displayName}
                      </span>
                    </div>
                    <span
                      style={{
                        fontSize: 12,
                        color: isSelected ? "rgba(255,255,255,0.8)" : C.muted,
                        fontWeight: 500,
                        flexShrink: 0,
                        marginLeft: 12,
                      }}
                    >
                      {(page - 1) * PAGE_SIZE + i + 1} / {creators.length}
                    </span>
                  </div>
                  <div style={{ width: "100%", height: `${PAGE_HEIGHT * previewScale}px`, overflow: "hidden" }}>
                    <div
                      style={{
                        transform: `scale(${previewScale})`,
                        transformOrigin: "top left",
                        width: `${PAGE_WIDTH}px`,
                        height: `${PAGE_HEIGHT}px`,
                      }}
                    >
                      <VizPage creator={creator} index={i} templateConfig={templateConfig || undefined} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* 底部：分页 + 导出（固定在底部） */}
          <footer
            className="viz-export-footer"
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "12px 20px",
              borderTop: `1px solid ${C.line}`,
              background: "#fff",
              position: "sticky",
              bottom: 0,
              zIndex: 10,
              flexShrink: 0,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 6,
                  border: `1px solid ${C.line}`,
                  background: page === 1 ? C.surfaceSoft : "#fff",
                  cursor: page === 1 ? "not-allowed" : "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  opacity: page === 1 ? 0.5 : 1,
                }}
              >
                <ChevronLeft size={16} />
              </button>
              <span style={{ fontSize: 14, color: C.text }}>
                第 <strong>{page}</strong> / {totalPages} 页
              </span>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 6,
                  border: `1px solid ${C.line}`,
                  background: page === totalPages ? C.surfaceSoft : "#fff",
                  cursor: page === totalPages ? "not-allowed" : "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  opacity: page === totalPages ? 0.5 : 1,
                }}
              >
                <ChevronRight size={16} />
              </button>
            </div>
            <div className="viz-export-actions" style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div className="viz-export-format" style={{ display: "flex", alignItems: "center", gap: 8, marginRight: 8 }}>
                <span style={{ fontSize: 13, color: C.muted }}>格式：</span>
                <button
                  type="button"
                  onClick={() => setDownloadFormat("ppt")}
                  style={{
                    padding: "6px 12px",
                    border: `1px solid ${downloadFormat === "ppt" ? C.accentPressed : C.line}`,
                    borderRadius: 6,
                    background: downloadFormat === "ppt" ? C.accentPressed : "#fff",
                    color: downloadFormat === "ppt" ? "#fff" : C.text,
                    cursor: "pointer",
                    fontSize: 13,
                    fontWeight: downloadFormat === "ppt" ? 600 : 400,
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                  }}
                >
                  <FileText size={14} />
                  PPT
                </button>
                <button
                  type="button"
                  onClick={() => setDownloadFormat("zip")}
                  style={{
                    padding: "6px 12px",
                    border: `1px solid ${downloadFormat === "zip" ? C.accentPressed : C.line}`,
                    borderRadius: 6,
                    background: downloadFormat === "zip" ? C.accentPressed : "#fff",
                    color: downloadFormat === "zip" ? "#fff" : C.text,
                    cursor: "pointer",
                    fontSize: 13,
                    fontWeight: downloadFormat === "zip" ? 600 : 400,
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                  }}
                >
                  <Download size={14} />
                  PNG打包
                </button>
              </div>
              <button
                type="button"
                onClick={handleExportAll}
                style={{ padding: "8px 16px", border: `1px solid ${C.line}`, borderRadius: 6, background: "#fff", cursor: "pointer", fontSize: 14, color: C.text, display: "flex", alignItems: "center", gap: 6 }}
              >
                <Download size={16} />
                导出全部（{creators.length}）
              </button>
              <button
                type="button"
                onClick={handleExport}
                disabled={selectedIds.size === 0}
                style={{ padding: "8px 16px", border: "none", borderRadius: 6, background: selectedIds.size === 0 ? C.faint : C.accentPressed, color: "#fff", cursor: selectedIds.size === 0 ? "not-allowed" : "pointer", fontSize: 14, fontWeight: 600, opacity: selectedIds.size === 0 ? 0.5 : 1, display: "flex", alignItems: "center", gap: 6 }}
              >
                <Download size={16} />
                导出选中（{selectedIds.size}）
              </button>
            </div>
          </footer>
        </>
      )}

      {stage === "generating" && (
        <div style={{ textAlign: "center", padding: "64px 32px", flex: 1 }}>
          <LoaderCircle className="spin" size={36} style={{ color: C.accentPressed, marginBottom: 16 }} />
          <p style={{ fontWeight: 600, margin: "0 0 8px" }}>
            正在生成 {progress}/{selectedCreators.length}…
          </p>
          <div
            style={{
              background: C.surfaceSoft,
              borderRadius: 4,
              height: 8,
              overflow: "hidden",
              maxWidth: 320,
              margin: "0 auto",
            }}
          >
            <div
              style={{
                background: C.accentPressed,
                height: "100%",
                width: `${(progress / selectedCreators.length) * 100}%`,
                transition: "width 0.3s",
              }}
            />
          </div>
        </div>
      )}

      {stage === "done" && (
        <div style={{ textAlign: "center", padding: "48px 32px", flex: 1 }}>
          <CheckCircle2 size={40} style={{ color: C.success, marginBottom: 12 }} />
          <p style={{ fontWeight: 600, margin: "0 0 8px" }}>
            {isMobile ? "导出成功！" : "已保存到所选位置"}
          </p>
          <p style={{ color: C.muted, fontSize: 13, margin: "0 0 20px" }}>
            {isMobile
              ? `${selectedCreators.length} 张 PNG 已打包，复制链接或打开下载页获取文件`
              : `${selectedCreators.length} 张 PNG 已保存到您选择的位置`}
          </p>
          <button
            type="button"
            onClick={() => setStage("preview")}
            style={{ padding: "10px 24px", border: `1px solid ${C.line}`, borderRadius: 6, background: "#fff", cursor: "pointer", fontSize: 14 }}
          >
            返回预览
          </button>
        </div>
      )}

      {stage === "error" && (
        <div style={{ padding: "32px", flex: 1 }}>
          <div style={{ background: C.dangerSoft, borderRadius: 8, padding: "16px 20px", color: C.danger, marginBottom: 16 }}>
            <p style={{ fontWeight: 600, margin: "0 0 6px" }}>生成失败</p>
            <p style={{ fontSize: 13, margin: 0 }}>{errorMsg}</p>
          </div>
          <button type="button" onClick={() => setStage("preview")} style={{ padding: "10px 24px", border: "none", borderRadius: 6, background: C.accentPressed, color: "#fff", cursor: "pointer", fontSize: 14, fontWeight: 600 }}>
            返回预览
          </button>
        </div>
      )}

      {downloadInfo && stage === "done" && (
        <DownloadLinkDialog
          open={true}
          onClose={() => setDownloadInfo(null)}
          pageUrl={downloadInfo.pageUrl}
          originalName={downloadInfo.originalName}
          size={downloadInfo.size}
          expiresAt={downloadInfo.expiresAt}
        />
      )}
    </div>
  );
}
