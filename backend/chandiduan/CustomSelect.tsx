"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Check } from "lucide-react";

interface Option {
  value: string;
  label: string;
}

interface CustomSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: Option[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

export function CustomSelect({
  value,
  onChange,
  options,
  placeholder = "请选择",
  disabled = false,
  className = "",
}: CustomSelectProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const selected = options.find((opt) => opt.value === value);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const handleSelect = (optValue: string) => {
    setOpen(false);
    onChange(optValue);
  };

  return (
    <div ref={containerRef} style={{ position: "relative", width: "100%" }} className={className}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen(!open)}
        style={{
          width: "100%",
          minHeight: 42,
          padding: "8px 36px 8px 10px",
          fontSize: "var(--type-secondary, 14px)",
          border: "1px solid var(--line, #ddd)",
          borderRadius: "var(--radius-sm, 6px)",
          background: disabled ? "var(--surface-soft, #f5f5f5)" : "#fff",
          color: selected ? "var(--ink, #333)" : "var(--muted, #999)",
          cursor: disabled ? "not-allowed" : "pointer",
          textAlign: "left",
          display: "flex",
          alignItems: "center",
          position: "relative",
          lineHeight: 1.4,
        }}
      >
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", width: "100%" }}>
          {selected ? selected.label : placeholder}
        </span>
        <ChevronDown
          size={16}
          style={{
            position: "absolute",
            right: 10,
            top: "50%",
            transform: `translateY(-50%) ${open ? "rotate(180deg)" : ""}`,
            transition: "transform 0.15s",
            color: "var(--muted, #999)",
            pointerEvents: "none",
          }}
        />
      </button>

      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            left: 0,
            right: 0,
            maxHeight: 280,
            overflowY: "auto",
            background: "#fff",
            border: "1px solid var(--line, #ddd)",
            borderRadius: "var(--radius-sm, 6px)",
            boxShadow: "0 4px 16px rgba(0,0,0,0.12)",
            zIndex: 1000,
          }}
        >
          {options.length === 0 ? (
            <div style={{ padding: "12px 14px", color: "var(--muted, #999)", fontSize: 14 }}>
              暂无选项
            </div>
          ) : (
            options.map((opt) => {
              const isSelected = opt.value === value;
              return (
                <button
                  key={opt.value || "empty"}
                  type="button"
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    handleSelect(opt.value);
                  }}
                  style={{
                    width: "100%",
                    padding: "10px 14px",
                    border: "none",
                    background: isSelected ? "var(--surface, #f8f8f8)" : "transparent",
                    color: isSelected ? "var(--ink, #333)" : "var(--text, #555)",
                    cursor: "pointer",
                    textAlign: "left",
                    fontSize: "var(--type-secondary, 14px)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 8,
                    lineHeight: 1.4,
                  }}
                  onMouseEnter={(e) => {
                    if (!isSelected) e.currentTarget.style.background = "var(--surface-soft, #f5f5f5)";
                  }}
                  onMouseLeave={(e) => {
                    if (!isSelected) e.currentTarget.style.background = "transparent";
                  }}
                >
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {opt.label}
                  </span>
                  {isSelected && <Check size={16} style={{ color: "var(--ink, #333)", flexShrink: 0 }} />}
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
