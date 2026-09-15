"use client";

import { type FormEvent, useState } from "react";
import { Save, X } from "lucide-react";
import { fetchJson } from "../client-request";
import type { AdminAccount } from "../../../lib/types";
import type { ProjectPhase } from "../project-center-types";
import styles from "../ProjectCenter.module.css";
import { HelpTip } from "./HelpTip";
import { projectCenterCopy } from "./project-center-copy";

type TaskValue = {
  id?: number;
  title?: string;
  phase_id?: number | null;
  objective?: string;
  owner_id?: number | null;
  approver_id?: number | null;
  priority?: string;
  start_at?: string | null;
  due_at?: string | null;
  estimated_hours?: number | null;
  trigger_text?: string;
  preconditions?: string;
  inputs?: string;
  steps?: string[] | string;
  deliverables?: string[] | string;
  acceptance_criteria?: string[] | string;
  dependencyTaskIds?: number[];
  collaborators?: Array<{ user_id?: number }>;
  is_key?: number;
  updated_at?: string;
};

function lines(value: unknown) {
  if (Array.isArray(value)) return value.join("\n");
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed.join("\n") : value;
    } catch {
      return value;
    }
  }
  return "";
}

export function TaskEditor({
  projectId,
  phases,
  accounts,
  initial,
  taskOptions,
  onClose,
  onSaved,
}: {
  projectId: number;
  phases: ProjectPhase[];
  accounts: AdminAccount[];
  initial?: TaskValue;
  taskOptions: Array<{ id: number; title: string }>;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    title: initial?.title || "",
    phaseId: initial?.phase_id ? String(initial.phase_id) : "",
    objective: initial?.objective || "",
    ownerId: initial?.owner_id ? String(initial.owner_id) : "",
    approverId: initial?.approver_id ? String(initial.approver_id) : "",
    collaboratorIds: (initial?.collaborators || []).map((item) => String(item.user_id || "")),
    priority: initial?.priority || "NORMAL",
    startAt: initial?.start_at || "",
    dueAt: initial?.due_at || "",
    estimatedHours: initial?.estimated_hours ? String(initial.estimated_hours) : "",
    triggerText: initial?.trigger_text || "",
    preconditions: initial?.preconditions || "",
    inputs: initial?.inputs || "",
    steps: lines(initial?.steps),
    deliverables: lines(initial?.deliverables),
    acceptanceCriteria: lines(initial?.acceptance_criteria),
    dependencyTaskIds: (initial?.dependencyTaskIds || []).map(String),
    isCritical: Boolean(initial?.is_key),
  });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const activeAccounts = accounts.filter((account) => account.status === "active");
  const update = (key: string, value: string | boolean | string[]) => setForm((current) => ({ ...current, [key]: value }));

  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const payload = {
        ...form,
        phaseId: form.phaseId ? Number(form.phaseId) : null,
        ownerId: form.ownerId ? Number(form.ownerId) : null,
        approverId: form.approverId ? Number(form.approverId) : null,
        estimatedHours: form.estimatedHours ? Number(form.estimatedHours) : null,
        steps: form.steps.split(/\r?\n/),
        deliverables: form.deliverables.split(/\r?\n/),
        acceptanceCriteria: form.acceptanceCriteria.split(/\r?\n/),
        dependencyTaskIds: form.dependencyTaskIds.map(Number).filter(Boolean),
        collaboratorIds: form.collaboratorIds.map(Number).filter(Boolean),
        expectedUpdatedAt: initial?.updated_at,
      };
      const response = await fetchJson(initial?.id
        ? `/api/admin/projects/${projectId}/tasks/${initial.id}`
        : `/api/admin/projects/${projectId}/tasks`, {
        method: initial?.id ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.response.ok) throw new Error(typeof response.data?.error === "string" ? response.data.error : "任务保存失败");
      onSaved();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "任务保存失败");
    } finally {
      setBusy(false);
    }
  }

  return <div className={styles.modalBackdrop}><form className={`${styles.modal} ${styles.taskEditor}`} onSubmit={save}>
    <header className={styles.modalHeader}><div><h2>{initial?.id ? "编辑任务" : "新建任务"}</h2><p>保存后任务保持草稿状态，需通过检查后发布。</p></div><button className="icon-button" type="button" onClick={onClose} aria-label="关闭"><X size={18} /></button></header>
    <div className={styles.modalBody}>
      <section className={styles.formSection}><h3>基本信息</h3><div className={styles.formGrid}><label className={styles.field}><span>任务标题 *</span><input value={form.title} onChange={(event) => update("title", event.target.value)} required /></label><label className={styles.field}><span>阶段</span><select value={form.phaseId} onChange={(event) => update("phaseId", event.target.value)}><option value="">未分配</option>{phases.map((phase) => <option key={phase.id} value={phase.id}>{phase.code} · {phase.name}</option>)}</select></label><label className={`${styles.field} ${styles.wide}`}><span>任务目标</span><textarea value={form.objective} onChange={(event) => update("objective", event.target.value)} /></label></div></section>
      <section className={styles.formSection}><h3>人员与责任</h3><div className={styles.formGrid}><label className={styles.field}><span>负责人 <HelpTip label="负责人说明">{projectCenterCopy.help.owner}</HelpTip></span><select value={form.ownerId} onChange={(event) => update("ownerId", event.target.value)}><option value="">未指定</option>{activeAccounts.map((account) => <option key={account.id} value={account.id}>{account.name || account.phone}</option>)}</select></label><label className={styles.field}><span>验收人 <HelpTip label="验收人说明">{projectCenterCopy.help.approver}</HelpTip></span><select value={form.approverId} onChange={(event) => update("approverId", event.target.value)}><option value="">未指定</option>{activeAccounts.map((account) => <option key={account.id} value={account.id}>{account.name || account.phone}</option>)}</select></label><label className={styles.field}><span>协助人员 <HelpTip label="协助人员说明">{projectCenterCopy.help.collaborators}</HelpTip></span><select multiple value={form.collaboratorIds} onChange={(event) => update("collaboratorIds", [...event.target.selectedOptions].map((option) => option.value))}>{activeAccounts.map((account) => <option key={account.id} value={account.id}>{account.name || account.phone}</option>)}</select></label></div></section>
      <section className={styles.formSection}><h3>日期与优先级</h3><div className={styles.formGrid}><label className={styles.field}><span>开始时间</span><input type="datetime-local" value={form.startAt} onChange={(event) => update("startAt", event.target.value)} /></label><label className={styles.field}><span>截止时间</span><input type="datetime-local" value={form.dueAt} onChange={(event) => update("dueAt", event.target.value)} /></label><label className={styles.field}><span>优先级</span><select value={form.priority} onChange={(event) => update("priority", event.target.value)}><option value="LOW">低</option><option value="NORMAL">普通</option><option value="HIGH">高</option><option value="URGENT">紧急</option></select></label><label className={styles.field}><span>预计工时</span><input type="number" min="0" step="0.5" value={form.estimatedHours} onChange={(event) => update("estimatedHours", event.target.value)} /></label></div></section>
      <section className={styles.formSection}><h3>输入与执行</h3><div className={styles.formGrid}><label className={styles.field}><span>触发条件</span><textarea value={form.triggerText} onChange={(event) => update("triggerText", event.target.value)} /></label><label className={styles.field}><span>前置条件</span><textarea value={form.preconditions} onChange={(event) => update("preconditions", event.target.value)} /></label><label className={styles.field}><span>输入资料</span><textarea value={form.inputs} onChange={(event) => update("inputs", event.target.value)} /></label><label className={styles.field}><span>执行步骤（每行一项）</span><textarea value={form.steps} onChange={(event) => update("steps", event.target.value)} /></label></div></section>
      <section className={styles.formSection}><h3>交付与验收</h3><div className={styles.formGrid}><label className={styles.field}><span>交付物（每行一项）</span><textarea value={form.deliverables} onChange={(event) => update("deliverables", event.target.value)} /></label><label className={styles.field}><span>验收标准（每行一项）</span><textarea value={form.acceptanceCriteria} onChange={(event) => update("acceptanceCriteria", event.target.value)} /></label></div></section>
      <section className={styles.formSection}><h3>前置工作与重要性</h3><div className={styles.formGrid}><label className={styles.field}><span>开始前要先完成什么 <HelpTip label="前置工作说明">{projectCenterCopy.help.dependency}</HelpTip></span><select multiple value={form.dependencyTaskIds} onChange={(event) => update("dependencyTaskIds", [...event.target.selectedOptions].map((option) => option.value))}>{taskOptions.filter((task) => task.id !== initial?.id).map((task) => <option key={task.id} value={task.id}>{task.title}</option>)}</select></label><label className={styles.checkboxField}><input type="checkbox" checked={form.isCritical} onChange={(event) => update("isCritical", event.target.checked)} /> 重要工作</label></div></section>
      {error ? <p className="form-error">{error}</p> : null}
    </div>
    <footer className={styles.modalFooter}><button className="button secondary" type="button" onClick={onClose} disabled={busy}>取消</button><button className="button primary" type="submit" disabled={busy}><Save size={16} /> {busy ? "保存中" : "保存草稿"}</button></footer>
  </form></div>;
}
