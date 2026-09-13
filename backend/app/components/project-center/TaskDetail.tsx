"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, Check, CircleAlert, LoaderCircle, Pencil, Play, RotateCcw, Send, X } from "lucide-react";
import { fetchJson } from "../client-request";
import { formatDate, labelTaskStatus, textValue } from "../project-center-formatters";
import type { AdminAccount, AdminPrincipal } from "../../../lib/types";
import type { ProjectPhase } from "../project-center-types";
import { TaskEditor } from "./TaskEditor";
import styles from "../ProjectCenter.module.css";

type Task = Record<string, unknown> & {
  id: number;
  title: string;
  status: string;
  owner_id: number | null;
  approver_id: number | null;
  due_at: string | null;
  objective?: string;
  steps?: string[];
  deliverables?: string | string[];
  acceptance_criteria?: string | string[];
  waiting_for?: string;
  waiting_reason?: string;
  next_follow_up_at?: string;
  blocker_reason?: string;
  blocker_impact?: string;
  dependencies?: Array<Record<string, unknown>>;
  approvals?: Array<Record<string, unknown>>;
  history?: Array<Record<string, unknown>>;
};

type ActionName = "submit" | "waitExternal" | "waitInternal" | "block" | "resume" | "approve" | "reject" | "reopen" | "cancel";
type ActionForm = {
  resultSummary: string;
  evidenceLink: string;
  noFileEvidenceReason: string;
  waitingFor: string;
  waitingReason: string;
  nextFollowUpAt: string;
  blockerReason: string;
  blockerImpact: string;
  resolutionNote: string;
  note: string;
};

const blankActionForm = (): ActionForm => ({
  resultSummary: "", evidenceLink: "", noFileEvidenceReason: "", waitingFor: "",
  waitingReason: "", nextFollowUpAt: "", blockerReason: "", blockerImpact: "",
  resolutionNote: "", note: "",
});

function listValue(value: unknown) {
  if (Array.isArray(value)) return value;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed as string[];
    } catch {
      // Keep legacy plain text values as one item.
    }
    return value ? [value] : [];
  }
  return [];
}

function actionTitle(action: ActionName) {
  return {
    submit: "提交验收", waitExternal: "等待外部", waitInternal: "等待内部", block: "报告阻塞",
    resume: "恢复执行", approve: "验收通过", reject: "退回修改", reopen: "重新打开", cancel: "取消任务",
  }[action];
}

export function TaskDetail({
  projectId, taskId, admin, accounts, phases, taskOptions, canManage, onBack, onChanged,
}: {
  projectId: number; taskId: number; admin: AdminPrincipal; accounts: AdminAccount[];
  phases: ProjectPhase[]; taskOptions: Array<{ id: number; title: string }>;
  canManage: boolean; onBack: () => void; onChanged: () => void;
}) {
  const [task, setTask] = useState<Task | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [actionName, setActionName] = useState<ActionName | null>(null);
  const [actionForm, setActionForm] = useState<ActionForm>(blankActionForm);
  const [evidenceFiles, setEvidenceFiles] = useState<Array<Record<string, unknown>>>([]);
  const [selectedEvidence, setSelectedEvidence] = useState<number[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    const [result, filesResult] = await Promise.all([
      fetchJson(`/api/admin/projects/${projectId}/tasks/${taskId}`, { cache: "no-store" }),
      fetchJson(`/api/admin/projects/${projectId}/files?page=1&pageSize=100`, { cache: "no-store" }),
    ]);
    if (result.response.ok) setTask((result.data as { task: Task }).task);
    else setError(typeof result.data?.error === "string" ? result.data.error : "任务读取失败");
    if (filesResult.response.ok) setEvidenceFiles(((filesResult.data as { items?: Array<Record<string, unknown>> }).items || []).filter((file) => file.current_version_id));
    setLoading(false);
  }, [projectId, taskId]);
  useEffect(() => { void load(); }, [load]);

  if (loading) return <section className={styles.panel}><LoaderCircle className="spin" /> 正在读取任务</section>;
  if (!task) return <section className={styles.panel}><p className="form-error">{error || "任务不存在"}</p><button className="button secondary" type="button" onClick={onBack}><ArrowLeft size={16} /> 返回任务列表</button></section>;

  const isManager = canManage;
  const canExecute = isManager || task.owner_id === admin.id;
  const nameOf = (id: unknown) => accounts.find((account) => account.id === Number(id))?.name || accounts.find((account) => account.id === Number(id))?.phone || "未指定";
  const updateForm = (key: keyof ActionForm, value: string) => setActionForm((current) => ({ ...current, [key]: value }));
  const openAction = (name: ActionName) => {
    setError("");
    setActionForm(blankActionForm());
    setActionName(name);
  };

  async function transition(action: string, payload: Record<string, unknown> = {}) {
    setBusy(true);
    setError("");
    try {
      const result = await fetchJson(`/api/admin/projects/${projectId}/tasks/${taskId}/transition`, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, ...payload }),
      });
      if (!result.response.ok) throw new Error(typeof result.data?.error === "string" ? result.data.error : "任务操作失败");
      setActionName(null);
      await load();
      onChanged();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "任务操作失败");
    } finally {
      setBusy(false);
    }
  }

  async function submitAction(event: React.FormEvent) {
    event.preventDefault();
    if (!actionName) return;
    setBusy(true);
    setError("");
    try {
      if (actionName === "submit") {
        if (!actionForm.resultSummary.trim()) { setError("成果说明不能为空"); setBusy(false); return; }
        if (!actionForm.evidenceLink.trim() && !actionForm.noFileEvidenceReason.trim() && !selectedEvidence.length) {
          setError("请提供文件证据、证据链接或无需文件证据说明"); setBusy(false); return;
        }
        const result = await fetchJson(`/api/admin/projects/${projectId}/tasks/${taskId}/submit`, {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({
            resultSummary: actionForm.resultSummary,
            evidenceLinks: actionForm.evidenceLink.trim() ? [actionForm.evidenceLink.trim()] : [],
            fileVersionIds: selectedEvidence,
            noFileEvidenceReason: actionForm.noFileEvidenceReason,
          }),
        });
        if (!result.response.ok) throw new Error(typeof result.data?.error === "string" ? result.data.error : "提交失败");
      } else if (actionName === "approve" || actionName === "reject") {
        if (actionName === "reject" && !actionForm.note.trim()) { setError("退回原因不能为空"); setBusy(false); return; }
        const result = await fetchJson(`/api/admin/projects/${projectId}/tasks/${taskId}/${actionName}`, {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify(actionName === "reject" ? { rejectionReason: actionForm.note } : { decisionNote: actionForm.note }),
        });
        if (!result.response.ok) throw new Error(typeof result.data?.error === "string" ? result.data.error : "验收操作失败");
      } else {
        const payload = actionName === "waitExternal" || actionName === "waitInternal"
          ? { waitingFor: actionForm.waitingFor, waitingReason: actionForm.waitingReason, nextFollowUpAt: actionForm.nextFollowUpAt }
          : actionName === "block"
            ? { blockerReason: actionForm.blockerReason, blockerImpact: actionForm.blockerImpact }
            : actionName === "resume"
              ? { resolutionNote: actionForm.resolutionNote }
              : actionName === "reopen"
                ? { reopenReason: actionForm.note }
                : { cancelReason: actionForm.note };
        const transitionName = actionName === "waitExternal" ? "WAIT_EXTERNAL" : actionName === "waitInternal" ? "WAIT_INTERNAL" : actionName === "block" ? "BLOCK" : actionName === "resume" ? "RESUME" : actionName === "reopen" ? "REOPEN" : "CANCEL";
        await transition(transitionName, payload);
        return;
      }
      setActionName(null);
      await load();
      onChanged();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "任务操作失败");
    } finally {
      setBusy(false);
    }
  }

  const actionField = (key: keyof ActionForm, label: string, rows = 3, required = false) => (
    <label className={`${styles.field} ${styles.wide}`}><span>{label}{required ? " *" : ""}</span>
      <textarea value={actionForm[key]} onChange={(event) => updateForm(key, event.target.value)} rows={rows} required={required} />
    </label>
  );

  return <section className={styles.panel}>
    <div className={styles.detailTop}><div><button className="button secondary" type="button" onClick={onBack}><ArrowLeft size={16} /> 返回任务列表</button><p className={styles.eyebrow}>TASK DETAIL</p><h3>{task.title}</h3><p>{textValue(task.code)} · {labelTaskStatus(task.status)}</p></div><span className={styles.badge}>{labelTaskStatus(task.status)}</span></div>
    <div className={styles.actionBar}>
      {canManage && ["DRAFT", "READY", "REVISION_REQUIRED"].includes(task.status) ? <button className="button secondary" type="button" onClick={() => setEditing(true)}><Pencil size={16} /> 编辑</button> : null}
      {["READY", "REVISION_REQUIRED"].includes(task.status) && canExecute ? <button className="button primary" type="button" onClick={() => void transition("START")} disabled={busy}><Play size={16} /> 开始</button> : null}
      {task.status === "IN_PROGRESS" && canExecute ? <><button className="button secondary" type="button" onClick={() => openAction("waitExternal")} disabled={busy}>等待外部</button><button className="button secondary" type="button" onClick={() => openAction("waitInternal")} disabled={busy}>等待内部</button><button className="button secondary" type="button" onClick={() => openAction("block")} disabled={busy}><CircleAlert size={16} /> 报告阻塞</button><button className="button primary" type="button" onClick={() => openAction("submit")} disabled={busy}><Send size={16} /> 提交验收</button></> : null}
      {["WAITING_EXTERNAL", "WAITING_INTERNAL", "BLOCKED"].includes(task.status) && canExecute ? <button className="button primary" type="button" onClick={() => openAction("resume")} disabled={busy}><RotateCcw size={16} /> 恢复执行</button> : null}
      {task.status === "REVIEW" && (isManager || task.approver_id === admin.id) ? <><button className="button primary" type="button" onClick={() => openAction("approve")} disabled={busy}><Check size={16} /> 验收通过</button><button className="button secondary" type="button" onClick={() => openAction("reject")} disabled={busy}><X size={16} /> 退回修改</button></> : null}
      {task.status === "DONE" && isManager ? <button className="button secondary" type="button" onClick={() => openAction("reopen")} disabled={busy}>重新打开</button> : null}
      {["READY", "IN_PROGRESS", "WAITING_EXTERNAL", "WAITING_INTERNAL", "BLOCKED", "REVISION_REQUIRED"].includes(task.status) && isManager ? <button className="button secondary" type="button" onClick={() => openAction("cancel")} disabled={busy}>取消任务</button> : null}
    </div>
    {error ? <p className="form-error">{error}</p> : null}
    <div className={styles.infoGrid}><div className={styles.infoItem}><label>负责人</label><p>{nameOf(task.owner_id)}</p></div><div className={styles.infoItem}><label>验收人</label><p>{nameOf(task.approver_id)}</p></div><div className={styles.infoItem}><label>截止时间</label><p>{formatDate(task.due_at, true)}</p></div><div className={styles.infoItem}><label>任务目标</label><p>{textValue(task.objective)}</p></div><div className={styles.infoItem}><label>等待 / 阻塞</label><p>{task.waiting_for ? `等待：${task.waiting_for} · ${task.waiting_reason || ""}` : task.blocker_reason ? `阻塞：${task.blocker_reason} · ${task.blocker_impact || ""}` : "无"}</p></div></div>
    {task.status === "IN_PROGRESS" || task.status === "REVISION_REQUIRED" ? <div className={styles.formSection}><h4>本次提交的文件证据</h4><p>选择具体版本后提交，后续新版本不会改变本次引用。</p><div className={styles.detailList}>{evidenceFiles.map((file) => <label className={styles.detailRow} key={String(file.id)}><input type="checkbox" checked={selectedEvidence.includes(Number(file.current_version_id))} onChange={(event) => setSelectedEvidence((current) => event.target.checked ? [...current, Number(file.current_version_id)] : current.filter((id) => id !== Number(file.current_version_id)))} /><span><strong>{String(file.name || "")}</strong><small>V{String(file.version_number)} · {String(file.status || "")}</small></span></label>)}</div></div> : null}
    <div className={styles.detailColumns}><div><h4>执行步骤</h4><ol>{listValue(task.steps).map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}</ol><h4>交付物</h4><ul>{listValue(task.deliverables).map((item) => <li key={item}>{item}</li>)}</ul><h4>验收标准</h4><ul>{listValue(task.acceptance_criteria).map((item) => <li key={item}>{item}</li>)}</ul></div><div><h4>依赖</h4>{(task.dependencies || []).map((item) => <p key={String(item.depends_on_task_id)}>{String(item.title)} · {labelTaskStatus(String(item.status))}</p>)}<h4>提交与验收历史</h4>{(task.approvals || []).map((item) => <p key={String(item.id)}>第 {String(item.submission_number)} 次 · {String(item.decision)} · {formatDate(String(item.created_at || ""), true)} · 文件 {Array.isArray(item.fileVersionIds) ? item.fileVersionIds.join(", ") || "无" : "无"}</p>)}<h4>状态历史</h4>{(task.history || []).slice(0, 12).map((item) => <p key={String(item.id)}>{String(item.action)} · {formatDate(String(item.created_at || ""), true)}</p>)}</div></div>
    {editing ? <TaskEditor projectId={projectId} phases={phases} accounts={accounts} initial={task} taskOptions={taskOptions} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); void load(); onChanged(); }} /> : null}
    {actionName ? <div className={styles.modalBackdrop}><form className={`${styles.modal} ${styles.confirm}`} onSubmit={(event) => void submitAction(event)}><header className={styles.modalHeader}><div><p className={styles.eyebrow}>TASK ACTION</p><h2>{actionTitle(actionName)}</h2></div></header><div className={styles.modalBody}>
      {actionName === "submit" ? <>{actionField("resultSummary", "成果说明", 4, true)}<label className={`${styles.field} ${styles.wide}`}><span>证据链接</span><input value={actionForm.evidenceLink} onChange={(event) => updateForm("evidenceLink", event.target.value)} placeholder="可留空，或选择下方文件版本" /></label>{actionField("noFileEvidenceReason", "无需文件证据说明")}</> : null}
      {actionName === "waitExternal" || actionName === "waitInternal" ? <>{actionField("waitingFor", actionName === "waitExternal" ? "等待的外部对象" : "等待的内部成员或资料", 2, true)}{actionField("waitingReason", "等待原因", 3, true)}<label className={`${styles.field} ${styles.wide}`}><span>下次跟进时间 *</span><input type="datetime-local" value={actionForm.nextFollowUpAt} onChange={(event) => updateForm("nextFollowUpAt", event.target.value)} required /></label></> : null}
      {actionName === "block" ? <>{actionField("blockerReason", "阻塞原因", 3, true)}{actionField("blockerImpact", "影响范围", 3, true)}</> : null}
      {actionName === "resume" ? actionField("resolutionNote", "解决说明", 3, true) : null}
      {actionName === "approve" || actionName === "reject" ? actionField("note", actionName === "reject" ? "退回原因" : "验收备注", 3, actionName === "reject") : null}
      {actionName === "reopen" || actionName === "cancel" ? actionField("note", actionName === "reopen" ? "重新打开原因" : "取消原因", 3, true) : null}
      {error ? <p className="form-error">{error}</p> : null}
    </div><footer className={styles.modalFooter}><button className="button secondary" type="button" onClick={() => setActionName(null)} disabled={busy}>取消</button><button className="button primary" type="submit" disabled={busy}>{busy ? "处理中" : "确认操作"}</button></footer></form></div> : null}
  </section>;
}
