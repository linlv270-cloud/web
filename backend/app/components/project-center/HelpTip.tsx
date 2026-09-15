"use client";

import { CircleHelp, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import styles from "../ProjectCenter.module.css";

export function HelpTip({ label, children }: { label: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);
  return <span className={styles.helpTip} ref={ref}>
    <button className={styles.helpButton} type="button" aria-label={label} aria-expanded={open} aria-controls={id} onClick={() => setOpen((value) => !value)}><CircleHelp size={15} /></button>
    {open ? <span className={styles.helpPopover} id={id} role="status"><button className="icon-button" type="button" aria-label="关闭说明" onClick={() => setOpen(false)}><X size={13} /></button>{children}</span> : null}
  </span>;
}
