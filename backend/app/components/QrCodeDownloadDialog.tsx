"use client";

import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Copy, Download, X, Clock, Check, LoaderCircle } from "lucide-react";
import { saveBlobWithPicker } from "../../lib/download";
import { QIDENG_COLORS } from "../design-system-values";

interface QrCodeDownloadDialogProps {
  open: boolean;
  onClose: () => void;
  /** 相对下载路径，如 /api/admin/temp-download/xxx */
  downloadUrl: string;
  /** 原始文件名 */
  originalName: string;
  /** 文件大小（字节） */
  size: number;
  /** 过期时间戳（毫秒） */
  expiresAt: number;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatExpire(expiresAt: number): string {
  const diff = expiresAt - Date.now();
  if (diff <= 0) return "已过期";
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  if (hours > 0) return `${hours} 小时 ${minutes} 分钟后过期`;
  return `${minutes} 分钟后过期`;
}

export function QrCodeDownloadDialog({
  open,
  onClose,
  downloadUrl,
  originalName,
  size,
  expiresAt,
}: QrCodeDownloadDialogProps) {
  const [copied, setCopied] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [expireText, setExpireText] = useState("");
  const C = QIDENG_COLORS;

  // 完整下载 URL（二维码需要绝对地址，手机扫码才能访问）
  // 优先用环境变量配置的站点 URL（开发环境用局域网 IP，线上用域名）
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  const fullUrl = siteUrl
    ? `${siteUrl}${downloadUrl}`
    : typeof window !== "undefined"
      ? `${window.location.origin}${downloadUrl}`
      : downloadUrl;

  useEffect(() => {
    if (!open) return;
    setCopied(false);
    const update = () => setExpireText(formatExpire(expiresAt));
    update();
    const timer = setInterval(update, 30000);
    return () => clearInterval(timer);
  }, [open, expiresAt]);

  if (!open) return null;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(fullUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // 降级：选中文本
      const input = document.createElement("input");
      input.value = fullUrl;
      document.body.appendChild(input);
      input.select();
      document.execCommand("copy");
      document.body.removeChild(input);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleDirectDownload = async () => {
    if (downloading) return;
    setDownloading(true);
    try {
      const res = await fetch(downloadUrl);
      if (!res.ok) throw new Error("下载失败");
      const blob = await res.blob();
      // 弹出系统保存对话框，让用户选择存储位置
      const result = await saveBlobWithPicker(blob, originalName, "application/zip");
      if (result === "cancelled") return;
    } catch (e) {
      console.error("直接下载失败:", e);
      // 降级：传统下载
      const a = document.createElement("a");
      a.href = downloadUrl;
      a.download = originalName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="dialog-backdrop" onMouseDown={onClose}>
      <div
        className="admin-editor"
        style={{ maxWidth: 440, textAlign: "center" }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <p className="eyebrow">QR DOWNLOAD</p>
            <h2>手机扫码下载</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="关闭" style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}>
            <X size={20} />
          </button>
        </header>

        <div style={{ padding: "24px 0" }}>
          <div
            style={{
              display: "inline-block",
              padding: 16,
              background: C.surface,
              borderRadius: 12,
              border: `1px solid ${C.line}`,
            }}
          >
            <QRCodeSVG
              value={fullUrl}
              size={200}
              level="M"
              includeMargin={false}
            />
          </div>
        </div>

        <div style={{ marginBottom: 16 }}>
          <p style={{ fontWeight: 600, margin: "0 0 4px", wordBreak: "break-all" }}>
            {originalName}
          </p>
          <p style={{ color: C.muted, fontSize: 13, margin: 0 }}>
            {formatSize(size)} · {expireText}
          </p>
        </div>

        <div
          style={{
            display: "flex",
            gap: 8,
            marginBottom: 12,
          }}
        >
          <button
            type="button"
            onClick={handleCopy}
            style={{
              flex: 1,
              padding: "10px 16px",
              border: `1px solid ${C.line}`,
              borderRadius: 8,
              background: C.surface,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              fontSize: 14,
            }}
          >
            {copied ? <Check size={16} color={C.success} /> : <Copy size={16} />}
            {copied ? "已复制" : "复制链接"}
          </button>
          <button
            type="button"
            onClick={handleDirectDownload}
            disabled={downloading}
            style={{
              flex: 1,
              padding: "10px 16px",
              border: "none",
              borderRadius: 8,
              background: C.accentPressed,
              color: C.onAccent,
              cursor: downloading ? "wait" : "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              fontSize: 14,
              opacity: downloading ? 0.7 : 1,
            }}
          >
            {downloading ? (
              <>
                <LoaderCircle size={16} className="spin" />
                下载中…
              </>
            ) : (
              <>
                <Download size={16} />
                直接下载
              </>
            )}
          </button>
        </div>

        <p style={{ fontSize: 12, color: C.faint, margin: 0, display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}>
          <Clock size={12} />
          链接 24 小时内有效，过期后需重新生成
        </p>
      </div>
    </div>
  );
}
