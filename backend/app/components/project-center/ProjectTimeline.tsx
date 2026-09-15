"use client";

import { CalendarClock, CircleAlert, LoaderCircle, Plus, Save, Undo2, X } from "lucide-react";
import { type DragEvent, useCallback, useEffect, useMemo, useState } from "react";
import { fetchJson } from "../client-request";
import { formatDate, labelTaskStatus } from "../project-center-formatters";
import type { AdminAccount, AdminPrincipal } from "../../../lib/types";
import type { ProjectPhase, ProjectMilestone } from "../project-center-types";
import { TaskDetail } from "./TaskDetail";
import { TaskEditor } from "./TaskEditor";
import styles from "../ProjectCenter.module.css";

type TimelineTask = Record<string, unknown> & {
  id: number; title: string; status: string; start_at?: string | null; due_at?: string | null;
  phase_id?: number; is_key?: number; blocker_reason?: string; waiting_for?: string; updated_at?: string;
  owner_id?: number | null;
};
type TimelineItem = { id: number; label: string; start: Date; end: Date; kind: "task" | "milestone"; task?: TimelineTask };

function parse(value: unknown) {
  if (!value) return null;
  const date = new Date(String(value));
  return Number.isFinite(date.getTime()) ? date : null;
}
function startOfDay(value: Date) { const date = new Date(value); date.setHours(0, 0, 0, 0); return date; }
function endOfDay(value: Date) { const date = new Date(value); date.setHours(23, 59, 59, 999); return date; }
function dateLabel(value: Date) { return new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", month: "2-digit", day: "2-digit" }).format(value); }
function toDateTimeLocal(value: Date) {
  const parts = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).formatToParts(value);
  const get = (type: string) => parts.find((part) => part.type === type)?.value || "";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}

export function ProjectTimeline({
  projectId, phases, milestones, admin, adminAccounts, canManage, onChanged,
}: {
  projectId: number; phases: ProjectPhase[]; milestones: ProjectMilestone[]; admin: AdminPrincipal;
  adminAccounts: AdminAccount[]; canManage: boolean; onChanged?: () => void;
}) {
  const [tasks, setTasks] = useState<TimelineTask[]>([]);
  const [mode, setMode] = useState<"day" | "week">("week");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [dragTaskId, setDragTaskId] = useState<number | null>(null);
  const [pendingDates, setPendingDates] = useState<Record<number, { startAt: string; dueAt: string; before: TimelineTask }>>({});
  const load = useCallback(async () => {
    setLoading(true);
    const result = await fetchJson(`/api/admin/projects/${projectId}/tasks?page=1&pageSize=100`, { cache: "no-store" });
    if (result.response.ok) setTasks(((result.data as { items: TimelineTask[] }).items || []));
    else setError(typeof result.data?.error === "string" ? result.data.error : "时间安排加载失败");
    setLoading(false);
  }, [projectId]);
  useEffect(() => { void load(); }, [load]);

  const dated = useMemo(() => {
    const items: TimelineItem[] = [];
    for (const task of tasks) {
      const start = parse(task.start_at); const end = parse(task.due_at);
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
    const unitDays = mode === "day" ? 1 : 7;
    const values: Date[] = [];
    for (let current = first.getTime(); current <= last.getTime(); current += unitDays * 86400000) values.push(new Date(current));
    return { first, last, values, unitDays };
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
  const taskOptions = tasks.map((task) => ({ id: task.id, title: task.title }));
  const nameOf = (id: unknown) => adminAccounts.find((account) => account.id === Number(id))?.name || adminAccounts.find((account) => account.id === Number(id))?.phone || "未指定";

  function dropOnTrack(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    if (!canManage || dragTaskId === null || !axis) return;
    const task = tasks.find((item) => item.id === dragTaskId);
    const start = parse(task?.start_at); const end = parse(task?.due_at);
    if (!task || !start || !end) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const fraction = Math.max(0, Math.min(0.999, (event.clientX - bounds.left) / bounds.width));
    const offsetDays = Math.round(fraction * axisUnits * axis.unitDays);
    const nextStart = new Date(axis.first.getTime() + offsetDays * 86400000);
    const duration = Math.max(0, end.getTime() - start.getTime());
    const nextEnd = new Date(nextStart.getTime() + duration);
    setPendingDates((current) => ({ ...current, [task.id]: { startAt: toDateTimeLocal(nextStart), dueAt: toDateTimeLocal(nextEnd), before: task } }));
    setDragTaskId(null);
  }

  async function saveDate(taskId: number) {
    const pending = pendingDates[taskId];
    if (!pending) return;
    const result = await fetchJson(`/api/admin/projects/${projectId}/tasks/${taskId}`, {
      method: "PATCH", headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: pending.before.title, phaseId: pending.before.phase_id || null, milestoneId: pending.before.milestone_id || null,
        description: pending.before.description || "", objective: pending.before.objective || "",
        sopVersionId: pending.before.sop_version_id || null,
        ownerId: pending.before.owner_id || null, approverId: pending.before.approver_id || null,
        priority: pending.before.priority || "NORMAL", startAt: pending.startAt, dueAt: pending.dueAt,
        estimatedHours: pending.before.estimated_hours || null, triggerText: pending.before.trigger_text || "",
        preconditions: pending.before.preconditions || "", inputs: pending.before.inputs || "",
        steps: pending.before.steps || [], deliverables: pending.before.deliverables || [],
        acceptanceCriteria: pending.before.acceptance_criteria || [], isCritical: Boolean(pending.before.is_key),
        collaboratorIds: [], dependencyTaskIds: [], expectedUpdatedAt: pending.before.updated_at,
      }),
    });
    if (!result.response.ok) setError(typeof result.data?.error === "string" ? result.data.error : "时间保存失败");
    else { setPendingDates((current) => { const next = { ...current }; delete next[taskId]; return next; }); await load(); onChanged?.(); }
  }

  if (loading) return <section className={styles.panel}><LoaderCircle className="spin" /> 正在读取时间安排</section>;
  return <section className={styles.panel}>
    <div className={styles.panelTitle}><div><h3>时间安排</h3><p>按日期安排工作，点开任务可在当前页面查看、编辑、提交和检查。</p></div><div className={styles.actionBar}><div className={styles.segmented}><button className={mode === "day" ? styles.active : ""} type="button" onClick={() => setMode("day")}>日</button><button className={mode === "week" ? styles.active : ""} type="button" onClick={() => setMode("week")}>周</button></div>{canManage ? <button className="button primary" type="button" onClick={() => setEditorOpen(true)}><Plus size={16} /> 安排一项工作</button> : null}</div></div>
    {error ? <p className="form-error">{error}</p> : null}
    {axis ? <div className={styles.timelineScroll}><div className={styles.timelineChart} style={{ "--timeline-columns": axis.values.length } as React.CSSProperties}>
      <div className={styles.timelineChartLabels}><span>工作步骤 / 工作</span><div className={styles.timelineAxisGrid}>{axis.values.map((value) => <span key={value.toISOString()}>{dateLabel(value)}</span>)}</div></div>
      {groups.map(({ phase, items }) => <div className={styles.timelineGroup} key={phase.id}><button className={styles.timelinePhase} type="button"><strong>{phase.code} · {phase.name}</strong><span>{items.length} 项工作 · {items.filter((item) => item.task?.status === "DONE").length} 项已完成</span></button>{items.map((item) => {
        if (!item.task) return null;
        const pending = pendingDates[item.task.id];
        const displayStart = pending ? new Date(pending.startAt) : item.start;
        const displayEnd = pending ? new Date(pending.dueAt) : item.end;
        return <div className={`${styles.timelineBarRow} ${item.task.is_key ? styles.critical : ""}`} key={`task-${item.id}`}>
          <button type="button" className={styles.timelineTaskLabel} onClick={() => setSelectedTaskId(item.id)}><strong>{item.task.is_key ? "★ " : ""}{item.label}</strong><span>{nameOf(item.task.owner_id)} · {labelTaskStatus(item.task.status)}</span></button>
          <div className={styles.timelineTrack} onDragOver={(event) => event.preventDefault()} onDrop={dropOnTrack}><button type="button" draggable={canManage} aria-label={`拖动调整${item.label}日期`} className={styles.timelineBar} style={position(displayStart, displayEnd)} onDragStart={() => setDragTaskId(item.task!.id)} onClick={() => setSelectedTaskId(item.id)}><small>{labelTaskStatus(item.task.status)}{item.task.blocker_reason ? ` · ${item.task.blocker_reason}` : item.task.waiting_for ? ` · 等待${item.task.waiting_for}` : ""}</small></button></div>
          {pending ? <div className={styles.timelinePending}><span>时间已调整，尚未保存</span><button className="button primary" type="button" onClick={() => void saveDate(item.task!.id)}><Save size={14} /> 保存这次调整</button><button className="button secondary" type="button" onClick={() => setPendingDates((current) => { const next = { ...current }; delete next[item.task!.id]; return next; })}><Undo2 size={14} /> 放弃</button></div> : null}
        </div>;
      })}</div>)}
      {milestones.filter((milestone) => parse(milestone.due_at)).map((milestone) => { const due = parse(milestone.due_at)!; return <button className={`${styles.timelineBarRow} ${styles.milestoneBar}`} key={`milestone-${milestone.id}`} type="button"><span><CalendarClock size={14} /> {milestone.code} · {milestone.name}</span><div className={styles.timelineTrack}><i style={position(startOfDay(due), endOfDay(due))} /><small>{formatDate(milestone.due_at, true)}</small></div></button>; })}
    </div></div> : <p className={styles.emptyInline}>还没有安排时间的工作。点击“安排一项工作”开始。</p>}
    {unscheduled.length ? <div className={styles.unscheduled}><strong>还没安排时间的工作（{unscheduled.length}）</strong><span>这些工作还没有开始和截止时间，安排好后会进入上面的时间表。</span>{unscheduled.map((task) => <button className={styles.linkButton} type="button" key={task.id} onClick={() => setSelectedTaskId(task.id)}>{task.title} · {labelTaskStatus(task.status)}{task.status === "BLOCKED" ? <CircleAlert size={14} /> : null}</button>)}</div> : null}
    {editorOpen ? <TaskEditor projectId={projectId} phases={phases} accounts={adminAccounts} taskOptions={taskOptions} onClose={() => setEditorOpen(false)} onSaved={() => { setEditorOpen(false); void load(); onChanged?.(); }} /> : null}
    {selectedTaskId !== null ? <div className={styles.drawerBackdrop} onMouseDown={() => setSelectedTaskId(null)}><aside className={styles.taskDrawer} onMouseDown={(event) => event.stopPropagation()}><div className={styles.drawerClose}><button className="icon-button" type="button" aria-label="关闭任务工作面板" onClick={() => setSelectedTaskId(null)}><X size={18} /></button></div><TaskDetail projectId={projectId} taskId={selectedTaskId} admin={admin} accounts={adminAccounts} phases={phases} taskOptions={taskOptions} canManage={canManage} onBack={() => setSelectedTaskId(null)} onChanged={() => { void load(); onChanged?.(); }} /></aside></div> : null}
  </section>;
}
