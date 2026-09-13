"use client";

import { ClipboardList, LoaderCircle, Plus } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchJson } from "../client-request";
import { formatDate } from "../project-center-formatters";
import type { AdminAccount, AdminPrincipal } from "../../../lib/types";
import styles from "../ProjectCenter.module.css";

type RecordItem = Record<string, unknown> & {
  id: number;
  record_type: string;
  title: string;
  content: string;
  status?: string;
  readOnly?: boolean;
  owner_name?: string;
};

type RecordForm = {
  type: string;
  title: string;
  content: string;
  status: string;
  ownerAdminId: string;
  occurredAt: string;
  communicationTarget: string;
  communicationMethod: string;
  confirmedItems: string;
  unconfirmedItems: string;
  followUpOwner: string;
  followUpDueAt: string;
  decisionQuestion: string;
  options: string;
  finalChoice: string;
  decisionMaker: string;
  decisionBasis: string;
  decisionAt: string;
  affectedTasks: string;
  affectedFiles: string;
  probability: string;
  impact: string;
  prevention: string;
  response: string;
  checkDate: string;
  actualIssue: string;
  actualImpact: string;
  resolution: string;
  dueAt: string;
  changeReason: string;
  proposer: string;
  approver: string;
  impactTasks: string;
  impactFiles: string;
  impactBudget: string;
  impactDates: string;
};

const types = [
  ["", "全部类型"],
  ["COMMUNICATION", "沟通"],
  ["DECISION", "决策"],
  ["RISK", "风险"],
  ["ISSUE", "问题"],
  ["CHANGE", "变更"],
  ["ACTIVITY", "Activity"],
].map(([value, label]) => ({ value, label }));

const typeLabels: Record<string, string> = {
  COMMUNICATION: "沟通",
  DECISION: "决策",
  RISK: "风险",
  ISSUE: "问题",
  CHANGE: "变更",
  ACTIVITY: "Activity",
};

const statuses: Record<string, Array<[string, string]>> = {
  COMMUNICATION: [["OPEN", "开放"], ["CLOSED", "已关闭"]],
  DECISION: [["OPEN", "待确认"], ["CONFIRMED", "已确认"], ["CLOSED", "已关闭"]],
  RISK: [["OPEN", "开放"], ["MONITORING", "跟进中"], ["CLOSED", "已关闭"]],
  ISSUE: [["OPEN", "开放"], ["IN_PROGRESS", "处理中"], ["RESOLVED", "已解决"], ["CLOSED", "已关闭"]],
  CHANGE: [["PROPOSED", "待批准"], ["APPROVED", "已批准"], ["REJECTED", "已拒绝"], ["IMPLEMENTED", "已实施"]],
};

function errorOf(data: unknown, fallback: string) {
  return data && typeof data === "object" && "error" in data && typeof data.error === "string" ? data.error : fallback;
}

function emptyForm(type: string): RecordForm {
  return {
    type,
    title: "",
    content: "",
    status: statuses[type]?.[0]?.[0] || "OPEN",
    ownerAdminId: "",
    occurredAt: "",
    communicationTarget: "",
    communicationMethod: "",
    confirmedItems: "",
    unconfirmedItems: "",
    followUpOwner: "",
    followUpDueAt: "",
    decisionQuestion: "",
    options: "",
    finalChoice: "",
    decisionMaker: "",
    decisionBasis: "",
    decisionAt: "",
    affectedTasks: "",
    affectedFiles: "",
    probability: "MEDIUM",
    impact: "MEDIUM",
    prevention: "",
    response: "",
    checkDate: "",
    actualIssue: "",
    actualImpact: "",
    resolution: "",
    dueAt: "",
    changeReason: "",
    proposer: "",
    approver: "",
    impactTasks: "",
    impactFiles: "",
    impactBudget: "",
    impactDates: "",
  };
}

function fieldLabel(type: string, label: string) {
  return `${typeLabels[type] || type} · ${label}`;
}

export function ProjectRecords({
  projectId,
  admin,
  accounts,
  canManage,
  canCreate,
}: {
  projectId: number;
  admin: AdminPrincipal;
  accounts: AdminAccount[];
  canManage: boolean;
  canCreate: boolean;
}) {
  const [items, setItems] = useState<RecordItem[]>([]);
  const [type, setType] = useState("");
  const [status, setStatus] = useState("");
  const [ownerId, setOwnerId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [keyword, setKeyword] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<RecordForm>(emptyForm(admin.role === "subadmin" && !canManage ? "COMMUNICATION" : "RISK"));
  const [editing, setEditing] = useState<RecordItem | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const owners = useMemo(() => accounts.filter((account) => account.status === "active"), [accounts]);

  const load = useCallback(async () => {
    const params = new URLSearchParams({ page: "1", pageSize: "100" });
    if (type) params.set("type", type);
    if (status) params.set("status", status);
    if (ownerId) params.set("ownerId", ownerId);
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    if (keyword.trim()) params.set("keyword", keyword.trim());
    const result = await fetchJson(`/api/admin/projects/${projectId}/records?${params}`, { cache: "no-store" });
    if (result.response.ok) setItems((result.data as { items: RecordItem[] }).items || []);
    else setError(errorOf(result.data, "记录加载失败"));
  }, [from, keyword, ownerId, projectId, status, to, type]);

  useEffect(() => { void load(); }, [load]);

  function openCreate() {
    const nextType = admin.role === "subadmin" && !canManage ? "COMMUNICATION" : "RISK";
    setEditing(null);
    setError("");
    setForm(emptyForm(nextType));
    setFormOpen(true);
  }

  function openEdit(item: RecordItem) {
    const nextType = item.record_type;
    const next = emptyForm(nextType);
    const payload = item.payload && typeof item.payload === "object" ? item.payload as Record<string, unknown> : {};
    Object.keys(next).forEach((key) => {
      if (key in payload) next[key as keyof RecordForm] = String(payload[key] ?? "");
    });
    next.type = nextType;
    next.title = item.title;
    next.content = item.content;
    next.status = String(item.status || next.status);
    next.ownerAdminId = item.owner_admin_id ? String(item.owner_admin_id) : "";
    next.occurredAt = String(item.occurred_at || "");
    setEditing(item);
    setError("");
    setForm(next);
    setFormOpen(true);
  }

  function updateField(key: keyof RecordForm, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const result = await fetchJson(
      editing ? `/api/admin/projects/${projectId}/records/${editing.id}` : `/api/admin/projects/${projectId}/records`,
      {
        method: editing ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...form, ownerAdminId: form.ownerAdminId ? Number(form.ownerAdminId) : null }),
      },
    );
    if (!result.response.ok) setError(errorOf(result.data, "记录保存失败"));
    else {
      setFormOpen(false);
      setEditing(null);
      await load();
    }
    setBusy(false);
  }

  const statusOptions = statuses[form.type] || statuses.RISK;
  const memberCanCreate = canCreate;
  const input = (key: keyof RecordForm, label: string, type = "text") => (
    <label className={styles.field}>
      <span>{label}</span>
      <input type={type} value={form[key]} onChange={(event) => updateField(key, event.target.value)} />
    </label>
  );
  const textarea = (key: keyof RecordForm, label: string, rows = 3) => (
    <label className={`${styles.field} ${styles.wide}`}>
      <span>{label}</span>
      <textarea value={form[key]} onChange={(event) => updateField(key, event.target.value)} rows={rows} />
    </label>
  );

  function specificFields() {
    if (form.type === "COMMUNICATION") return <section className={styles.formSection}><h3>沟通信息</h3><div className={styles.formGrid}>{input("communicationTarget", "沟通对象")}{input("communicationMethod", "沟通方式（电话 / 微信 / 会议 / 邮件 / 现场 / 其他）")}{textarea("confirmedItems", "已确认事项")}{textarea("unconfirmedItems", "未确认事项")}{input("followUpOwner", "后续负责人")}{input("followUpDueAt", "后续截止日期", "datetime-local")}</div></section>;
    if (form.type === "DECISION") return <section className={styles.formSection}><h3>决策信息</h3><div className={styles.formGrid}>{textarea("decisionQuestion", "决策问题")}{textarea("options", "可选方案")}{textarea("finalChoice", "最终选择")}{input("decisionMaker", "决策人")}{textarea("decisionBasis", "决策依据")}{input("decisionAt", "决策时间", "datetime-local")}{textarea("affectedTasks", "受影响任务")}{textarea("affectedFiles", "受影响文件")}</div></section>;
    if (form.type === "RISK") return <section className={styles.formSection}><h3>风险信息</h3><div className={styles.formGrid}><label className={styles.field}><span>发生概率</span><select value={form.probability} onChange={(event) => updateField("probability", event.target.value)}><option value="LOW">低</option><option value="MEDIUM">中</option><option value="HIGH">高</option></select></label><label className={styles.field}><span>影响程度</span><select value={form.impact} onChange={(event) => updateField("impact", event.target.value)}><option value="LOW">低</option><option value="MEDIUM">中</option><option value="HIGH">高</option></select></label>{textarea("prevention", "预防措施")}{textarea("response", "发生后的应对")}{input("checkDate", "检查日期", "date")}</div></section>;
    if (form.type === "ISSUE") return <section className={styles.formSection}><h3>问题信息</h3><div className={styles.formGrid}>{textarea("actualIssue", "已发生问题")}{textarea("actualImpact", "实际影响")}{input("dueAt", "处理期限", "datetime-local")}{textarea("resolution", "解决方案")}</div></section>;
    if (form.type === "CHANGE") return <section className={styles.formSection}><h3>变更信息</h3><div className={styles.formGrid}>{textarea("changeReason", "变更原因")}{input("proposer", "提出人")}{input("approver", "批准人")}{textarea("impactTasks", "影响任务")}{textarea("impactFiles", "影响文件")}{input("impactBudget", "影响费用")}{input("impactDates", "影响日期")}</div></section>;
    return null;
  }

  return <section className={styles.panel}>
    <div className={styles.panelTitle}><div><h3>项目记录</h3><p>沟通、风险、问题、决策和变更统一留痕，Activity 仅作系统时间线展示。</p></div><div className={styles.actionBar}>{memberCanCreate ? <button className="button primary" type="button" onClick={openCreate}><Plus size={16} /> 新建记录</button> : null}</div></div>
    <div className={styles.filterGrid}>
      <label className={styles.field}><span>类型</span><select value={type} onChange={(event) => setType(event.target.value)}>{types.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
      <label className={styles.field}><span>状态</span><select value={status} onChange={(event) => setStatus(event.target.value)}><option value="">全部状态</option>{Object.values(statuses).flat().filter(([value], index, all) => all.findIndex(([candidate]) => candidate === value) === index).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label className={styles.field}><span>负责人</span><select value={ownerId} onChange={(event) => setOwnerId(event.target.value)}><option value="">全部负责人</option>{owners.map((owner) => <option key={owner.id} value={owner.id}>{owner.name || owner.phone}</option>)}</select></label>
      <label className={styles.field}><span>开始时间</span><input type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></label>
      <label className={styles.field}><span>结束时间</span><input type="date" value={to} onChange={(event) => setTo(event.target.value)} /></label>
      <label className={styles.field}><span>关键词</span><input value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="标题或内容" /></label>
    </div>
    {error ? <p className="form-error">{error}</p> : null}
    {!items.length ? <div className={styles.empty}><ClipboardList size={26} /><p>暂无项目记录。</p></div> : <div className={styles.detailList}>{items.map((item) => <div className={styles.detailRow} key={`${item.record_type}-${item.id}`}><span className={styles.badge}>{typeLabels[item.record_type] || item.record_type}</span><div><strong>{item.title}</strong><small>{item.content.slice(0, 120)}</small></div><span>{item.owner_name || "未指定负责人"}<br />{formatDate(String(item.occurred_at || item.created_at || ""), true)}</span><span className={styles.badge}>{item.status || "系统记录"}</span>{!item.readOnly && (canManage || Number(item.created_by_admin_id) === admin.id) ? <button className="button secondary" type="button" onClick={() => openEdit(item)}>编辑</button> : null}</div>)}</div>}
    {formOpen ? <div className={styles.modalBackdrop}><form className={styles.modal} onSubmit={(event) => void save(event)}><header className={styles.modalHeader}><div><p className={styles.eyebrow}>PROJECT RECORD</p><h2>{editing ? "编辑记录" : "新建记录"}</h2></div></header><div className={styles.modalBody}><section className={styles.formSection}><h3>基本信息</h3><div className={styles.formGrid}><label className={styles.field}><span>类型</span><select value={form.type} disabled={Boolean(editing)} onChange={(event) => setForm(emptyForm(event.target.value))}>{types.filter((item) => item.value && item.value !== "ACTIVITY" && (canManage || ["COMMUNICATION", "RISK", "ISSUE"].includes(item.value))).map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label><label className={styles.field}><span>状态</span><select value={form.status} onChange={(event) => updateField("status", event.target.value)}>{statusOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label className={styles.field}><span>负责人</span><select value={form.ownerAdminId} onChange={(event) => updateField("ownerAdminId", event.target.value)}><option value="">未指定</option>{owners.map((owner) => <option key={owner.id} value={owner.id}>{owner.name || owner.phone}</option>)}</select></label>{input("occurredAt", "发生时间", "datetime-local")}{textarea("title", fieldLabel(form.type, "标题"), 2)}{textarea("content", fieldLabel(form.type, "核心内容"), 5)}</div></section>{specificFields()}{error ? <p className="form-error">{error}</p> : null}</div><footer className={styles.modalFooter}><button className="button secondary" type="button" onClick={() => setFormOpen(false)} disabled={busy}>取消</button><button className="button primary" type="submit" disabled={busy}><LoaderCircle size={16} className={busy ? "spin" : ""} /> {busy ? "保存中" : "保存"}</button></footer></form></div> : null}
  </section>;
}
