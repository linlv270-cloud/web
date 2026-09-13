"use client";

import { Archive, Download, FilePlus2, History, LoaderCircle, UploadCloud } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchJson } from "../client-request";
import { formatDate } from "../project-center-formatters";
import type { AdminPrincipal } from "../../../lib/types";
import type { ProjectPhase } from "../project-center-types";
import styles from "../ProjectCenter.module.css";

type FileItem = Record<string, unknown> & {
  id: number;
  name: string;
  asset_type?: string;
  phase_name?: string;
  task_title?: string;
  current_version_id?: number;
  version_number?: number;
  status?: string;
  original_name?: string;
  size_bytes?: number;
  version_note?: string;
  version_created_at?: string;
};

type FileAction =
  | { kind: "status"; version: Record<string, unknown>; status: string }
  | { kind: "archive" }
  | null;

function errorOf(data: unknown, fallback: string) {
  return data && typeof data === "object" && "error" in data && typeof data.error === "string" ? data.error : fallback;
}

function size(value: number) {
  if (value < 1024 * 1024) return `${Math.ceil(value / 1024)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

export function ProjectFiles({ projectId, phases, admin, canManage, canUpload }: {
  projectId: number;
  phases: ProjectPhase[];
  admin: AdminPrincipal;
  canManage: boolean;
  canUpload: boolean;
}) {
  const [items, setItems] = useState<FileItem[]>([]);
  const [selected, setSelected] = useState<FileItem | null>(null);
  const [versions, setVersions] = useState<Record<string, unknown>[]>([]);
  const [tasks, setTasks] = useState<Array<{ id: number; title: string }>>([]);
  const [name, setName] = useState("");
  const [phaseId, setPhaseId] = useState("");
  const [taskId, setTaskId] = useState("");
  const [note, setNote] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [versionFile, setVersionFile] = useState<File | null>(null);
  const [versionNote, setVersionNote] = useState("");
  const [replacementReason, setReplacementReason] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [action, setAction] = useState<FileAction>(null);
  const [actionComment, setActionComment] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [filesResult, tasksResult] = await Promise.all([
      fetchJson(`/api/admin/projects/${projectId}/files?page=1&pageSize=100${statusFilter ? `&status=${statusFilter}` : ""}`, { cache: "no-store" }),
      fetchJson(`/api/admin/projects/${projectId}/tasks?page=1&pageSize=100`, { cache: "no-store" }),
    ]);
    if (filesResult.response.ok) setItems((filesResult.data as { items: FileItem[] }).items || []);
    else setError(errorOf(filesResult.data, "文件列表加载失败"));
    if (tasksResult.response.ok) setTasks(((tasksResult.data as { items: Array<{ id: number; title: string }> }).items || []).map((task) => ({ id: task.id, title: task.title })));
    setLoading(false);
  }, [projectId, statusFilter]);

  useEffect(() => { void load(); }, [load]);

  async function openVersions(item: FileItem) {
    setSelected(item);
    const result = await fetchJson(`/api/admin/projects/${projectId}/files/${item.id}`, { cache: "no-store" });
    if (result.response.ok) setVersions((result.data as { versions: Record<string, unknown>[] }).versions || []);
    else setError(errorOf(result.data, "版本历史加载失败"));
  }

  async function upload(event: React.FormEvent) {
    event.preventDefault();
    if (!file) { setError("请选择文件"); return; }
    setBusy(true);
    setError("");
    const form = new FormData();
    form.set("name", name || file.name);
    form.set("phaseId", phaseId);
    form.set("taskId", taskId);
    form.set("versionNote", note);
    form.set("file", file);
    const result = await fetchJson(`/api/admin/projects/${projectId}/files`, { method: "POST", body: form });
    if (!result.response.ok) setError(errorOf(result.data, "上传失败"));
    else {
      setName(""); setPhaseId(""); setTaskId(""); setNote(""); setFile(null);
      if (inputRef.current) inputRef.current.value = "";
      await load();
    }
    setBusy(false);
  }

  async function uploadVersion() {
    if (!selected || !versionFile) { setError("请选择新版本文件"); return; }
    setBusy(true);
    setError("");
    const form = new FormData();
    form.set("versionNote", versionNote);
    form.set("replacementReason", replacementReason);
    form.set("file", versionFile);
    const result = await fetchJson(`/api/admin/projects/${projectId}/files/${selected.id}/versions`, { method: "POST", body: form });
    if (!result.response.ok) setError(errorOf(result.data, "版本上传失败"));
    else {
      setVersionFile(null);
      setVersionNote("");
      setReplacementReason("");
      await load();
      await openVersions(selected);
    }
    setBusy(false);
  }

  async function applyStatus(version: Record<string, unknown>, status: string, comment = "") {
    if (!selected) return;
    setBusy(true);
    setError("");
    const result = await fetchJson(`/api/admin/projects/${projectId}/files/${selected.id}/versions/${version.id}/status`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ status, comment }),
    });
    if (!result.response.ok) setError(errorOf(result.data, "状态更新失败"));
    else {
      setAction(null);
      setActionComment("");
      await load();
      await openVersions(selected);
    }
    setBusy(false);
  }

  function changeStatus(version: Record<string, unknown>, status: string) {
    if (status === "REVISION_REQUIRED") {
      setAction({ kind: "status", version, status });
      setActionComment("");
      return;
    }
    void applyStatus(version, status);
  }

  async function archive() {
    if (!selected || !action || action.kind !== "archive") return;
    if (!actionComment.trim()) {
      setError("归档必须填写原因");
      return;
    }
    setBusy(true);
    setError("");
    const result = await fetchJson(`/api/admin/projects/${projectId}/files/${selected.id}/archive`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ reason: actionComment }),
    });
    if (!result.response.ok) {
      setError(errorOf(result.data, "归档失败"));
    } else {
      setAction(null);
      setActionComment("");
      setSelected(null);
      setVersions([]);
      await load();
    }
    setBusy(false);
  }

  const statusLabels = useMemo(() => ({ DRAFT: "草稿", IN_REVIEW: "审核中", REVISION_REQUIRED: "需修改", APPROVED: "已确认", FINAL: "最终版", SUPERSEDED: "已替代", ARCHIVED: "已归档" }), []);
  return <section className={styles.panel}>
    <div className={styles.panelTitle}><div><h3>项目文件</h3><p>文件资产与版本分离保存，历史提交始终指向具体版本。</p></div>{loading ? <LoaderCircle size={17} className="spin" /> : null}</div>
    {canUpload ? <form className={styles.inlineForm} onSubmit={(event) => void upload(event)}>
      <label className={styles.field}><span>逻辑文件名</span><input value={name} onChange={(event) => setName(event.target.value)} placeholder="如：主视觉方案" /></label>
      <label className={styles.field}><span>阶段</span><select value={phaseId} onChange={(event) => setPhaseId(event.target.value)}><option value="">未关联</option>{phases.map((phase) => <option key={phase.id} value={phase.id}>{phase.code} · {phase.name}</option>)}</select></label>
      <label className={styles.field}><span>任务</span><select value={taskId} onChange={(event) => setTaskId(event.target.value)}><option value="">未关联</option>{tasks.map((task) => <option key={task.id} value={task.id}>{task.title}</option>)}</select></label>
      <label className={styles.field}><span>版本说明</span><input value={note} onChange={(event) => setNote(event.target.value)} /></label>
      <label className={styles.field}><span>文件</span><input ref={inputRef} type="file" onChange={(event) => setFile(event.target.files?.[0] || null)} accept=".pdf,.png,.jpg,.jpeg,.webp,.svg,.docx,.xlsx,.pptx,.zip" /></label>
      <button className="button primary" type="submit" disabled={busy}><UploadCloud size={16} /> {busy ? "上传中" : "首次上传"}</button>
    </form> : null}
    {error ? <p className="form-error">{error}</p> : null}
    <div className={styles.filterGrid}><label className={styles.field}><span>文件状态</span><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="">全部</option>{Object.entries(statusLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label></div>
    {!loading && !items.length ? <div className={styles.empty}><FilePlus2 size={26} /><p>暂无项目文件。</p></div> : null}
    {items.length ? <div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>文件</th><th>阶段 / 任务</th><th>版本</th><th>状态</th><th>大小</th><th>更新时间</th><th /></tr></thead><tbody>{items.map((item) => <tr key={item.id}><td className={styles.projectName}><strong>{item.name}</strong><span>{item.original_name || "-"} · {item.asset_type || "OTHER"}</span></td><td>{item.phase_name || "未关联"}<br />{item.task_title || "未关联"}</td><td>V{item.version_number || 0}</td><td><span className={styles.badge}>{statusLabels[item.status as keyof typeof statusLabels] || item.status}</span></td><td>{size(Number(item.size_bytes || 0))}</td><td>{formatDate(String(item.version_created_at || ""), true)}</td><td><button className="icon-button" type="button" onClick={() => void openVersions(item)} aria-label="查看版本"><History size={16} /></button>{item.current_version_id ? <a className="icon-button" href={`/api/admin/projects/${projectId}/files/${item.id}/versions/${item.current_version_id}/download`} aria-label="下载"><Download size={16} /></a> : null}{canManage ? <button className="icon-button" type="button" onClick={() => { setSelected(item); setAction({ kind: "archive" }); setActionComment(""); }} aria-label="归档文件"><Archive size={16} /></button> : null}</td></tr>)}</tbody></table></div> : null}
    {selected ? <div className={styles.detailColumns}><div><h4>{selected.name} · 版本历史</h4>{versions.map((version) => <div className={styles.detailRow} key={String(version.id)}><strong>V{String(version.version_number)}</strong><div><strong>{String(version.original_name || "")}</strong><small>{String(version.version_note || "无版本说明")} · {formatDate(String(version.created_at || ""), true)}</small></div><span className={styles.badge}>{statusLabels[String(version.status) as keyof typeof statusLabels] || String(version.status)}</span><a className="icon-button" href={`/api/admin/projects/${projectId}/files/${selected.id}/versions/${version.id}/download`} aria-label="下载版本"><Download size={16} /></a>{canManage && ["DRAFT", "REVISION_REQUIRED"].includes(String(version.status)) ? <button className="button secondary" type="button" onClick={() => changeStatus(version, "IN_REVIEW")} disabled={busy}>提交审核</button> : null}{canManage && version.status === "IN_REVIEW" ? <><button className="button secondary" type="button" onClick={() => changeStatus(version, "REVISION_REQUIRED")} disabled={busy}>退回</button><button className="button primary" type="button" onClick={() => changeStatus(version, "APPROVED")} disabled={busy}>确认</button></> : null}{canManage && version.status === "APPROVED" ? <button className="button primary" type="button" onClick={() => changeStatus(version, "FINAL")} disabled={busy}>设为最终</button> : null}</div>)}</div><div>{canUpload && selected.status !== "ARCHIVED" ? <div className={styles.formSection}><h4>上传新版本</h4><input type="file" onChange={(event) => setVersionFile(event.target.files?.[0] || null)} accept=".pdf,.png,.jpg,.jpeg,.webp,.svg,.docx,.xlsx,.pptx,.zip" /><input value={versionNote} onChange={(event) => setVersionNote(event.target.value)} placeholder="版本说明" />{selected.status === "FINAL" ? <label className={styles.field}><span>替代最终版原因 *</span><textarea value={replacementReason} onChange={(event) => setReplacementReason(event.target.value)} rows={3} /></label> : null}<button className="button secondary" type="button" onClick={() => void uploadVersion()} disabled={busy || !versionFile || (selected.status === "FINAL" && !replacementReason.trim())}><UploadCloud size={16} /> {busy ? "上传中" : "上传新版本"}</button></div> : null}</div></div> : null}
    {action ? <div className={styles.modalBackdrop}><form className={`${styles.modal} ${styles.confirm}`} onSubmit={(event) => { event.preventDefault(); if (action.kind === "archive") void archive(); else void applyStatus(action.version, action.status, actionComment); }}><header className={styles.modalHeader}><div><p className={styles.eyebrow}>FILE ACTION</p><h2>{action.kind === "archive" ? "归档文件" : "退回文件版本"}</h2></div></header><div className={styles.modalBody}><p>{action.kind === "archive" ? "归档后该文件资产不再出现在普通列表中，也不能继续上传版本。" : "请填写退回原因，提交人将据此修改文件后重新送审。"}</p><label className={styles.field}><span>{action.kind === "archive" ? "归档原因 *" : "退回原因 *"}</span><textarea value={actionComment} onChange={(event) => setActionComment(event.target.value)} rows={4} required /></label>{error ? <p className="form-error">{error}</p> : null}</div><footer className={styles.modalFooter}><button className="button secondary" type="button" onClick={() => { setAction(null); setActionComment(""); }} disabled={busy}>取消</button><button className="button primary" type="submit" disabled={busy}>{busy ? "处理中" : "确认"}</button></footer></form></div> : null}
  </section>;
}
