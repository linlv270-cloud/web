"use client";

import { useEffect, useState } from "react";
import { Copy, Check, X, ExternalLink, Clock, Package } from "lucide-react";
import { QIDENG_COLORS } from "../design-system-values";

interface DownloadLinkDialogProps {
  open: boolean;
  onClose: () => void;
  /** 下载中间页路径，如 /download/xxx */
  pageUrl: string;
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

export function DownloadLinkDialog({
  open,
  onClose,
  pageUrl,
  originalName,
  size,
  expiresAt,
}: DownloadLinkDialogProps) {
  const [copied, setCopied] = useState(false);
  const [expireText, setExpireText] = useState("");
  const C = QIDENG_COLORS;

  // 完整下载页 URL（用于复制）
  const fullPageUrl = typeof window !== "undefined"
    ? `${window.location.origin}${pageUrl}`
    : pageUrl;

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
      await navigator.clipboard.writeText(fullPageUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const input = document.createElement("input");
      input.value = fullPageUrl;
      document.body.appendChild(input);
      input.select();
      document.execCommand("copy");
      document.body.removeChild(input);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleOpen = () => {
    window.open(pageUrl, "_blank");
  };

  return (
    <div className="dialog-backdrop" onMouseDown={onClose}>
      <div
        className="admin-editor"
        style={{ maxWidth: 460, textAlign: "center" }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <p className="eyebrow">DOWNLOAD READY</p>
            <h2>导出成功</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭"
            style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}
          >
            <X size={20} />
          </button>
        </header>

        {/* 文件信息 */}
        <div style={{ padding: "20px 0" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              background: C.surface,
              borderRadius: 10,
              padding: "14px 16px",
              marginBottom: 16,
              textAlign: "left",
            }}
          >
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: 8,
                background: C.surfaceSoft,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <Package size={20} color={C.accentPressed} />
            </div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <p style={{ fontWeight: 600, fontSize: 14, margin: "0 0 2px", wordBreak: "break-all" }}>
                {originalName}
              </p>
              <p style={{ fontSize: 12, color: C.muted, margin: 0 }}>
                {formatSize(size)} · {expireText}
              </p>
            </div>
          </div>

          {/* 下载链接 */}
          <div style={{ textAlign: "left", marginBottom: 16 }}>
            <p style={{ fontSize: 12, color: C.muted, margin: "0 0 6px" }}>下载链接</p>
            <div
              style={{
                background: C.surface,
                border: `1px solid ${C.line}`,
                borderRadius: 8,
                padding: "10px 12px",
                fontSize: 12,
                color: C.text,
                wordBreak: "break-all",
                fontFamily: "monospace",
                maxHeight: 60,
                overflow: "auto",
              }}
            >
              {fullPageUrl}
            </div>
          </div>
        </div>

        {/* 操作按钮 */}
        <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
          <button
            type="button"
            onClick={handleCopy}
            style={{
              flex: 1,
              padding: "12px 16px",
              border: `1px solid ${C.line}`,
              borderRadius: 8,
              background: C.surface,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              fontSize: 14,
              fontWeight: 500,
            }}
          >
            {copied ? <Check size={16} color={C.success} /> : <Copy size={16} />}
            {copied ? "已复制" : "复制链接"}
          </button>
          <button
            type="button"
            onClick={handleOpen}
            style={{
              flex: 1,
              padding: "12px 16px",
              border: "none",
              borderRadius: 8,
              background: C.accentPressed,
              color: C.onAccent,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              fontSize: 14,
              fontWeight: 500,
            }}
          >
            <ExternalLink size={16} />
            打开下载页
          </button>
        </div>

        <p style={{ fontSize: 11, color: C.faint, margin: 0, display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}>
          <Clock size={12} />
          链接 24 小时内有效，可在任何设备的浏览器打开
        </p>
      </div>
    </div>
  );
}
