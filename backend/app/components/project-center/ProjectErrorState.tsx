"use client";

import { AlertTriangle, LockKeyhole, RefreshCw, ShieldAlert } from "lucide-react";
import styles from "../ProjectCenter.module.css";

export function ProjectErrorState({ status, message, onRetry }: { status?: number; message: string; onRetry?: () => void }) {
  const title = status === 401 ? "登录已失效" : status === 403 ? "没有项目权限" : status === 503 ? "项目中台尚未初始化" : "项目中台暂时无法读取";
  const Icon = status === 401 ? LockKeyhole : status === 403 ? ShieldAlert : AlertTriangle;
  return (
    <section className={styles.error}>
      <Icon size={24} />
      <h3>{title}</h3>
      <p>{message}</p>
      {status !== 401 && onRetry ? <button className="button secondary" type="button" onClick={onRetry}><RefreshCw size={16} /> 重新加载</button> : null}
    </section>
  );
}
