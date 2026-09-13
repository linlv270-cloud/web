"use client";

import { AlertTriangle, Clock3, LoaderCircle, RefreshCw, ShieldAlert, Users } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { fetchJson } from "../client-request";
import { formatDate, labelHealth, labelTaskStatus } from "../project-center-formatters";
import type { AdminPrincipal } from "../../../lib/types";
import styles from "../ProjectCenter.module.css";

type Dashboard = {
  generatedAt: string;
  scopeProjectCount: number;
  stats: Record<string, number>;
  redProjects: Array<Record<string, unknown>>;
  yellowProjects: Array<Record<string, unknown>>;
  upcomingKeyMilestones: Array<Record<string, unknown>>;
  overdueKeyMilestones: Array<Record<string, unknown>>;
  blockedTasks: Array<Record<string, unknown>>;
  pendingDecisions: Array<Record<string, unknown>>;
  externalFollowUp: Array<Record<string, unknown>>;
  pendingReviewTasks: Array<Record<string, unknown>>;
  memberLoad: Array<Record<string, unknown>>;
};

const statLabels: Record<string, string> = {
  activeProjects: "进行中项目",
  openingWithin30Days: "30天内开场",
  dueThisWeek: "本周到期任务",
  overdueTasks: "已逾期任务",
  blockedTasks: "阻塞任务",
  externalFollowUpDue: "外部待跟进",
  pendingReviewTasks: "待验收任务",
  redProjects: "红色项目",
  yellowProjects: "黄色项目",
  pendingDecisions: "待决策事项",
  highRisks: "未关闭高风险",
};

export function ProjectDashboard({ admin, onOpenProject }: { admin: AdminPrincipal; onOpenProject?: (projectId: number) => void }) {
  const [data, setData] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    setLoading(true);
    const result = await fetchJson("/api/admin/project-dashboard", { cache: "no-store" });
    if (result.response.ok) { setData(result.data as Dashboard); setError(""); }
    else setError(typeof result.data?.error === "string" ? result.data.error : "驾驶舱加载失败");
    setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);
  if (loading && !data) return <section className={styles.panel}><div className={styles.empty}><LoaderCircle size={24} className="spin" /><p>正在读取项目驾驶舱</p></div></section>;
  if (!data) return <section className={styles.panel}><p className="form-error">{error || "驾驶舱暂时无法打开"}</p><button className="button secondary" type="button" onClick={() => void load()}>重新加载</button></section>;
  const metricKeys = ["activeProjects", "openingWithin30Days", "dueThisWeek", "overdueTasks", "blockedTasks", "externalFollowUpDue", "pendingReviewTasks", "redProjects", "yellowProjects", "pendingDecisions", "highRisks"];
  const list = (title: string, items: Array<Record<string, unknown>>, render: (item: Record<string, unknown>) => React.ReactNode) => <section className={styles.dashboardBlock}><div className={styles.panelTitle}><h3>{title}</h3><span>{items.length}</span></div>{items.length ? <div className={styles.dashboardList}>{items.slice(0, 12).map((item, index) => <button className={styles.dashboardRow} type="button" key={String(item.id || item.code || index)} onClick={() => { const projectId = Number(item.project_id || item.id); if (projectId && onOpenProject) onOpenProject(projectId); }}>{render(item)}</button>)}</div> : <p className={styles.emptyInline}>暂无需要处理的事项。</p>}</section>;
  return <div className={styles.dashboard}>
    <section className={styles.intro}><div className={styles.introTitle}><div><p className={styles.eyebrow}>PROJECT CONTROL TOWER</p><h2>项目驾驶舱</h2><p>当前账号可见的 {data.scopeProjectCount} 个项目，按真实项目权限聚合。</p></div><button className="button secondary" type="button" onClick={() => void load()} disabled={loading}><RefreshCw size={16} className={loading ? "spin" : ""} /> 刷新</button></div></section>
    <section className={styles.dashboardMetrics}>{metricKeys.map((key) => <div className={styles.summaryCard} key={key}><span>{statLabels[key]}</span><strong>{data.stats[key] || 0}</strong></div>)}</section>
    <div className={styles.dashboardColumns}>
      {list("红色项目", data.redProjects, (item) => <><ShieldAlert size={18} className={styles.red} /><div><strong>{String(item.name)}</strong><small>{String(item.code)} · {String(item.status)}</small><span>{(item.healthReasons as string[] || []).join("；")}</span></div></>)}
      {list("黄色项目", data.yellowProjects, (item) => <><AlertTriangle size={18} className={styles.yellow} /><div><strong>{String(item.name)}</strong><small>{String(item.code)} · {labelHealth(String(item.health))}</small><span>{(item.healthReasons as string[] || []).join("；")}</span></div></>)}
      {list("即将到期关键里程碑", data.upcomingKeyMilestones, (item) => <><Clock3 size={18} /><div><strong>{String(item.name)}</strong><small>{String(item.project_name)} · 截止 {formatDate(String(item.due_at || ""), true)}</small></div></>)}
      {list("逾期关键里程碑", data.overdueKeyMilestones, (item) => <><AlertTriangle size={18} className={styles.red} /><div><strong>{String(item.name)}</strong><small>{String(item.project_name)} · 截止 {formatDate(String(item.due_at || ""), true)}</small></div></>)}
      {list("阻塞任务", data.blockedTasks, (item) => <><ShieldAlert size={18} className={styles.red} /><div><strong>{String(item.title)}</strong><small>{String(item.project_name)} · {String(item.blocker_reason || "已阻塞")}</small></div></>)}
      {list("待管理者决策", data.pendingDecisions, (item) => <><AlertTriangle size={18} className={styles.yellow} /><div><strong>{String(item.title)}</strong><small>{String(item.project_name)} · {String(item.status)}</small></div></>)}
      {list("外部等待跟进", data.externalFollowUp, (item) => <><Clock3 size={18} /><div><strong>{String(item.title)}</strong><small>{String(item.project_name)} · {String(item.waiting_for || "外部事项")}</small></div></>)}
      {list("待我验收", data.pendingReviewTasks, (item) => <><Clock3 size={18} /><div><strong>{String(item.title)}</strong><small>{String(item.project_name)} · {labelTaskStatus(String(item.status))}</small></div></>)}
    </div>
    <section className={styles.panel}><div className={styles.panelTitle}><div><h3>人员任务负荷</h3><p>仅展示工作量事实，不用单一数量对成员做评价。</p></div><Users size={19} /></div>{data.memberLoad.length ? <div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>成员</th><th>进行中任务</th><th>本周到期</th><th>逾期</th><th>待验收</th><th>预计工时</th><th>阻塞他人</th></tr></thead><tbody>{data.memberLoad.map((item) => <tr key={String(item.id)}><td>{String(item.name || item.phone)}</td><td>{Number(item.active_count || 0)}</td><td>{Number(item.due_this_week || 0)}</td><td>{Number(item.overdue_count || 0)}</td><td>{Number(item.pending_review || 0)}</td><td>{Number(item.estimated_hours || 0).toFixed(1)} h</td><td>{Number(item.blocked_count || 0)}</td></tr>)}</tbody></table></div> : <p className={styles.emptyInline}>暂无任务负荷数据。</p>}</section>
  </div>;
}
