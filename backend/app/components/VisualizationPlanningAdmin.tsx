"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bot,
  CalendarDays,
  CirclePlus,
  LoaderCircle,
  Pencil,
  Play,
  Save,
  Trash2,
} from "lucide-react";

type Toast = (message: string) => void;
type LocationProvince = { code: string; name: string; cities: Array<{ code: string; name: string }> };

type VizPlan = {
  id: number;
  planDate: string;
  startDate: string;
  endDate: string;
  province: string;
  city: string;
  source: "manual" | "ai" | "resource";
  title: string;
  description: string;
  status: "draft" | "published" | "archived";
  resourceProjectId: string | null;
  createdByLabel: string;
  createdAt: string;
};

type AiSettings = {
  enabled: boolean;
  promptTemplate: string;
  minCreatorCount: number;
  scheduleWeekday: number;
  scheduleHour: number;
  horizonDays: number;
  requireReview: boolean;
  maxCandidatesPerRun: number;
  lastAutoRunAt: string | null;
};

type AiProvider = {
  id: number;
  name: string;
  model: string;
  baseUrl: string;
  apiKeyEnv: string;
  keyConfigured: boolean;
  priority: number;
  weight: number;
  maxConcurrency: number;
  enabled: boolean;
  lastStatus: "unused" | "healthy" | "error";
  lastError: string;
};

type AiRun = {
  id: number;
  triggerType: "manual" | "scheduled";
  status: "queued" | "running" | "completed" | "no_candidates" | "failed";
  scope: { province?: string; city?: string; date?: string };
  candidateCount: number;
  generatedCount: number;
  providerSummary: Record<string, number>;
  error: string;
  requestedBy: string;
  createdAt: string;
};

async function readJson(response: Response) {
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "操作失败");
  return data;
}

function useLocations() {
  const [locations, setLocations] = useState<LocationProvince[]>([]);
  useEffect(() => {
    fetch("/api/public/locations")
      .then(readJson)
      .then((data) => setLocations(data.provinces || []))
      .catch(() => setLocations([]));
  }, []);
  return locations;
}

type EditablePlan = {
  id: number;
  startDate: string;
  endDate: string;
  province: string;
  city: string;
  source: "manual" | "ai" | "resource";
  title: string;
  description: string;
  status: "draft" | "published";
  resourceProjectId: string;
};

const emptyPlan: EditablePlan = {
  id: 0, startDate: "", endDate: "", province: "", city: "", source: "manual" as const,
  title: "", description: "", status: "draft",
  resourceProjectId: "",
};

export function VisualizationPlansAdmin({ showToast }: { showToast: Toast }) {
  const locations = useLocations();
  const [plans, setPlans] = useState<VizPlan[]>([]);
  const [form, setForm] = useState(emptyPlan);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const province = locations.find((item) => item.name === form.province);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await readJson(await fetch("/api/admin/viz/plans", { cache: "no-store" }));
      setPlans(data.plans || []);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "加载方案失败");
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => { void load(); }, [load]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      const data = await readJson(await fetch("/api/admin/viz/plans", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(form),
      }));
      setPlans(data.plans || []);
      setForm(emptyPlan);
      setOpen(false);
      showToast(form.id ? "投放方案已更新" : "投放方案已创建");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const changeStatus = async (plan: VizPlan, status: "draft" | "published" | "archived") => {
    try {
      const data = await readJson(await fetch("/api/admin/viz/plans", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "status", id: plan.id, status }),
      }));
      setPlans(data.plans || []);
      showToast(status === "published" ? "方案已发布" : status === "draft" ? "方案已转为草稿" : "方案已下线");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "操作失败");
    }
  };

  const edit = (plan: VizPlan) => {
    setForm({
      id: plan.id, startDate: plan.startDate || plan.planDate, endDate: plan.endDate || plan.planDate, province: plan.province, city: plan.city,
      source: plan.source, title: plan.title,
      description: plan.description, status: plan.status === "published" ? "published" : "draft",
      resourceProjectId: plan.resourceProjectId || "",
    });
    setOpen(true);
  };

  return (
    <section className="viz-admin-unit">
      <div className="admin-section-heading">
        <div><p className="eyebrow">PLAN DELIVERY</p><h3>方案投放</h3><p>人工、资源库和 AI 方案按城市与日期并存；前台灵感日历以列表展示，由使用者选择查看。</p></div>
        <button className="button primary" type="button" onClick={() => { setForm(emptyPlan); setOpen((value) => !value); }}><CirclePlus size={16} />新增方案</button>
      </div>

      {open ? (
        <form className="viz-plan-form" onSubmit={submit}>
          <div className="form-grid three">
            <label className="field"><span>开始日期</span><input type="date" value={form.startDate} max={form.endDate || undefined} onChange={(event) => setForm({ ...form, startDate: event.target.value, endDate: form.endDate || event.target.value })} required /></label>
            <label className="field"><span>结束日期</span><input type="date" value={form.endDate} min={form.startDate || undefined} onChange={(event) => setForm({ ...form, endDate: event.target.value })} required /></label>
            <label className="field"><span>省份</span><select value={form.province} onChange={(event) => setForm({ ...form, province: event.target.value, city: "" })} required><option value="">请选择</option>{locations.map((item) => <option key={item.code}>{item.name}</option>)}</select></label>
            <label className="field"><span>城市</span><select value={form.city} onChange={(event) => setForm({ ...form, city: event.target.value })} disabled={!province} required><option value="">请选择</option>{province?.cities.map((item) => <option key={item.code}>{item.name}</option>)}</select></label>
            <label className="field"><span>方案来源</span><select value={form.source} onChange={(event) => setForm({ ...form, source: event.target.value as "manual" | "resource" })} disabled={form.source === "ai"}><option value="manual">人工投放</option>{form.source === "ai" ? <option value="ai">AI方案候选</option> : null}<option value="resource" disabled>TDE资源库项目（预留）</option></select></label>
            <label className="field"><span>发布状态</span><select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value as "draft" | "published" })}><option value="draft">草稿</option><option value="published">直接发布</option></select></label>
            <label className="field span-two"><span>投放主题</span><input value={form.title} maxLength={80} onChange={(event) => setForm({ ...form, title: event.target.value })} required /></label>
          </div>
          <label className="field"><span>主题描述</span><textarea rows={5} maxLength={1200} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></label>
          <div className="admin-form-actions"><button className="button primary" disabled={saving}>{saving ? <LoaderCircle className="spin" size={16} /> : <Save size={16} />}{form.id ? "保存修改" : "创建投放"}</button><button className="button secondary" type="button" onClick={() => setOpen(false)}>取消</button></div>
        </form>
      ) : null}

      {loading ? <AdminLoading /> : (
        <div className="viz-plan-list">
          {plans.map((plan) => (
            <article key={plan.id}>
              <div className="viz-plan-date"><CalendarDays size={18} /><strong>{plan.startDate === plan.endDate ? plan.startDate : `${plan.startDate} 至 ${plan.endDate}`}</strong><span>{plan.city}</span></div>
              <div><div className="viz-plan-badges"><span className={`source-${plan.source}`}>{plan.source === "manual" ? "人工" : plan.source === "ai" ? "AI" : "资源库"}</span><span>{plan.status === "published" ? "已发布" : "草稿"}</span></div><h4>{plan.title}</h4><p>{plan.description || "暂无主题描述"}</p></div>
              <div className="viz-plan-actions">
                <button type="button" title="编辑方案" onClick={() => edit(plan)}><Pencil size={16} /></button>
                <button type="button" onClick={() => void changeStatus(plan, plan.status === "published" ? "draft" : "published")}>{plan.status === "published" ? "转草稿" : "发布"}</button>
                <button type="button" title="下线方案" onClick={() => void changeStatus(plan, "archived")}><Trash2 size={16} /></button>
              </div>
            </article>
          ))}
          {!plans.length ? <p className="empty-note">还没有人工或 AI 方案。</p> : null}
        </div>
      )}
    </section>
  );
}

const defaultAiSettings: AiSettings = {
  enabled: false, promptTemplate: "", minCreatorCount: 20, scheduleWeekday: 1,
  scheduleHour: 9, horizonDays: 90, requireReview: true, maxCandidatesPerRun: 20,
  lastAutoRunAt: null,
};

const emptyProvider = {
  id: 0, name: "", model: "", baseUrl: "", apiKeyEnv: "",
  priority: 100, weight: 1, maxConcurrency: 1, enabled: true,
};

export function VisualizationAiAdmin({ showToast }: { showToast: Toast }) {
  const locations = useLocations();
  const [settings, setSettings] = useState<AiSettings>(defaultAiSettings);
  const [providers, setProviders] = useState<AiProvider[]>([]);
  const [runs, setRuns] = useState<AiRun[]>([]);
  const [providerForm, setProviderForm] = useState(emptyProvider);
  const [showProvider, setShowProvider] = useState(false);
  const [scope, setScope] = useState({ province: "", city: "", date: "" });
  const [saving, setSaving] = useState(false);
  const province = locations.find((item) => item.name === scope.province);

  const applySnapshot = (data: { settings?: AiSettings; providers?: AiProvider[]; runs?: AiRun[] }) => {
    if (data.settings) setSettings(data.settings);
    if (data.providers) setProviders(data.providers);
    if (data.runs) setRuns(data.runs);
  };

  const load = useCallback(async () => {
    try { applySnapshot(await readJson(await fetch("/api/admin/viz/ai", { cache: "no-store" }))); }
    catch (error) { showToast(error instanceof Error ? error.message : "加载AI方案设置失败"); }
  }, [showToast]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!runs.some((item) => item.status === "queued" || item.status === "running")) return;
    const timer = window.setInterval(() => void load(), 5000);
    return () => window.clearInterval(timer);
  }, [load, runs]);

  const saveSettings = async () => {
    setSaving(true);
    try {
      applySnapshot(await readJson(await fetch("/api/admin/viz/ai", {
        method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(settings),
      })));
      showToast("AI方案规则已保存");
    } catch (error) { showToast(error instanceof Error ? error.message : "保存失败"); }
    finally { setSaving(false); }
  };

  const saveProvider = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      applySnapshot(await readJson(await fetch("/api/admin/viz/ai", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "save-provider", provider: providerForm }),
      })));
      setProviderForm(emptyProvider); setShowProvider(false); showToast("AI供应商已保存");
    } catch (error) { showToast(error instanceof Error ? error.message : "保存失败"); }
  };

  const queue = async () => {
    try {
      applySnapshot(await readJson(await fetch("/api/admin/viz/ai", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "queue", ...scope }),
      })));
      showToast("AI方案任务已进入队列");
    } catch (error) { showToast(error instanceof Error ? error.message : "任务创建失败"); }
  };

  const editProvider = (provider: AiProvider) => {
    setProviderForm({
      id: provider.id, name: provider.name, model: provider.model, baseUrl: provider.baseUrl,
      apiKeyEnv: provider.apiKeyEnv, priority: provider.priority, weight: provider.weight,
      maxConcurrency: provider.maxConcurrency, enabled: provider.enabled,
    });
    setShowProvider(true);
  };

  const deleteProvider = async (id: number) => {
    if (!window.confirm("确定删除这个AI供应商配置？服务器密钥不会被删除。")) return;
    try {
      applySnapshot(await readJson(await fetch("/api/admin/viz/ai", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "delete-provider", id }),
      })));
      showToast("AI供应商已删除");
    } catch (error) { showToast(error instanceof Error ? error.message : "删除失败"); }
  };

  const statusLabels: Record<AiRun["status"], string> = {
    queued: "等待执行", running: "生成中", completed: "已完成",
    no_candidates: "无候选日期", failed: "失败",
  };

  return (
    <section className="viz-admin-unit">
      <div className="admin-section-heading"><div><p className="eyebrow">AI PLAN ENGINE</p><h3>AI方案</h3><p>根据城市、日期与主理人供给生成灵感方案候选，审核后通过“方案投放”发布到前台。</p></div><button className="button primary" type="button" onClick={saveSettings} disabled={saving}>{saving ? <LoaderCircle className="spin" size={16} /> : <Save size={16} />}保存规则</button></div>

      <div className="viz-ai-settings">
        <label className="toggle-row"><input type="checkbox" checked={settings.enabled} onChange={(event) => setSettings({ ...settings, enabled: event.target.checked })} /><span>每周自动更新</span></label>
        <label className="toggle-row"><input type="checkbox" checked={settings.requireReview} onChange={(event) => setSettings({ ...settings, requireReview: event.target.checked })} /><span>生成后先进入草稿审核</span></label>
        <div className="form-grid five">
          <label className="field"><span>人数阈值</span><input type="number" min="1" value={settings.minCreatorCount} onChange={(event) => setSettings({ ...settings, minCreatorCount: Number(event.target.value) })} /></label>
          <label className="field"><span>每周执行日</span><select value={settings.scheduleWeekday} onChange={(event) => setSettings({ ...settings, scheduleWeekday: Number(event.target.value) })}>{["一", "二", "三", "四", "五", "六", "日"].map((day, index) => <option key={day} value={index + 1}>周{day}</option>)}</select></label>
          <label className="field"><span>执行小时</span><input type="number" min="0" max="23" value={settings.scheduleHour} onChange={(event) => setSettings({ ...settings, scheduleHour: Number(event.target.value) })} /></label>
          <label className="field"><span>分析未来天数</span><input type="number" min="7" max="365" value={settings.horizonDays} onChange={(event) => setSettings({ ...settings, horizonDays: Number(event.target.value) })} /></label>
          <label className="field"><span>单次最多候选</span><input type="number" min="1" max="100" value={settings.maxCandidatesPerRun} onChange={(event) => setSettings({ ...settings, maxCandidatesPerRun: Number(event.target.value) })} /></label>
        </div>
        <label className="field"><span>系统提示词</span><textarea rows={7} maxLength={4000} value={settings.promptTemplate} onChange={(event) => setSettings({ ...settings, promptTemplate: event.target.value })} /></label>
      </div>

      <div className="viz-ai-section-heading"><div><Bot size={18} /><strong>模型供应商</strong></div><button className="button secondary" type="button" onClick={() => { setProviderForm(emptyProvider); setShowProvider((value) => !value); }}><CirclePlus size={16} />新增</button></div>
      {showProvider ? (
        <form className="viz-provider-form" onSubmit={saveProvider}>
          <div className="form-grid three">
            <label className="field"><span>供应商名称</span><input value={providerForm.name} onChange={(event) => setProviderForm({ ...providerForm, name: event.target.value })} required /></label>
            <label className="field"><span>模型</span><input value={providerForm.model} onChange={(event) => setProviderForm({ ...providerForm, model: event.target.value })} required /></label>
            <label className="field"><span>密钥环境变量名</span><input value={providerForm.apiKeyEnv} onChange={(event) => setProviderForm({ ...providerForm, apiKeyEnv: event.target.value.toUpperCase() })} placeholder="VIZ_AI_PROVIDER_1_KEY" required /></label>
            <label className="field span-two"><span>OpenAI 兼容接口地址（含 /chat/completions）</span><input type="url" value={providerForm.baseUrl} onChange={(event) => setProviderForm({ ...providerForm, baseUrl: event.target.value })} required /></label>
            <label className="field"><span>优先级</span><input type="number" min="1" value={providerForm.priority} onChange={(event) => setProviderForm({ ...providerForm, priority: Number(event.target.value) })} /></label>
            <label className="field"><span>权重</span><input type="number" min="1" value={providerForm.weight} onChange={(event) => setProviderForm({ ...providerForm, weight: Number(event.target.value) })} /></label>
            <label className="field"><span>最大并发</span><input type="number" min="1" max="10" value={providerForm.maxConcurrency} onChange={(event) => setProviderForm({ ...providerForm, maxConcurrency: Number(event.target.value) })} /></label>
            <label className="toggle-row"><input type="checkbox" checked={providerForm.enabled} onChange={(event) => setProviderForm({ ...providerForm, enabled: event.target.checked })} /><span>启用</span></label>
          </div>
          <div className="admin-form-actions"><button className="button primary"><Save size={16} />保存供应商</button><button className="button secondary" type="button" onClick={() => setShowProvider(false)}>取消</button></div>
        </form>
      ) : null}
      <div className="viz-provider-list">
        {providers.map((provider) => <article key={provider.id}><div><strong>{provider.name}</strong><span>{provider.model}</span></div><div><span>{provider.keyConfigured ? "密钥已配置" : `待配置 ${provider.apiKeyEnv}`}</span><small>{provider.lastStatus === "healthy" ? "运行正常" : provider.lastStatus === "error" ? provider.lastError || "最近调用失败" : "尚未调用"}</small></div><div><button type="button" title="编辑供应商" onClick={() => editProvider(provider)}><Pencil size={16} /></button><button type="button" title="删除供应商" onClick={() => void deleteProvider(provider.id)}><Trash2 size={16} /></button></div></article>)}
        {!providers.length ? <p className="empty-note">尚未配置模型供应商；API 密钥只写入服务器环境变量。</p> : null}
      </div>

      <div className="viz-ai-section-heading"><div><Play size={18} /><strong>手动更新与运行记录</strong></div></div>
      <div className="viz-ai-run-controls">
        <select value={scope.province} onChange={(event) => setScope({ province: event.target.value, city: "", date: scope.date })}><option value="">全国</option>{locations.map((item) => <option key={item.code}>{item.name}</option>)}</select>
        <select value={scope.city} onChange={(event) => setScope({ ...scope, city: event.target.value })} disabled={!province}><option value="">全省城市</option>{province?.cities.map((item) => <option key={item.code}>{item.name}</option>)}</select>
        <input type="date" value={scope.date} onChange={(event) => setScope({ ...scope, date: event.target.value })} />
        <button className="button primary" type="button" onClick={() => void queue()}><Play size={16} />加入任务队列</button>
      </div>
      <div className="viz-ai-runs">
        {runs.map((item) => <article key={item.id}><strong>#{item.id} {statusLabels[item.status]}</strong><span>{item.scope.city || item.scope.province || "全国"}{item.scope.date ? ` · ${item.scope.date}` : ""}</span><span>候选 {item.candidateCount} · 生成 {item.generatedCount}</span><small>{item.error || item.requestedBy || item.triggerType}</small></article>)}
        {!runs.length ? <p className="empty-note">还没有运行记录。</p> : null}
      </div>
    </section>
  );
}

function AdminLoading() {
  return <div className="admin-loading-inline"><LoaderCircle className="spin" size={20} /><span>正在加载</span></div>;
}
