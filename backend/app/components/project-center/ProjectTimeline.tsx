"use client";

import { CalendarClock, CircleAlert, LoaderCircle } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchJson } from "../client-request";
import { formatDate, labelTaskStatus } from "../project-center-formatters";
import type { AdminPrincipal } from "../../../lib/types";
import type { ProjectPhase, ProjectMilestone } from "../project-center-types";
import styles from "../ProjectCenter.module.css";

type TimelineTask = Record<string, unknown> & {
  id: number; title: string; status: string; start_at?: string | null; due_at?: string | null;
  phase_id?: number; is_key?: number; blocker_reason?: string; waiting_for?: string;
};
type TimelineItem = { id: number; label: string; start: Date; end: Date; kind: "task" | "milestone"; task?: TimelineTask };

function parse(value: unknown) {
  if (!value) return null;
  const date = new Date(String(value));
  return Number.isFinite(date.getTime()) ? date : null;
}

function startOfDay(value: Date) {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
}

function endOfDay(value: Date) {
  const date = new Date(value);
  date.setHours(23, 59, 59, 999);
  return date;
}

function dateLabel(value: Date) {
  return new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", month: "2-digit", day: "2-digit" }).format(value);
}

export function ProjectTimeline({
  projectId, phases, milestones, admin, onOpenTask, onOpenMilestone,
}: {
  projectId: number; phases: ProjectPhase[]; milestones: ProjectMilestone[];
  admin: AdminPrincipal; onOpenTask?: (taskId: number) => void; onOpenMilestone?: (milestoneId: number) => void;
}) {
  const [tasks, setTasks] = useState<TimelineTask[]>([]);
  const [mode, setMode] = useState<"day" | "week">("week");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    const result = await fetchJson(`/api/admin/projects/${projectId}/tasks?page=1&pageSize=100`, { cache: "no-store" });
    if (result.response.ok) setTasks(((result.data as { items: TimelineTask[] }).items || []));
    else setError(typeof result.data?.error === "string" ? result.data.error : "时间线加载失败");
    setLoading(false);
  }, [projectId]);
  useEffect(() => { void load(); }, [load]);

  const dated = useMemo(() => {
    const items: TimelineItem[] = [];
    for (const task of tasks) {
      const start = parse(task.start_at);
      const end = parse(task.due_at);
      if (start && end) items.push({ id: task.id, label: task.title, start, end: end < start ? start : end, kind: "task", task });
    }
    for (const milestone of milestones) {
      const due = parse(milestone.due_at);
      if (due) items.push({ id: milestone.id, label: milestone.name, start: startOfDay(due), end: endOfDay(due), kind: "milestone" });
    }
    return items;
  }, [milestones, tasks]);
  const axis = useMemo(() => {
    if (!dated.length) return null;
    const first = startOfDay(new Date(Math.min(...dated.map((item) => item.start.getTime()))));
    const last = endOfDay(new Date(Math.max(...dated.map((item) => item.end.getTime()))));
    const step = mode === "day" ? 86400000 : 7 * 86400000;
    const values: Date[] = [];
    for (let current = first.getTime(); current <= last.getTime(); current += step) values.push(new Date(current));
    return { first, last, values, unitDays: mode === "day" ? 1 : 7 };
  }, [dated, mode]);
  const axisUnits = axis ? Math.max(1, Math.ceil((axis.last.getTime() - axis.first.getTime()) / 86400000 / axis.unitDays)) : 1;
  const position = (start: Date, end: Date) => {
    if (!axis) return { left: "0%", width: "0%" };
    const left = Math.max(0, (start.getTime() - axis.first.getTime()) / 86400000 / axis.unitDays / axisUnits * 100);
    const right = Math.min(100, (end.getTime() - axis.first.getTime()) / 86400000 / axis.unitDays / axisUnits * 100);
    return { left: `${left}%`, width: `${Math.max(1.8, right - left)}%` };
  };
  const groups = phases.map((phase) => ({ phase, items: dated.filter((item) => item.kind === "task" && item.task?.phase_id === phase.id) }));
  const unscheduled = tasks.filter((task) => !parse(task.start_at) || !parse(task.due_at));
  if (loading) return <section className={styles.panel}><LoaderCircle className="spin" /> 正在读取时间线</section>;
  return <section className={styles.panel}>
    <div className={styles.panelTitle}><div><h3>项目时间线</h3><p>按真实日期绘制日 / 周轴；没有日期的任务保留在待排期区。</p></div><div className={styles.segmented}><button className={mode === "day" ? styles.active : ""} type="button" onClick={() => setMode("day")}>日</button><button className={mode === "week" ? styles.active : ""} type="button" onClick={() => setMode("week")}>周</button></div></div>
    {error ? <p className="form-error">{error}</p> : null}
    {axis ? <div className={styles.timelineScroll}><div className={styles.timelineChart} style={{ "--timeline-columns": axis.values.length } as React.CSSProperties}><div className={styles.timelineChartLabels}><span>阶段 / 对象</span><div className={styles.timelineAxisGrid}>{axis.values.map((value) => <span key={value.toISOString()}>{dateLabel(value)}</span>)}</div></div>{groups.map(({ phase, items }) => <div className={styles.timelineGroup} key={phase.id}><div className={styles.timelinePhase}><strong>{phase.code} · {phase.name}</strong><span>{formatDate(phase.starts_at, true)} 至 {formatDate(phase.due_at, true)}</span></div>{items.map((item) => item.task ? <button className={`${styles.timelineBarRow} ${item.task.is_key ? styles.critical : ""}`} key={`task-${item.id}`} type="button" onClick={() => onOpenTask?.(item.id)}><span>{item.task.is_key ? "★ " : ""}{item.label}</span><div className={styles.timelineTrack}><i style={position(item.start, item.end)} title={`${formatDate(item.start.toISOString(), true)} 至 ${formatDate(item.end.toISOString(), true)}`} /><small>{labelTaskStatus(item.task.status)}{item.task.blocker_reason ? ` · ${item.task.blocker_reason}` : item.task.waiting_for ? ` · 等待 ${item.task.waiting_for}` : ""}</small></div></button> : null)}</div>)}{milestones.filter((milestone) => parse(milestone.due_at)).map((milestone) => { const due = parse(milestone.due_at)!; return <button className={`${styles.timelineBarRow} ${styles.milestoneBar}`} key={`milestone-${milestone.id}`} type="button" onClick={() => onOpenMilestone?.(milestone.id)}><span><CalendarClock size={14} /> {milestone.code} · {milestone.name}</span><div className={styles.timelineTrack}><i style={position(startOfDay(due), endOfDay(due))} /><small>{milestone.status} · {formatDate(milestone.due_at, true)}</small></div></button>; })}</div></div> : <p className={styles.emptyInline}>暂无已排期任务或里程碑。</p>}
    {unscheduled.length ? <div className={styles.unscheduled}><strong>待排期任务（{unscheduled.length}）</strong>{unscheduled.map((task) => <button className={styles.linkButton} type="button" key={task.id} onClick={() => onOpenTask?.(task.id)}>{task.title} · {labelTaskStatus(task.status)}{task.status === "BLOCKED" ? <CircleAlert size={14} /> : null}</button>)}</div> : null}
  </section>;
}
