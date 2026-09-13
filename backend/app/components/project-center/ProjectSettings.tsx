"use client";

import { Archive, CheckCircle2, Pause, Play, RotateCcw, ShieldAlert } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { fetchJson } from "../client-request";
import type { AdminPrincipal } from "../../../lib/types";
import styles from "../ProjectCenter.module.css";

type Check = { passed: boolean; blockingItems: Array<Record<string, unknown>>; warningItems: Array<Record<string, unknown>> };
type Retro = Record<string, unknown>;
type Action = "" | "pause" | "resume" | "close" | "archive";

const emptyRetro = {
  goalsAchieved: "", scheduleVariance: "", budgetVarianceText: "", mainProblems: "",
  effectiveSops: "", sopChangesSuggested: "", missedTasks: "", reusableAssets: "",
  nextTimeImprovements: "", summary: "",
};

export function ProjectSettings({
  projectId, projectStatus, project, admin, canManage, isSuper,
}: {
  projectId: number; projectStatus: string; project: Record<string, unknown>;
  admin: AdminPrincipal; canManage: boolean; isSuper: boolean;
}) {
  const [check, setCheck] = useState<Check | null>(null);
  const [retro, setRetro] = useState<Retro | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [action, setAction] = useState<Action>("");
  const [healthOverride, setHealthOverride] = useState(project.health_override === "RED");
  const [healthOverrideReason, setHealthOverrideReason] = useState(String(project.health_override_reason || ""));
  const [settlementStatusNote, setSettlementStatusNote] = useState(String(project.settlement_status_note || ""));
  const [followUpNotes, setFollowUpNotes] = useState(String(project.follow_up_notes || ""));
  const [closeType, setCloseType] = useState<"COMPLETED" | "CANCELLED">("COMPLETED");
  const [closeNotes, setCloseNotes] = useState("");
  const [cancellationReason, setCancellationReason] = useState("");
  const [completedWork, setCompletedWork] = useState("");
  const [unfinishedItems, setUnfinishedItems] = useState("");
  const [incurredCosts, setIncurredCosts] = useState("");
  const [restartPossible, setRestartPossible] = useState(false);
  const [override, setOverride] = useState(false);
  const [overrideReason, setOverrideReason] = useState("");
  const [reason, setReason] = useState("");
  const [retroForm, setRetroForm] = useState(emptyRetro);

  const load = useCallback(async () => {
    const [checkResult, retroResult] = await Promise.all([
      fetchJson(`/api/admin/projects/${projectId}/close-check`, { cache: "no-store" }),
      fetchJson(`/api/admin/projects/${projectId}/retrospective`, { cache: "no-store" }),
    ]);
    if (checkResult.response.ok) setCheck(checkResult.data as Check);
    if (retroResult.response.ok) {
      const value = retroResult.data as Retro;
      setRetro(value);
      setRetroForm({
        goalsAchieved: String(value.goals_achieved || ""), scheduleVariance: String(value.schedule_variance || ""),
        budgetVarianceText: String(value.budget_variance_text || ""), mainProblems: String(value.main_problems || ""),
        effectiveSops: String(value.effective_sops || ""), sopChangesSuggested: String(value.sop_changes_suggested || ""),
        missedTasks: String(value.missed_tasks || ""), reusableAssets: String(value.reusable_assets || ""),
        nextTimeImprovements: String(value.next_time_improvements || ""), summary: String(value.summary || ""),
      });
    }
  }, [projectId]);
  useEffect(() => { void load(); }, [load]);

  async function saveControls(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true); setError("");
    const result = await fetchJson(`/api/admin/projects/${projectId}/controls`, {
      method: "PATCH", headers: { "content-type": "application/json" },
      body: JSON.stringify({ healthOverride, healthOverrideReason, settlementStatusNote, followUpNotes }),
    });
    if (!result.response.ok) setError(typeof result.data?.error === "string" ? result.data.error : "项目控制信息保存失败");
    else await load();
    setBusy(false);
  }

  async function lifecycle() {
    setBusy(true); setError("");
    let body: Record<string, unknown> = {};
    if (action === "pause") body = { pauseReason: reason };
    if (action === "resume") body = { resumeReason: reason };
    if (action === "archive") body = { archiveReason: reason };
    if (action === "close") body = closeType === "COMPLETED"
      ? { closeType, closeNotes, override, overrideReason }
      : { closeType, cancellationReason, completedWork, unfinishedItems, incurredCosts, restartPossible };
    const result = await fetchJson(`/api/admin/projects/${projectId}/${action}`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
    });
    if (!result.response.ok) setError(typeof result.data?.error === "string" ? result.data.error : "项目操作失败");
    else { setAction(""); setReason(""); await load(); }
    setBusy(false);
  }

  async function saveRetro(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true); setError("");
    const result = await fetchJson(`/api/admin/projects/${projectId}/retrospective`, {
      method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(retroForm),
    });
    if (!result.response.ok) setError(typeof result.data?.error === "string" ? result.data.error : "复盘保存失败");
    else { setRetro(result.data as Retro); await load(); }
    setBusy(false);
  }

  async function completeRetro() {
    setBusy(true); setError("");
    const result = await fetchJson(`/api/admin/projects/${projectId}/retrospective/complete`, {
      method: "POST", headers: { "content-type": "application/json" }, body: "{}",
    });
    if (!result.response.ok) setError(typeof result.data?.error === "string" ? result.data.error : "复盘完成失败");
    else { setRetro(result.data as Retro); await load(); }
    setBusy(false);
  }

  const field = (key: keyof typeof retroForm, label: string) => (
    <label className={`${styles.field} ${styles.wide}`}><span>{label}</span>
      <textarea value={retroForm[key]} onChange={(event) => setRetroForm((current) => ({ ...current, [key]: event.target.value }))} rows={3} />
    </label>
  );
  const archived = projectStatus === "ARCHIVED";
  return <div className={styles.detailColumns}>
    <section className={styles.panel}>
      <div className={styles.panelTitle}><div><h3>项目设置与关闭</h3><p>当前状态：{archived ? "只读归档" : projectStatus}</p></div><ShieldAlert size={18} /></div>
      {archived ? <div className={styles.notice}><strong>只读归档</strong><p>归档项目不能继续修改任务、成员、文件、记录或项目控制信息。</p></div> : null}
      {check ? <div className={check.passed ? styles.result : styles.error}><strong>{check.passed ? "关闭检查通过" : `还有 ${check.blockingItems.length} 项阻塞`}</strong>{check.blockingItems.map((item) => <p key={String(item.code)}>{String(item.reason)}</p>)}{check.warningItems.map((item) => <p key={String(item.code)}>提示：{String(item.reason)}</p>)}</div> : <p>正在读取关闭检查...</p>}
      {canManage && !archived ? <form className={styles.formGrid} onSubmit={(event) => void saveControls(event)}>
        <label className={styles.checkboxField}><input type="checkbox" checked={healthOverride} onChange={(event) => setHealthOverride(event.target.checked)} /> 人工标红项目</label>
        {healthOverride ? <label className={`${styles.field} ${styles.wide}`}><span>标红原因 *</span><textarea value={healthOverrideReason} onChange={(event) => setHealthOverrideReason(event.target.value)} rows={2} required /></label> : null}
        <label className={`${styles.field} ${styles.wide}`}><span>结算状态说明</span><textarea value={settlementStatusNote} onChange={(event) => setSettlementStatusNote(event.target.value)} rows={2} /></label>
        <label className={`${styles.field} ${styles.wide}`}><span>后续事项</span><textarea value={followUpNotes} onChange={(event) => setFollowUpNotes(event.target.value)} rows={2} /></label>
        <div className={styles.actionBar}><button className="button secondary" type="submit" disabled={busy}>{busy ? "保存中" : "保存项目控制信息"}</button></div>
      </form> : null}
      {isSuper && !archived ? <div className={styles.actionBar}>
        {projectStatus === "ACTIVE" ? <button className="button secondary" type="button" onClick={() => { setAction("pause"); setReason(""); }}><Pause size={16} /> 暂停</button> : null}
        {projectStatus === "PAUSED" ? <button className="button secondary" type="button" onClick={() => { setAction("resume"); setReason(""); }}><Play size={16} /> 恢复</button> : null}
        {["ACTIVE", "PAUSED"].includes(projectStatus) ? <button className="button primary" type="button" onClick={() => { setAction("close"); setCloseType("COMPLETED"); setOverride(false); }}><CheckCircle2 size={16} /> 关闭项目</button> : null}
        {["COMPLETED", "CANCELLED"].includes(projectStatus) ? <button className="button secondary" type="button" onClick={() => { setAction("archive"); setReason(""); }}><Archive size={16} /> 归档</button> : null}
      </div> : null}
      {!isSuper && canManage && !archived ? <p className={styles.muted}>项目经理可以完成复盘和准备关闭，但正式暂停、恢复、关闭、归档需要超级管理员执行。</p> : null}
      {error ? <p className="form-error">{error}</p> : null}
    </section>
    <section className={styles.panel}>
      <div className={styles.panelTitle}><div><h3>项目复盘</h3><p>{retro?.completed_at ? "复盘已完成，后续修改需要原因。" : "先保存复盘，再完成复盘。"}</p></div><RotateCcw size={18} /></div>
      <form className={styles.formGrid} onSubmit={(event) => void saveRetro(event)}>{field("goalsAchieved", "目标达成情况")}{field("scheduleVariance", "进度偏差")}{field("budgetVarianceText", "费用偏差")}{field("mainProblems", "主要问题")}{field("effectiveSops", "有效 SOP")}{field("sopChangesSuggested", "建议调整的 SOP")}{field("missedTasks", "遗漏任务")}{field("reusableAssets", "可复用资产")}{field("nextTimeImprovements", "下次改进")}{field("summary", "复盘总结")}<div className={styles.actionBar}><button className="button secondary" type="submit" disabled={busy || archived || !canManage}>{busy ? "保存中" : "保存复盘"}</button><button className="button primary" type="button" onClick={() => void completeRetro()} disabled={busy || archived || !canManage || Boolean(retro?.completed_at)}>完成复盘</button></div></form>
    </section>
    {action ? <div className={styles.modalBackdrop}><form className={`${styles.modal} ${styles.confirm}`} onSubmit={(event) => { event.preventDefault(); void lifecycle(); }}>
      <header className={styles.modalHeader}><h2>{action === "pause" ? "暂停项目" : action === "resume" ? "恢复项目" : action === "archive" ? "归档项目" : "关闭项目"}</h2></header>
      <div className={styles.modalBody}>
        {action === "close" ? <><label className={styles.field}><span>关闭方式</span><select value={closeType} onChange={(event) => setCloseType(event.target.value as "COMPLETED" | "CANCELLED")}><option value="COMPLETED">正常完成</option><option value="CANCELLED">提前取消</option></select></label>
          {closeType === "COMPLETED" ? <><label className={`${styles.field} ${styles.wide}`}><span>关闭说明 *</span><textarea value={closeNotes} onChange={(event) => setCloseNotes(event.target.value)} rows={3} required /></label><label className={styles.checkboxField}><input type="checkbox" checked={override} onChange={(event) => setOverride(event.target.checked)} /> 带未完成事项例外关闭</label>{override ? <label className={`${styles.field} ${styles.wide}`}><span>例外原因 *</span><textarea value={overrideReason} onChange={(event) => setOverrideReason(event.target.value)} rows={3} required /></label> : null}</>
            : <><label className={`${styles.field} ${styles.wide}`}><span>取消原因 *</span><textarea value={cancellationReason} onChange={(event) => setCancellationReason(event.target.value)} rows={2} required /></label><label className={`${styles.field} ${styles.wide}`}><span>已完成工作</span><textarea value={completedWork} onChange={(event) => setCompletedWork(event.target.value)} rows={2} /></label><label className={`${styles.field} ${styles.wide}`}><span>未完成事项</span><textarea value={unfinishedItems} onChange={(event) => setUnfinishedItems(event.target.value)} rows={2} /></label><label className={`${styles.field} ${styles.wide}`}><span>已发生费用说明</span><textarea value={incurredCosts} onChange={(event) => setIncurredCosts(event.target.value)} rows={2} /></label><label className={styles.checkboxField}><input type="checkbox" checked={restartPossible} onChange={(event) => setRestartPossible(event.target.checked)} /> 后续可能重启</label></>}
        </> : <label className={`${styles.field} ${styles.wide}`}><span>原因 *</span><textarea value={reason} onChange={(event) => setReason(event.target.value)} rows={4} required /></label>}
        {error ? <p className="form-error">{error}</p> : null}
      </div>
      <footer className={styles.modalFooter}><button className="button secondary" type="button" onClick={() => setAction("")}>取消</button><button className="button primary" type="submit" disabled={busy}>{busy ? "处理中" : "确认操作"}</button></footer>
    </form></div> : null}
  </div>;
}
