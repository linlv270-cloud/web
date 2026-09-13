"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { LoaderCircle, Plus } from "lucide-react";
import { fetchJson } from "../client-request";
import { formatDate, labelTaskStatus } from "../project-center-formatters";
import type { AdminAccount, AdminPrincipal } from "../../../lib/types";
import type { ProjectPhase, ProjectTaskResponse } from "../project-center-types";
import { TaskDetail } from "./TaskDetail";
import { TaskEditor } from "./TaskEditor";
import styles from "../ProjectCenter.module.css";

export function ProjectTasks({
  projectId,
  phases,
  admin,
  adminAccounts,
  canManage,
  initialTaskId,
}: {
  projectId: number;
  phases: ProjectPhase[];
  admin: AdminPrincipal;
  adminAccounts: AdminAccount[];
  canManage: boolean;
  initialTaskId?: number;
}) {
  const [scope, setScope] = useState("");
  const [status, setStatus] = useState("");
  const [phaseId, setPhaseId] = useState("");
  const [ownerId, setOwnerId] = useState("");
  const [critical, setCritical] = useState(false);
  const [view, setView] = useState<"list" | "board">("list");
  const [selectedDrafts, setSelectedDrafts] = useState<number[]>([]);
  const [data, setData] = useState<ProjectTaskResponse | null>(null);
  const [selected, setSelected] = useState<number | null>(initialTaskId ?? null);
  const [editor, setEditor] = useState(false);
  const [publishConfirm, setPublishConfirm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const accounts = useMemo(() => new Map(adminAccounts.map((account) => [account.id, account.name || account.phone])), [adminAccounts]);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: "1", pageSize: "100" });
    if (scope) params.set("scope", scope);
    if (status) params.set("status", status);
    if (phaseId) params.set("phaseId", phaseId);
    if (ownerId) params.set("ownerId", ownerId);
    if (critical) params.set("critical", "1");
    const result = await fetchJson(`/api/admin/projects/${projectId}/tasks?${params}`, { cache: "no-store" });
    if (result.response.ok) {
      setData(result.data as ProjectTaskResponse);
      setError("");
    } else setError(typeof result.data?.error === "string" ? result.data.error : "任务列表加载失败");
    setLoading(false);
  }, [critical, ownerId, phaseId, projectId, scope, status]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (initialTaskId) setSelected(initialTaskId);
  }, [initialTaskId]);

  function requestPublish() {
    setPublishConfirm(true);
  }

  async function publish() {
    setPublishConfirm(false);
    const result = await fetchJson(`/api/admin/projects/${projectId}/publish-plan`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(selectedDrafts.length ? { taskIds: selectedDrafts } : {}) });
    if (!result.response.ok) setError(typeof result.data?.error === "string" ? result.data.error : "发布计划失败");
    else { setSelectedDrafts([]); void load(); }
  }
  const options = (data?.items || []).map((task) => ({ id: task.id, title: task.title }));
  if (selected !== null) return <TaskDetail projectId={projectId} taskId={selected} admin={admin} accounts={adminAccounts} phases={phases} taskOptions={options} canManage={canManage} onBack={() => setSelected(null)} onChanged={() => void load()} />;

  return <section className={styles.panel}>
    <div className={styles.panelTitle}><div><h3>任务执行</h3><p>从草稿发布计划，再按负责人、依赖和验收流程推进任务。</p></div><div className={styles.actionBar}>{canManage ? <><button className="button secondary" type="button" onClick={() => setEditor(true)}><Plus size={16} /> 新建任务</button><button className="button primary" type="button" onClick={requestPublish}>发布合格草稿</button></> : null}{loading ? <LoaderCircle size={17} className="spin" /> : null}</div></div>
    <div className={styles.detailTabs}><button className={!scope ? styles.active : ""} type="button" onClick={() => setScope("")}>全部任务</button><button className={scope === "mine" ? styles.active : ""} type="button" onClick={() => setScope("mine")}>我的任务</button><button className={scope === "review" ? styles.active : ""} type="button" onClick={() => setScope("review")}>待我验收</button><span className={styles.tabSpacer} /><button className={view === "list" ? styles.active : ""} type="button" onClick={() => setView("list")}>列表</button><button className={view === "board" ? styles.active : ""} type="button" onClick={() => setView("board")}>看板</button></div>
    <div className={styles.filterGrid}><label className={styles.field}><span>任务状态</span><select value={status} onChange={(event) => setStatus(event.target.value)}><option value="">全部状态</option>{["DRAFT", "READY", "IN_PROGRESS", "WAITING_EXTERNAL", "WAITING_INTERNAL", "BLOCKED", "REVIEW", "REVISION_REQUIRED", "DONE", "CANCELLED"].map((value) => <option key={value} value={value}>{labelTaskStatus(value)}</option>)}</select></label><label className={styles.field}><span>阶段</span><select value={phaseId} onChange={(event) => setPhaseId(event.target.value)}><option value="">全部阶段</option>{phases.map((phase) => <option key={phase.id} value={phase.id}>{phase.code} · {phase.name}</option>)}</select></label><label className={styles.field}><span>负责人</span><select value={ownerId} onChange={(event) => setOwnerId(event.target.value)}><option value="">全部负责人</option>{adminAccounts.filter((account) => account.status === "active").map((account) => <option key={account.id} value={account.id}>{account.name || account.phone}</option>)}</select></label><label className={styles.checkboxField}><input type="checkbox" checked={critical} onChange={(event) => setCritical(event.target.checked)} /> 仅关键任务</label></div>
    {error ? <p className="form-error">{error}</p> : null}
    {data?.items.length && view === "list" ? <div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>发布</th><th>任务</th><th>阶段</th><th>负责人</th><th>验收人</th><th>状态</th><th>截止时间</th></tr></thead><tbody>{data.items.map((task) => <tr key={task.id}><td>{task.status === "DRAFT" && canManage ? <input type="checkbox" checked={selectedDrafts.includes(task.id)} onChange={(event) => setSelectedDrafts((current) => event.target.checked ? [...current, task.id] : current.filter((id) => id !== task.id))} aria-label={`选择发布 ${task.title}`} /> : null}</td><td className={styles.projectName}><button className={styles.linkButton} type="button" onClick={() => setSelected(task.id)}>{task.title}</button><span>{task.code}</span></td><td>{task.phase_name || "未分配阶段"}</td><td>{accounts.get(task.owner_id || 0) || "未指定"}</td><td>{accounts.get(task.approver_id || 0) || "未指定"}</td><td><span className={styles.badge}>{labelTaskStatus(task.status)}</span></td><td>{formatDate(task.due_at, true)}</td></tr>)}</tbody></table></div> : null}
    {data?.items.length && view === "board" ? <div className={styles.board}>{["DRAFT", "READY", "IN_PROGRESS", "WAITING_EXTERNAL", "WAITING_INTERNAL", "BLOCKED", "REVIEW", "REVISION_REQUIRED", "DONE", "CANCELLED"].map((column) => { const columnTasks = data.items.filter((task) => task.status === column); return <section className={styles.boardColumn} key={column}><header><strong>{labelTaskStatus(column)}</strong><span>{columnTasks.length}</span></header>{columnTasks.map((task) => <button className={styles.taskCard} type="button" key={task.id} onClick={() => setSelected(task.id)}><strong>{task.is_key ? "★ " : ""}{task.title}</strong><span>{task.phase_name || "未分配阶段"} · {accounts.get(task.owner_id || 0) || "未指定负责人"}</span><span>验收：{accounts.get(task.approver_id || 0) || "未指定"} · {formatDate(task.due_at, true)}</span>{task.blocker_reason ? <small>阻塞：{task.blocker_reason}</small> : null}</button>)}</section>; })}</div> : null}
    {!loading && !error && !data?.items.length ? <div className={styles.empty}><p>当前条件下没有任务。</p></div> : null}
    {editor ? <TaskEditor projectId={projectId} phases={phases} accounts={adminAccounts} taskOptions={options} onClose={() => setEditor(false)} onSaved={() => { setEditor(false); void load(); }} /> : null}
    {publishConfirm ? <div className={styles.modalBackdrop}><section className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="publish-plan-title"><header className={styles.modalHeader}><div><p className={styles.eyebrow}>PUBLISH PLAN</p><h2 id="publish-plan-title">确认发布执行计划</h2></div></header><div className={styles.modalBody}><p>发布后，{selectedDrafts.length ? `选中的 ${selectedDrafts.length} 个草稿` : "全部合格草稿"}将正式进入执行计划。负责人可以开始执行，后续状态与验收记录将被保留。</p></div><footer className={styles.modalFooter}><button className="button secondary" type="button" onClick={() => setPublishConfirm(false)}>取消</button><button className="button primary" type="button" onClick={() => void publish()}>确认发布</button></footer></section></div> : null}
  </section>;
}
