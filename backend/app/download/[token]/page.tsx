"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Download, Clock, AlertCircle, LoaderCircle, CheckCircle2, ChevronLeft } from "lucide-react";
import { saveBlobWithPicker } from "../../../lib/download";
import { QIDENG_COLORS } from "../../design-system-values";

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function DownloadPage() {
  const params = useParams();
  const token = params?.token as string;
  const [status, setStatus] = useState<"loading" | "ready" | "expired" | "error">("loading");
  const [fileName, setFileName] = useState("");
  const [fileSize, setFileSize] = useState(0);
  const [downloading, setDownloading] = useState(false);
  const [downloaded, setDownloaded] = useState(false);

  const downloadUrl = `/api/admin/temp-download/${token}`;

  const handleBack = () => {
    if (window.history.length > 1) {
      window.history.back();
    } else {
      window.location.href = "/admin";
    }
  };

  useEffect(() => {
    if (!token) {
      setStatus("error");
      return;
    }
    // 检查文件是否存在（HEAD 请求）
    fetch(downloadUrl, { method: "HEAD" })
      .then((res) => {
        if (res.ok) {
          const disposition = res.headers.get("Content-Disposition") || "";
          const match = disposition.match(/filename\*?=(?:UTF-8'')?["']?([^"';]+)/i);
          const name = match ? decodeURIComponent(match[1]) : "download.zip";
          const size = parseInt(res.headers.get("Content-Length") || "0", 10);
          setFileName(name);
          setFileSize(size);
          setStatus("ready");
        } else if (res.status === 404) {
          setStatus("expired");
        } else {
          setStatus("error");
        }
      })
      .catch(() => setStatus("error"));
  }, [token]);

  const handleDownload = async () => {
    if (downloading) return;
    setDownloading(true);
    try {
      const res = await fetch(downloadUrl);
      if (!res.ok) throw new Error("下载失败");
      const blob = await res.blob();
      // 优先弹出保存对话框（支持的浏览器），不支持的自动降级到传统下载
      const result = await saveBlobWithPicker(blob, fileName || "download.zip", "application/zip");
      if (result === "cancelled") {
        setDownloading(false);
        return;
      }
      setDownloaded(true);
    } catch (e) {
      console.error("下载失败:", e);
      alert("下载失败，请重试");
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background: QIDENG_COLORS.surface,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
        fontFamily: '"PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", -apple-system, sans-serif',
      }}
    >
      <div
        style={{
          maxWidth: 440,
          width: "100%",
          background: QIDENG_COLORS.surface,
          borderRadius: 16,
          boxShadow: `0 4px 24px ${QIDENG_COLORS.shadowSoft}`,
          padding: "32px 28px",
          textAlign: "center",
        }}
      >
        {/* 顶部：返回按钮 + 品牌 */}
        <div style={{ display: "flex", alignItems: "center", marginBottom: 24, position: "relative" }}>
          <button
            type="button"
            onClick={handleBack}
            style={{
              position: "absolute",
              left: 0,
              top: "50%",
              transform: "translateY(-50%)",
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: 6,
              borderRadius: 6,
              display: "flex",
              alignItems: "center",
              color: QIDENG_COLORS.muted,
            }}
            aria-label="返回"
          >
            <ChevronLeft size={20} />
          </button>
          <div style={{ margin: "0 auto" }}>
            <span style={{ fontSize: 24, fontWeight: 700, color: QIDENG_COLORS.accentPressed, letterSpacing: 2 }}>TDE</span>
            <span style={{ fontSize: 10, color: QIDENG_COLORS.faint, letterSpacing: 3, marginLeft: 8 }}>COCOC</span>
          </div>
        </div>

        {status === "loading" && (
          <div style={{ padding: "32px 0" }}>
            <LoaderCircle className="spin" size={32} style={{ color: QIDENG_COLORS.accentPressed, marginBottom: 12 }} />
            <p style={{ color: QIDENG_COLORS.muted, fontSize: 14, margin: 0 }}>正在检查文件…</p>
          </div>
        )}

        {status === "expired" && (
          <div style={{ padding: "16px 0" }}>
            <AlertCircle size={40} style={{ color: QIDENG_COLORS.danger, marginBottom: 12 }} />
            <p style={{ fontWeight: 600, fontSize: 16, color: QIDENG_COLORS.ink, margin: "0 0 8px" }}>链接已过期</p>
            <p style={{ color: QIDENG_COLORS.muted, fontSize: 13, lineHeight: 1.7, margin: 0 }}>
              下载链接有效期为 24 小时，当前链接已过期。<br />
              请在运营台重新生成下载链接。
            </p>
          </div>
        )}

        {status === "error" && (
          <div style={{ padding: "16px 0" }}>
            <AlertCircle size={40} style={{ color: QIDENG_COLORS.danger, marginBottom: 12 }} />
            <p style={{ fontWeight: 600, fontSize: 16, color: QIDENG_COLORS.ink, margin: "0 0 8px" }}>链接无效</p>
            <p style={{ color: QIDENG_COLORS.muted, fontSize: 13, margin: 0 }}>请检查链接是否正确，或重新生成。</p>
          </div>
        )}

        {status === "ready" && (
          <>
            {/* 文件图标 */}
            <div
              style={{
                width: 64,
                height: 64,
                borderRadius: 12,
                background: QIDENG_COLORS.surfaceSoft,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                margin: "0 auto 16px",
              }}
            >
              <Download size={28} color={QIDENG_COLORS.accentPressed} />
            </div>

            {/* 文件名 */}
            <p style={{ fontWeight: 600, fontSize: 16, color: QIDENG_COLORS.ink, margin: "0 0 4px", wordBreak: "break-all" }}>
              {fileName}
            </p>
            <p style={{ color: QIDENG_COLORS.muted, fontSize: 13, margin: "0 0 20px" }}>
              {formatSize(fileSize)}
            </p>

            {/* 有效期提示 */}
            <div
              style={{
                background: QIDENG_COLORS.surface,
                borderRadius: 8,
                padding: "10px 16px",
                marginBottom: 20,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
              }}
            >
              <Clock size={14} color={QIDENG_COLORS.muted} />
              <span style={{ fontSize: 12, color: QIDENG_COLORS.muted }}>链接 24 小时内有效，过期后需重新生成</span>
            </div>

            {/* 下载按钮 */}
            <button
              type="button"
              onClick={handleDownload}
              disabled={downloading}
              style={{
                width: "100%",
                padding: "14px 24px",
                border: "none",
                borderRadius: 10,
                background: downloaded ? QIDENG_COLORS.success : QIDENG_COLORS.accentPressed,
                color: QIDENG_COLORS.onAccent,
                fontSize: 16,
                fontWeight: 600,
                cursor: downloading ? "wait" : "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                opacity: downloading ? 0.8 : 1,
              }}
            >
              {downloading ? (
                <>
                  <LoaderCircle size={18} className="spin" />
                  下载中…
                </>
              ) : downloaded ? (
                <>
                  <CheckCircle2 size={18} />
                  已开始下载
                </>
              ) : (
                <>
                  <Download size={18} />
                  下载文件
                </>
              )}
            </button>

            <p style={{ fontSize: 11, color: QIDENG_COLORS.faint, marginTop: 12, marginBottom: 0 }}>
              电脑端点击后可选择保存位置，手机端将保存到下载目录
            </p>
          </>
        )}
      </div>
    </div>
  );
}
