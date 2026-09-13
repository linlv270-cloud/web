"use client";

import { useEffect, useMemo, useState } from "react";
import { Pencil, Plus, Trash2, UserRound } from "lucide-react";
import { fetchJson } from "../client-request";
import type { AdminAccount } from "../../../lib/types";
import styles from "../ProjectCenter.module.css";

type Member = Record<string, unknown> & {
  id: number;
  user_id: number;
  role: string;
  functional_label?: string;
  name?: string;
  phone?: string;
  active_task_count?: number;
  pending_review_count?: number;
};

const roleLabels: Record<string, string> = {
  PROJECT_MANAGER: "项目经理",
  MEMBER: "成员",
  OBSERVER: "观察员",
};

export function ProjectMembers({
  projectId,
  members,
  accounts,
  canManage,
  onChanged,
}: {
  projectId: number;
  members: Member[];
  accounts: AdminAccount[];
  canManage: boolean;
  onChanged: () => void;
}) {
  const [userId, setUserId] = useState("");
  const [role, setRole] = useState("MEMBER");
  const [label, setLabel] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [currentMembers, setCurrentMembers] = useState<Member[]>(members);
  const [editing, setEditing] = useState<Member | null>(null);
  const [removing, setRemoving] = useState<Member | null>(null);
  const [editRole, setEditRole] = useState("MEMBER");
  const [editLabel, setEditLabel] = useState("");
  useEffect(() => setCurrentMembers(members), [members]);
  useEffect(() => {
    void fetchJson(`/api/admin/projects/${projectId}/members`, { cache: "no-store" }).then((result) => {
      if (result.response.ok && result.data && typeof result.data === "object" && "members" in result.data) {
        setCurrentMembers(result.data.members as Member[]);
      }
    });
  }, [projectId]);
  const memberIds = useMemo(() => new Set(currentMembers.map((member) => member.user_id)), [currentMembers]);
  const available = accounts.filter((account) => account.status === "active" && !memberIds.has(account.id));

  async function add() {
    setBusy(true);
    setError("");
    try {
      const result = await fetchJson(`/api/admin/projects/${projectId}/members`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userId: Number(userId), role, functionalLabel: label }),
      });
      if (!result.response.ok) throw new Error(typeof result.data?.error === "string" ? result.data.error : "添加成员失败");
      setUserId("");
      setLabel("");
      onChanged();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "添加成员失败");
    } finally {
      setBusy(false);
    }
  }

  async function remove(member: Member) {
    setBusy(true);
    setError("");
    try {
      const result = await fetchJson(`/api/admin/projects/${projectId}/members/${member.id}`, { method: "DELETE" });
      if (!result.response.ok) throw new Error(typeof result.data?.error === "string" ? result.data.error : "移除成员失败");
      onChanged();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "移除成员失败");
    } finally {
      setBusy(false);
    }
  }

  async function edit() {
    if (!editing) return;
    setBusy(true);
    setError("");
    try {
      const result = await fetchJson(`/api/admin/projects/${projectId}/members/${editing.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ role: editing.role === "PROJECT_MANAGER" ? editing.role : editRole, functionalLabel: editLabel }),
      });
      if (!result.response.ok) throw new Error(typeof result.data?.error === "string" ? result.data.error : "更新成员失败");
      setEditing(null);
      onChanged();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "更新成员失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={styles.panel}>
      <div className={styles.panelTitle}><div><h3>项目成员</h3><p>成员角色决定项目范围内的任务和验收权限。</p></div><span>{members.length} 人</span></div>
      {canManage ? <div className={styles.inlineForm}>
        <label className={styles.field}><span>管理员</span><select value={userId} onChange={(event) => setUserId(event.target.value)}><option value="">选择启用账号</option>{available.map((account) => <option key={account.id} value={account.id}>{account.name || account.phone}</option>)}</select></label>
        <label className={styles.field}><span>角色</span><select value={role} onChange={(event) => setRole(event.target.value)}><option value="MEMBER">成员</option><option value="OBSERVER">观察员</option></select></label>
        <label className={styles.field}><span>职能标签</span><input value={label} onChange={(event) => setLabel(event.target.value)} placeholder="如：视觉统筹" /></label>
        <button className="button primary" type="button" disabled={busy || !userId} onClick={() => void add()}><Plus size={16} /> 添加</button>
      </div> : null}
      {error ? <p className="form-error">{error}</p> : null}
      <div className={styles.detailList}>{currentMembers.map((member) => <div className={styles.detailRow} key={member.id}>
        <UserRound size={19} />
        <div><strong>{member.name || member.phone || "未命名账号"}</strong><small>{member.phone || "无账号信息"} · {member.functional_label || "未填写职能标签"}</small></div>
        <span className={styles.badge}>{roleLabels[member.role] || member.role}</span>
        <span>负责 {Number(member.active_task_count || 0)} 项<br />待验收 {Number(member.pending_review_count || 0)} 项</span>
        {canManage ? <button className="icon-button" type="button" aria-label="编辑成员" onClick={() => { setEditing(member); setEditRole(member.role); setEditLabel(member.functional_label || ""); }} disabled={busy}><Pencil size={16} /></button> : null}
        {canManage && member.role !== "PROJECT_MANAGER" ? <button className="icon-button" type="button" aria-label="移除成员" onClick={() => setRemoving(member)} disabled={busy}><Trash2 size={16} /></button> : null}
      </div>)}</div>
      {editing ? <div className={styles.modalBackdrop}><form className={styles.modal} onSubmit={(event) => { event.preventDefault(); void edit(); }}><header className={styles.modalHeader}><h2>编辑项目成员</h2></header><div className={styles.modalBody}><p>{editing.name || editing.phone || "当前成员"}</p><label className={styles.field}><span>项目角色</span><select value={editRole} onChange={(event) => setEditRole(event.target.value)} disabled={editing.role === "PROJECT_MANAGER"}><option value="MEMBER">成员</option><option value="OBSERVER">观察员</option></select></label><label className={styles.field}><span>职能标签</span><input value={editLabel} onChange={(event) => setEditLabel(event.target.value)} /></label>{error ? <p className="form-error">{error}</p> : null}</div><footer className={styles.modalFooter}><button className="button secondary" type="button" onClick={() => setEditing(null)} disabled={busy}>取消</button><button className="button primary" type="submit" disabled={busy}>{busy ? "保存中" : "保存"}</button></footer></form></div> : null}
      {removing ? <div className={styles.modalBackdrop}><form className={`${styles.modal} ${styles.confirm}`} onSubmit={(event) => { event.preventDefault(); const member = removing; setRemoving(null); void remove(member); }}><header className={styles.modalHeader}><h2>移除项目成员</h2></header><div className={styles.modalBody}><p>确定移除「{removing.name || removing.phone || "该成员"}」吗？</p><p>该操作不会删除历史任务和项目记录，但该账号将失去项目访问权限。</p>{error ? <p className="form-error">{error}</p> : null}</div><footer className={styles.modalFooter}><button className="button secondary" type="button" onClick={() => setRemoving(null)} disabled={busy}>取消</button><button className="button primary" type="submit" disabled={busy}>确认移除</button></footer></form></div> : null}
    </section>
  );
}
