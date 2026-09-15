"use client";

import { Bell, Check, ExternalLink, LoaderCircle, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { fetchJson } from "../client-request";
import { formatDate, labelTaskStatus } from "../project-center-formatters";
import type { AdminPrincipal } from "../../../lib/types";
import styles from "../ProjectCenter.module.css";

type WorkItem = { id: number; projectId: number; projectName: string; projectCode: string; phaseName: string; title: string; status: string; dueAt: string | null; ownerName: string; overdue: boolean; needsReview: boolean; isKey: boolean };
type Notification = { id: number; projectId: number; taskId: number | null; projectName: string; taskTitle: string; title: string; body: string; createdAt: string; readAt: string | null };

export function ProjectWork({ admin, onOpenProject }: { admin: AdminPrincipal; onOpenProject: (projectId: number, taskId?: number) => void }) {
  const [items, setItems] = useState<WorkItem[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [scope, setScope] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    setLoading(true);
    const [work, notices] = await Promise.all([
      fetchJson(`/api/admin/project-work?scope=${scope}`, { cache: "no-store" }),
      fetchJson("/api/admin/project-notifications?limit=20", { cache: "no-store" }),
    ]);
    if (work.response.ok) setItems(((work.data as { items?: WorkItem[] }).items || []));
    else setError(typeof work.data?.error === "string" ? work.data.error : "我的工作加载失败");
    if (notices.response.ok) {
      const data = notices.data as { items?: Notification[]; unreadCount?: number };
      setNotifications(data.items || []); setUnreadCount(Number(data.unreadCount || 0));
    }
    setLoading(false);
  }, [scope]);
  useEffect(() => { void load(); }, [load]);
  async function markRead(notificationId: number) {
    await fetchJson("/api/admin/project-notifications", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ notificationId }) });
    void load();
  }
  return <div className={styles.workGrid}>
    <section className={styles.panel}><div className={styles.panelTitle}><div><h3>我的工作</h3><p>这里显示你负责、协助或需要检查的工作，和项目时间安排使用同一条任务。</p></div><button className="button secondary" type="button" onClick={() => void load()}><RefreshCw size={15} /> 刷新</button></div>
      <div className={styles.detailTabs}><button className={scope === "all" ? styles.active : ""} type="button" onClick={() => setScope("all")}>全部</button><button className={scope === "owner" ? styles.active : ""} type="button" onClick={() => setScope("owner")}>我负责</button><button className={scope === "collaborator" ? styles.active : ""} type="button" onClick={() => setScope("collaborator")}>我协助</button><button className={scope === "review" ? styles.active : ""} type="button" onClick={() => setScope("review")}>等我检查</button></div>
      {loading ? <div className={styles.empty}><LoaderCircle className="spin" /> 正在读取</div> : error ? <p className="form-error">{error}</p> : items.length ? <div className={styles.workList}>{items.map((item) => <button className={styles.workItem} type="button" key={`${item.projectId}-${item.id}`} onClick={() => onOpenProject(item.projectId, item.id)}><span className={styles.workItemTop}><strong>{item.isKey ? "★ " : ""}{item.title}</strong><span className={item.overdue ? styles.red : ""}>{item.overdue ? "已逾期" : labelTaskStatus(item.status)}</span></span><span>{item.projectName} · {item.phaseName || "未分配步骤"}</span><span>负责人：{item.ownerName} · 截止：{formatDate(item.dueAt, true)}{item.needsReview ? " · 等我检查" : ""}</span></button>)}</div> : <div className={styles.empty}><p>现在没有需要处理的工作。</p><small>任务发布后会自动出现在这里。</small></div>}
    </section>
    <section className={styles.panel}><div className={styles.panelTitle}><div><h3>内部提醒 <span className={styles.countBadge}>{unreadCount}</span></h3><p>点击提醒可以直接打开对应工作。</p></div><button className="button secondary" type="button" onClick={async () => { await fetchJson("/api/admin/project-notifications", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ all: true }) }); void load(); }}><Check size={15} /> 全部标为已读</button></div>{notifications.length ? <div className={styles.notificationList}>{notifications.map((notice) => <article className={`${styles.notificationItem} ${notice.readAt ? "" : styles.unread}`} key={notice.id}><button type="button" onClick={() => { void markRead(notice.id); if (notice.taskId) onOpenProject(notice.projectId, notice.taskId); else onOpenProject(notice.projectId); }}><strong>{notice.title}</strong><span>{notice.body}</span><small>{notice.projectName} · {notice.taskTitle || "项目"} · {formatDate(notice.createdAt, true)} <ExternalLink size={12} /></small></button></article>)}</div> : <div className={styles.empty}><Bell size={24} /><p>还没有内部提醒。</p></div>}</section>
  </div>;
}
