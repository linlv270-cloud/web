"use client";

import { useCallback, useEffect, useMemo, useRef, useState, forwardRef } from "react";
import html2canvas from "html2canvas";
import JSZip from "jszip";
import type { CreatorProfile } from "../lib/types";
import { QIDENG_COLORS } from "../app/design-system-values";
import {
  X,
  Download,
  LoaderCircle,
  ChevronLeft,
  ChevronRight,
  Check,
  CheckCircle2,
  CheckSquare,
  Square,
  Trash2,
} from "lucide-react";
import { saveBlobWithPicker } from "../lib/download";
import { DownloadLinkDialog } from "./DownloadLinkDialog";

interface Props {
  creators: CreatorProfile[];
  onClose: () => void;
}

const PAGE_SIZE = 10;
const PAGE_WIDTH = 1280;
const PAGE_HEIGHT = 720;
const PREVIEW_SCALE = 0.78;
const C = QIDENG_COLORS;

function resolveImageUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  if (url.startsWith("/api/assets/")) return url;
  return null;
}

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

interface VizPageProps {
  creator: {
    id: number;
    userName: string;
    brandName?: string;
    phone?: string;
    intro?: string;
    logoUrl?: string | null;
    workUrls?: string[];
    tags?: { id: number; label: string; category: string }[];
  };
  index: number;
  templateConfig?: {
    brandName: string;
    resolvedSubtitle: string;
    footerText: string;
    qrCodeImageUrl: string | null;
  };
}

export const VizPage = forwardRef<HTMLDivElement, VizPageProps>(function VizPage({ creator, templateConfig }, ref) {
  const [photoFailed, setPhotoFailed] = useState(false);
  const [logoFailed, setLogoFailed] = useState(false);
  const photoUrl = resolveImageUrl(creator.workUrls?.[0]);
  const logoUrl = resolveImageUrl(creator.logoUrl);
  const displayName = creator.brandName || creator.userName || creator.phone || "TDE用户";
  const tags = (creator.tags || []).slice(0, 8);
  const intro = creator.intro || "";
  const brandName = templateConfig?.brandName || "TDE";
  const subtitle = templateConfig?.resolvedSubtitle || "用户档案 · 2026";
  const footerText = templateConfig?.footerText || "TDE原创者社区";
  const qrCodeUrl = resolveImageUrl(templateConfig?.qrCodeImageUrl);

  return (
    <div
      ref={ref}
      style={{
        width: `${PAGE_WIDTH}px`,
        height: `${PAGE_HEIGHT}px`,
        background: C.surface,
        fontFamily: '"PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", -apple-system, sans-serif',
        color: C.ink,
        position: "relative",
        overflow: "hidden",
        boxSizing: "border-box",
      }}
    >
      {/* 顶部品牌栏 */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: 72,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 48px",
          borderBottom: `1px solid ${C.line}`,
        }}
      >
        <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
          <span style={{ fontSize: 28, fontWeight: 700, color: C.accentPressed, letterSpacing: 2 }}>{brandName}</span>
        </div>
        <span style={{ fontSize: 13, color: C.faint, letterSpacing: 1 }}>{subtitle}</span>
      </div>

      {/* 主体区域 */}
      <div
        style={{
          position: "absolute",
          top: 72,
          bottom: 64,
          left: 0,
          right: 0,
          display: "flex",
          padding: "36px 48px",
          gap: 40,
        }}
      >
        {/* 左侧：用户照片 */}
        <div style={{ width: 400, height: 500, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", borderRadius: 4, background: C.surfaceSoft }}>
          {photoUrl && !photoFailed ? (
            <img
              src={photoUrl}
              alt={displayName}
              crossOrigin="anonymous"
              onError={() => setPhotoFailed(true)}
              style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "center", display: "block" }}
            />
          ) : logoUrl && !logoFailed ? (
            <img src={logoUrl} alt={displayName} crossOrigin="anonymous" onError={() => setLogoFailed(true)} style={{ width: 150, height: 150, objectFit: "contain", display: "block" }} />
          ) : (
            <div
              style={{
                width: "100%",
                height: "100%",
                background: C.surfaceSoft,
                borderRadius: 4,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: C.faint,
                fontSize: 72,
                fontWeight: 700,
              }}
            >
              {Array.from(displayName.trim())[0] || "T"}
            </div>
          )}
        </div>

        {/* 右侧：信息区 */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
          {/* 用户 logo + 用户名 */}
          <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 24 }}>
            {logoUrl && !logoFailed ? (
              <img
                src={logoUrl}
                alt="logo"
                crossOrigin="anonymous"
                onError={() => setLogoFailed(true)}
                style={{ width: 64, height: 64, borderRadius: 4, objectFit: "cover", flexShrink: 0 }}
              />
            ) : (
              <div
                style={{
                  width: 64,
                  height: 64,
                  borderRadius: 4,
                  background: C.accentPressed,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: C.onAccent,
                  fontSize: 24,
                  fontWeight: 700,
                  flexShrink: 0,
                }}
              >
                {displayName.charAt(0)}
              </div>
            )}
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 26, fontWeight: 700, color: C.night, lineHeight: 1.3, wordBreak: "break-all" }}>
                {displayName}
              </div>
              {creator.brandName && creator.userName && creator.brandName !== creator.userName ? (
                <div style={{ fontSize: 13, color: C.faint, marginTop: 4 }}>{creator.userName}</div>
              ) : null}
            </div>
          </div>

          {/* 标签 */}
          {tags.length > 0 && (
            <div style={{ marginBottom: 24 }}>
              <div style={{ fontSize: 11, color: C.faint, letterSpacing: 2, marginBottom: 10, fontWeight: 500 }}>标签</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {tags.map((tag) => (
                  <span
                    key={tag.id}
                    style={{
                      display: "inline-block",
                      padding: "5px 14px",
                      background: C.onAccent,
                      border: `1px solid ${C.line}`,
                      borderRadius: 20,
                      fontSize: 13,
                      color: C.text,
                      lineHeight: 1.4,
                    }}
                  >
                    {tag.label}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* 介绍 */}
          <div style={{ flex: 1, minHeight: 0 }}>
            <div style={{ fontSize: 11, color: C.faint, letterSpacing: 2, marginBottom: 10, fontWeight: 500 }}>个人介绍</div>
            <div
              style={{
                fontSize: 14,
                color: C.text,
                lineHeight: 1.9,
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
                overflow: "hidden",
                display: "-webkit-box",
                WebkitLineClamp: 8,
                WebkitBoxOrient: "vertical",
              }}
            >
              {intro || "暂无介绍"}
            </div>
          </div>
        </div>
      </div>

      {/* 底部页脚 */}
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          height: 64,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 48px",
          borderTop: `1px solid ${C.line}`,
        }}
      >
        <span style={{ fontSize: 14, color: C.accentPressed, fontWeight: 600, letterSpacing: 1 }}>{footerText}</span>
        <div
          style={{
            width: 40,
            height: 40,
            border: qrCodeUrl ? "none" : `1px dashed ${C.lineStrong}`,
            borderRadius: 4,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            overflow: "hidden",
          }}
        >
          {qrCodeUrl ? (
            <img src={qrCodeUrl} alt="小程序码" style={{ width: 40, height: 40, objectFit: "contain" }} />
          ) : (
            <span style={{ fontSize: 9, color: C.faint }}>小程序码</span>
          )}
        </div>
      </div>
    </div>
  );
});

export function CreatorVisualization({ creators, onClose }: Props) {
  const [page, setPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [stage, setStage] = useState<"preview" | "generating" | "done" | "error">("preview");
  const [progress, setProgress] = useState(0);
  const [errorMsg, setErrorMsg] = useState("");
  const [isMobile, setIsMobile] = useState(false);
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
    fetch("/api/admin/viz/template-config")
      .then((res) => res.json())
      .then((data) => {
        if (data.config) {
          const year = new Date().getFullYear();
          setTemplateConfig({
            brandName: data.config.brandName,
            resolvedSubtitle: data.config.autoYear ? `${data.config.brandSubtitle} · ${year}` : data.config.brandSubtitle,
            footerText: data.config.footerText,
            qrCodeImageUrl: data.config.qrCodeImageUrl,
          });
        }
      })
      .catch(() => {});
  }, []);

  // 判断设备类型：有精确指针（鼠标）且不是移动端 UA = PC 端，否则 = 移动端
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

  // 翻页时滚动到顶部
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

  const doGenerate = useCallback(async () => {
    try {
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
        const fileName = `${String(i + 1).padStart(2, "0")}_${safeFileName(displayName)}.png`;
        zip.file(fileName, blob);
      }

      const zipBlob = await zip.generateAsync({ type: "blob" });
      const dateStr = new Date().toISOString().slice(0, 10);
      const fileName = `TDE用户可视化_${dateStr}_${selectedCreators.length}人.zip`;

      if (isMobile) {
        // 移动端：上传服务器，显示下载链接弹窗
        const formData = new FormData();
        formData.append("file", zipBlob, fileName);
        const uploadRes = await fetch("/api/admin/temp-upload", { method: "POST", body: formData });
        const uploadData = await uploadRes.json().catch(() => ({}));
        if (!uploadRes.ok || !uploadData.token) {
          throw new Error(uploadData.error || "生成下载链接失败");
        }
        setDownloadInfo({
          pageUrl: `/download/${uploadData.token}`,
          originalName: uploadData.originalName || fileName,
          size: uploadData.size || zipBlob.size,
          expiresAt: uploadData.expiresAt,
        });
      } else {
        // PC 端：直接弹出保存对话框
        const result = await saveBlobWithPicker(zipBlob, fileName, "application/zip");
        if (result === "cancelled") {
          setStage("preview");
          return;
        }
      }

      setStage("done");
    } catch (e) {
      console.error("可视化生成失败:", e);
      setErrorMsg(e instanceof Error ? e.message : "生成失败，请重试");
      setStage("error");
    }
  }, [isMobile, selectedCreators]);

  // 等待隐藏区域 DOM 渲染完成后，再开始生成（否则 pagesRef 为空）
  useEffect(() => {
    if (stage !== "generating") return;
    let cancelled = false;
    const raf1 = requestAnimationFrame(() => {
      requestAnimationFrame(async () => {
        if (cancelled) return;
        await doGenerate();
      });
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf1);
    };
  }, [doGenerate, stage]);

  // 筛选结果为空
  if (creators.length === 0) {
    return (
      <div className="dialog-backdrop" onMouseDown={onClose}>
        <div className="admin-editor" style={{ maxWidth: 480, textAlign: "center", padding: "48px 32px" }}>
          <div style={{ fontSize: 40, marginBottom: 16 }}>🔍</div>
          <p style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>请先筛选用户</p>
          <p style={{ color: C.muted, fontSize: 14, marginBottom: 24, lineHeight: 1.7 }}>
            可视化基于当前筛选结果。请先在用户管理页设置搜索词、标签、分级、城市等筛选条件，再打开可视化。
          </p>
          <button className="button primary" type="button" onClick={onClose}>
            知道了
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* 隐藏区域：导出时渲染所有勾选用户的 VizPage，用于 html2canvas 截图 */}
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

      <div className="dialog-backdrop" onMouseDown={onClose}>
        <div
          className="admin-editor"
          style={{ maxWidth: 1120, maxHeight: "92vh", display: "flex", flexDirection: "column" }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <header>
            <div>
              <p className="eyebrow">USER VISUALIZATION</p>
              <h2>用户可视化档案</h2>
              <p style={{ color: C.muted, fontSize: 13, marginTop: 4, marginBottom: 0 }}>
                共 {creators.length} 位用户（基于当前筛选结果），每页 {PAGE_SIZE} 位，已选{" "}
                <strong style={{ color: C.accentPressed }}>{selectedIds.size}</strong> 位
              </p>
            </div>
            <button type="button" onClick={onClose} aria-label="关闭" style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}>
              <X size={20} />
            </button>
          </header>

          {stage === "preview" && (
            <>
              {/* 工具栏 */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "10px 24px",
                  borderBottom: `1px solid ${C.line}`,
                  background: C.paper,
                }}
              >
                <button
                  type="button"
                  onClick={toggleSelectCurrentPage}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "6px 14px",
                    border: `1px solid ${C.line}`,
                    borderRadius: 6,
                    background: "#fff",
                    cursor: "pointer",
                    fontSize: 13,
                    color: C.text,
                  }}
                >
                  {allCurrentSelected ? <CheckSquare size={16} color={C.accentPressed} /> : <Square size={16} />}
                  {allCurrentSelected ? "取消当前页" : "全选当前页"}
                </button>
                <button
                  type="button"
                  onClick={clearSelection}
                  disabled={selectedIds.size === 0}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "6px 14px",
                    border: selectedIds.size === 0 ? `1px solid ${C.line}` : "1px solid #fecaca",
                    borderRadius: 6,
                    background: selectedIds.size === 0 ? C.surfaceSoft : "#fef2f2",
                    cursor: selectedIds.size === 0 ? "not-allowed" : "pointer",
                    fontSize: 13,
                    color: selectedIds.size === 0 ? C.faint : "#dc2626",
                    opacity: selectedIds.size === 0 ? 0.6 : 1,
                  }}
                >
                  <Trash2 size={14} />
                  清空选择
                </button>
              </div>

              {/* 预览卡片列表 */}
              <div
                ref={scrollRef}
                style={{
                  flex: 1,
                  overflowY: "auto",
                  padding: "20px 24px",
                  background: C.surfaceSoft,
                }}
              >
                {currentCreators.map((creator, i) => {
                  const isSelected = selectedIds.has(creator.id);
                  const displayName = creator.brandName || creator.userName || creator.phone || "TDE用户";
                  return (
                    <div
                      key={creator.id}
                      style={{
                        marginBottom: 20,
                        borderRadius: 8,
                        overflow: "hidden",
                        border: isSelected ? `2px solid ${C.accentPressed}` : `1px solid ${C.line}`,
                        boxShadow: isSelected ? `0 0 0 3px ${C.accentPressed}33` : "none",
                        background: "#fff",
                      }}
                    >
                      {/* 顶部操作栏：勾选框 + 品牌名 + 序号 */}
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
                      {/* 缩放后的 VizPage */}
                      <div
                        style={{
                          transform: `scale(${PREVIEW_SCALE})`,
                          transformOrigin: "top left",
                          width: `${PAGE_WIDTH}px`,
                          height: `${PAGE_HEIGHT}px`,
                        }}
                      >
                        <VizPage creator={creator} index={i} templateConfig={templateConfig || undefined} />
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* 底部：分页 + 导出 */}
              <footer
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "14px 24px",
                  borderTop: `1px solid ${C.line}`,
                  background: "#fff",
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
                <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                  <span style={{ fontSize: 14, color: C.muted }}>
                    已选 <strong style={{ color: C.accentPressed }}>{selectedIds.size}</strong> 位
                  </span>
                  <button
                    className="button primary"
                    type="button"
                    onClick={handleExport}
                    disabled={selectedIds.size === 0}
                    style={{ opacity: selectedIds.size === 0 ? 0.5 : 1, cursor: selectedIds.size === 0 ? "not-allowed" : "pointer" }}
                  >
                    <Download size={17} />
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
              <p style={{ color: C.faint, fontSize: 12, marginTop: 12 }}>生成后将显示下载二维码</p>
            </div>
          )}

          {stage === "done" && (
            <div style={{ textAlign: "center", padding: "48px 32px", flex: 1 }}>
              <CheckCircle2 size={40} style={{ color: C.success, marginBottom: 12 }} />
              <p style={{ fontWeight: 600, margin: "0 0 8px" }}>
                {isMobile ? "导出成功！" : "已保存到所选位置"}
              </p>
              <p style={{ color: C.muted, fontSize: 13, margin: 0 }}>
                {isMobile
                  ? `${selectedCreators.length} 张 PNG 已打包，复制链接或打开下载页获取文件`
                  : `${selectedCreators.length} 张 PNG 已保存到您选择的位置`}
              </p>
              {!isMobile && (
                <button
                  className="button secondary"
                  type="button"
                  onClick={() => setStage("preview")}
                  style={{ marginTop: 20 }}
                >
                  返回预览
                </button>
              )}
            </div>
          )}

          {stage === "error" && (
            <div style={{ padding: "32px", flex: 1 }}>
              <div style={{ background: C.dangerSoft, borderRadius: 8, padding: "16px 20px", color: C.danger, marginBottom: 16 }}>
                <p style={{ fontWeight: 600, margin: "0 0 6px" }}>生成失败</p>
                <p style={{ fontSize: 13, margin: 0 }}>{errorMsg}</p>
              </div>
              <button className="button primary" type="button" onClick={() => setStage("preview")}>
                返回预览
              </button>
            </div>
          )}
        </div>
      </div>

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
    </>
  );
}
