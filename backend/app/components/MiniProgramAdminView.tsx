"use client";

import Image from "next/image";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { ImagePlus, Pencil, Plus, X } from "lucide-react";
import type { AdminOverview, CreatorProfile, Tag } from "../../lib/types";
import type {
  ConsultationThread,
  CreatorApplicationAdminItem,
  HomepageBanner,
  HomepageSlot,
  KitGuide,
  MiniActivity,
  MiniProgramSettings,
  ProjectOperationRequest,
  ProjectSchedule,
  ReviewThread,
  VenueHour,
  VenueKit,
  VenueRule,
  WorkshopKit,
  WorkshopProject,
  WorkshopVenue,
} from "../../lib/mini-program-types";
import { formatShanghaiDateTime } from "../../lib/datetime";
import { fetchJson } from "./client-request";

type LocationProvince = {
  code: string;
  name: string;
  cities: Array<{
    code: string;
    name: string;
    districts?: Array<{ code: string; name: string }>;
  }>;
};

type MiniAdminData = {
  settings: MiniProgramSettings;
  activities: MiniActivity[];
  consultations: ConsultationThread[];
  metrics: {
    activities: number;
    publishedActivities: number;
    consultations: number;
    overdueConsultations: number;
    consumers: number;
    draws: number;
  };
};

type WorkshopAdminData = {
  venues: WorkshopVenue[];
  venueHours: VenueHour[];
  kits: WorkshopKit[];
  kitGuides: KitGuide[];
  venueRules: VenueRule[];
  venueKits: VenueKit[];
  projects: WorkshopProject[];
  homepageBanners: HomepageBanner[];
  homepageSlots: HomepageSlot[];
  operationRequests: ProjectOperationRequest[];
  reviewThreads: ReviewThread[];
  supportTickets: unknown[];
  creatorApplications: CreatorApplicationAdminItem[];
  approvedProjectTagIdsByCreator: Record<number, number[]>;
  metrics: {
    venues: number;
    kits: number;
    projects: number;
    supportTickets: number;
  };
};

export function MiniProgramAdminView({
  admin,
  creators,
  tags,
  locations,
  showToast,
}: {
  admin: AdminOverview["admin"];
  creators: CreatorProfile[];
  tags: Tag[];
  locations: LocationProvince[];
  showToast: (message: string) => void;
}) {
  const [data, setData] = useState<MiniAdminData | null>(null);
  const [workshopData, setWorkshopData] = useState<WorkshopAdminData | null>(null);
  const [view, setView] = useState<"activities" | "workshop" | "consultations" | "settings">("workshop");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settingsForm, setSettingsForm] = useState<MiniProgramSettings | null>(null);
  const [editingActivity, setEditingActivity] = useState<MiniActivity | "new" | null>(null);

  const loadMini = useCallback(async () => {
    setLoading(true);
    const { response, data: payload } = await fetchJson("/api/admin/mini/overview", {
      cache: "no-store",
    });
    setLoading(false);
    if (!response.ok) return showToast(payload.error || "小程序运营数据加载失败");
    setData(payload as MiniAdminData);
    setSettingsForm((payload as MiniAdminData).settings);
  }, [showToast]);

  const loadWorkshop = useCallback(async () => {
    const { response, data: payload } = await fetchJson("/api/admin/workshop/overview", {
      cache: "no-store",
    });
    if (!response.ok) return showToast(payload.error || "工作坊运营数据加载失败");
    setWorkshopData(payload as WorkshopAdminData);
  }, [showToast]);

  useEffect(() => {
    void loadMini();
    void loadWorkshop();
  }, [loadMini, loadWorkshop]);

  async function updateActivity(activity: MiniActivity, status: MiniActivity["status"]) {
    const { response, data: payload } = await fetchJson("/api/admin/mini/activity", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ...activity,
        id: activity.id,
        creatorId: activity.creatorId,
        status,
        tagIds: activity.tags.map((tag) => tag.id),
      }),
    });
    if (!response.ok) return showToast(payload.error || "活动状态保存失败");
    showToast("活动状态已更新");
    await loadMini();
  }

  async function saveCreatorLimits(
    creator: CreatorProfile,
    activityLimit: string,
    replyTimeoutMinutes: string,
  ) {
    const { response, data: payload } = await fetchJson("/api/admin/mini/creator-settings", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ creatorId: creator.id, activityLimit, replyTimeoutMinutes }),
    });
    if (!response.ok) return showToast(payload.error || "新遇官接待设置保存失败");
    showToast("新遇官接待设置已保存");
    await loadMini();
  }

  async function saveSettings(event: FormEvent) {
    event.preventDefault();
    if (!settingsForm) return;
    setSaving(true);
    const { response, data: payload } = await fetchJson("/api/admin/mini/settings", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(settingsForm),
    });
    setSaving(false);
    if (!response.ok) return showToast(payload.error || "小程序设置保存失败");
    setSettingsForm(payload.settings);
    showToast("小程序设置已保存");
    await loadMini();
  }

  async function uploadVisual(
    kind: "hero" | "loading" | "reveal",
    file?: File,
  ) {
    if (!file) return;
    const body = new FormData();
    body.append("kind", kind);
    body.append("file", file);
    const response = await fetch("/api/admin/mini/visual", { method: "POST", body });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) return showToast(payload.error || "视觉图片上传失败");
    showToast("小程序视觉图片已更换");
    await loadMini();
  }

  if (loading && !data)
    return (
      <section className="admin-section-block">
        <p className="empty-note">正在读取小程序运营数据。</p>
      </section>
    );
  if (!data || !settingsForm)
    return (
      <section className="admin-section-block">
        <button className="button secondary" onClick={loadMini}>重新加载</button>
      </section>
    );

  return (
    <div className="admin-stack mini-admin-view">
      <section className="mini-metrics">
        <article><span>体验</span><strong>{workshopData?.metrics.projects ?? 0}</strong><small>当前正式体验</small></article>
        <article><span>微信用户</span><strong>{data.metrics.consumers}</strong><small>{admin.role === "super" ? "平台累计用户" : "仅超级管理员可见全量"}</small></article>
        <article><span>咨询总数</span><strong>{data.metrics.consultations}</strong><small>{data.metrics.overdueConsultations} 条等待超时</small></article>
        <article><span>企微通知</span><strong>自动</strong><small>站内留档，企业微信及时提醒</small></article>
      </section>

      <div className="mini-view-tabs">
        <button className={view === "workshop" ? "active" : ""} onClick={() => setView("workshop")}>工作坊配置</button>
        <button className={view === "consultations" ? "active" : ""} onClick={() => setView("consultations")}>顾客咨询{data.metrics.overdueConsultations ? ` · ${data.metrics.overdueConsultations}` : ""}</button>
        {admin.role === "super" ? <button className={view === "settings" ? "active" : ""} onClick={() => setView("settings")}>视觉与规则</button> : null}
      </div>

      {view === "activities" ? (
        <>
          <section className="admin-section-block">
            <div className="admin-section-heading">
              <div><p className="eyebrow">LIVE ACTIVITIES</p><h2>新遇官活动</h2><p>管理员可代新遇官维护活动；暂停后不会在前台展示。</p></div>
              <button className="button primary" type="button" disabled={!creators.length} onClick={() => setEditingActivity("new")}><Plus size={17} />新增活动</button>
            </div>
            <div className="data-table-wrap">
              <table className="data-table">
                <thead><tr><th>TDE新遇官 / 活动</th><th>城市与日期</th><th>数据</th><th>展示状态</th><th>操作</th></tr></thead>
                <tbody>{data.activities.map((activity) => (
                  <tr key={activity.id}>
                    <td><strong>{activity.creatorName}</strong><span>{activity.title || "未命名活动"}</span></td>
                    <td><strong>{activity.city} {activity.district}</strong><span>{activity.noPlan ? "近期无计划" : `${activity.startDate} 至 ${activity.endDate}`}</span></td>
                    <td><strong>{activity.viewCount} 次查看</strong><span>{activity.consultationCount} 次咨询</span></td>
                    <td><select value={activity.status} onChange={(event) => void updateActivity(activity, event.target.value as MiniActivity["status"])}><option value="draft">草稿</option><option value="published">已发布</option><option value="paused">已暂停</option><option value="archived">已归档</option></select></td>
                    <td><button className="mini-row-action" type="button" onClick={() => setEditingActivity(activity)}><Pencil size={15} />编辑</button></td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
            {!data.activities.length ? <p className="empty-note">还没有新遇官提交活动。</p> : null}
          </section>
          <section className="admin-section-block">
            <div className="admin-section-heading"><div><p className="eyebrow">CREATOR LIMITS</p><h2>活动数量与回复时限</h2><p>留空则跟随平台默认值；超级管理员和所属子管理员都可修改。</p></div></div>
            <div className="mini-creator-limits">{creators.map((creator) => <MiniCreatorLimitRow key={creator.id} creator={creator} defaultActivityLimit={data.settings.defaultActivityLimit} defaultReplyTimeout={data.settings.defaultReplyTimeoutMinutes} onSave={saveCreatorLimits} />)}</div>
          </section>
        </>
      ) : null}

      {view === "workshop" ? (
        <WorkshopOperationsView
          admin={admin}
          creators={creators}
          tags={tags}
          locations={locations}
          data={workshopData}
          showToast={showToast}
          onRefresh={loadWorkshop}
        />
      ) : null}

      {view === "consultations" ? (
        <section className="admin-section-block">
          <div className="admin-section-heading"><div><p className="eyebrow">CONSULTATIONS</p><h2>历史咨询记录</h2><p>顾客端已改为展示“联系TDE”固定文字，这里只读保留历史记录。</p></div><span>{data.consultations.length} 条</span></div>
          <div className="mini-consultations">{data.consultations.map((thread) => (
            <details key={thread.id} className={thread.overdue ? "overdue" : ""}>
              <summary><div><strong>{thread.kind === "official" ? thread.subject : `${thread.consumerName} → ${thread.creatorName}`}</strong><span>{thread.activityTitle || "TDE官方客服"} · {formatShanghaiDateTime(thread.lastMessageAt)}</span></div><span>{thread.overdue ? "等待超时" : thread.status === "waiting" ? "等待回复" : "已回复"}</span></summary>
              <div className="mini-message-history">{thread.messages?.map((message) => <p key={message.id}><strong>{message.senderType === "consumer" ? "顾客" : message.senderType === "creator" ? "TDE新遇官" : "TDE客服"}</strong><span>{message.body}</span><time>{formatShanghaiDateTime(message.createdAt)}</time></p>)}</div>
            </details>
          ))}</div>
          {!data.consultations.length ? <p className="empty-note">还没有顾客咨询。</p> : null}
        </section>
      ) : null}

      {view === "settings" && admin.role === "super" ? (
        <form className="admin-settings-form mini-settings-form" onSubmit={saveSettings}>
          <section>
            <div className="admin-section-heading"><div><p className="eyebrow">MINI PROGRAM</p><h2>开关与默认规则</h2></div></div>
            <label className="toggle-row"><input type="checkbox" checked={settingsForm.enabled} onChange={(event) => setSettingsForm({ ...settingsForm, enabled: event.target.checked })}/><span>{settingsForm.enabled ? "体验推荐已开放" : "体验推荐已暂停"}</span></label>
            <label className="toggle-row"><input type="checkbox" checked={settingsForm.creatorInvitationsEnabled} onChange={(event) => setSettingsForm({ ...settingsForm, creatorInvitationsEnabled: event.target.checked })}/><span>{settingsForm.creatorInvitationsEnabled ? "新遇官邀请码已开启" : "新遇官邀请码已关闭"}</span></label>
            <div className="form-grid two"><label className="field"><span>默认活动数量上限</span><input type="number" min={1} max={20} value={settingsForm.defaultActivityLimit} onChange={(event) => setSettingsForm({ ...settingsForm, defaultActivityLimit: Number(event.target.value) })}/></label><label className="field"><span>默认回复时限（分钟）</span><input type="number" min={10} max={10080} value={settingsForm.defaultReplyTimeoutMinutes} onChange={(event) => setSettingsForm({ ...settingsForm, defaultReplyTimeoutMinutes: Number(event.target.value) })}/></label></div>
          </section>
          <section><h2>小程序固定文案</h2><div className="form-grid two"><label className="field span-two"><span>品牌开场语</span><input value={settingsForm.openingCopy} maxLength={80} onChange={(event) => setSettingsForm({ ...settingsForm, openingCopy: event.target.value })}/></label><label className="field"><span>核心口号</span><input value={settingsForm.slogan} maxLength={40} onChange={(event) => setSettingsForm({ ...settingsForm, slogan: event.target.value })}/></label><label className="field"><span>核心按钮</span><input value={settingsForm.drawButton} maxLength={12} onChange={(event) => setSettingsForm({ ...settingsForm, drawButton: event.target.value })}/></label><label className="field span-two"><span>联系TDE</span><textarea rows={4} value={settingsForm.contactCopy} maxLength={300} onChange={(event) => setSettingsForm({ ...settingsForm, contactCopy: event.target.value })}/></label></div></section>
          <section>
            <h2>TDE新遇官申请字段</h2>
            <div className="mini-application-field-settings">
              {Object.entries(settingsForm.creatorApplicationFields).map(([key, field]) => {
                const systemRequired = ["brandName", "location", "representativeImage", "tags", "busyPeriods"].includes(key);
                const updateField = (patch: Partial<typeof field>) => setSettingsForm({
                  ...settingsForm,
                  creatorApplicationFields: {
                    ...settingsForm.creatorApplicationFields,
                    [key]: { ...field, ...patch },
                  },
                });
                return (
                  <article key={key} className="admin-section-block compact-admin-block">
                    <div className="form-grid two">
                      <label className="field"><span>字段名称</span><input value={field.label} maxLength={30} onChange={(event) => updateField({ label: event.target.value })}/></label>
                      <label className="field"><span>提示文字</span><input value={field.hint} maxLength={80} onChange={(event) => updateField({ hint: event.target.value })}/></label>
                    </div>
                    <div className="application-field-toggles">
                      <label className="toggle-row"><input type="checkbox" checked={field.enabled} disabled={systemRequired} onChange={(event) => updateField({ enabled: event.target.checked, required: event.target.checked && field.required })}/><span>{field.enabled ? "已启用" : "已停用"}</span></label>
                      <label className="toggle-row"><input type="checkbox" checked={field.required} disabled={systemRequired || !field.enabled} onChange={(event) => updateField({ required: event.target.checked })}/><span>{field.required ? "必填" : "选填"}</span></label>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
          <section><h2>三个摄影画面</h2><div className="mini-visual-grid">{([
            ["hero", "首次进入", settingsForm.heroImageUrl],
            ["loading", "抽取中", settingsForm.loadingImageUrl],
            ["reveal", "揭晓备用", settingsForm.revealImageUrl],
          ] as const).map(([kind, label, url]) => (
            <article key={kind}>{url ? <Image src={url} alt={label} fill sizes="220px" unoptimized/> : <span>使用小程序内置摄影图</span>}<label><ImagePlus size={16}/>{label}<input type="file" accept=".jpg,.jpeg,.png,.webp" onChange={(event) => { const file = event.target.files?.[0]; event.currentTarget.value = ""; void uploadVisual(kind, file); }}/></label></article>
          ))}</div></section>
          <button className="button primary" disabled={saving}>{saving ? "保存中" : "保存小程序规则与文案"}</button>
        </form>
      ) : null}

      {editingActivity ? (
        <MiniActivityDialog
          activity={editingActivity === "new" ? null : editingActivity}
          creators={creators}
          tags={tags}
          locations={locations}
          onClose={() => setEditingActivity(null)}
          onSaved={async () => {
            setEditingActivity(null);
            showToast("活动资料已保存");
            await loadMini();
          }}
        />
      ) : null}
    </div>
  );
}

function MiniActivityDialog({
  activity,
  creators,
  tags,
  locations,
  onClose,
  onSaved,
}: {
  activity: MiniActivity | null;
  creators: CreatorProfile[];
  tags: Tag[];
  locations: LocationProvince[];
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const initialCreator = creators.find((item) => item.id === activity?.creatorId) || creators[0];
  const [form, setForm] = useState({
    id: activity?.id || 0,
    creatorId: initialCreator?.id || 0,
    title: activity?.title || initialCreator?.brandName || "",
    shortIntro: activity?.shortIntro || "",
    description: activity?.description || "",
    province: activity?.province || initialCreator?.province || "",
    city: activity?.city || initialCreator?.city || "",
    district: activity?.district || initialCreator?.district || "",
    address: activity?.address || "",
    startDate: activity?.startDate || "",
    endDate: activity?.endDate || "",
    noPlan: activity?.noPlan || false,
    acceptsQidengDuringActivity: activity?.acceptsQidengDuringActivity || false,
    status: activity?.status || "published",
    tagIds: activity?.tags.map((tag) => tag.id) || initialCreator?.tags.map((tag) => tag.id) || [],
  });
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const province = locations.find((item) => item.name === form.province);
  const city = province?.cities.find((item) => item.name === form.city);
  const creator = creators.find((item) => item.id === form.creatorId);
  const availableTags = tags.filter((tag) => tag.status === "active" || form.tagIds.includes(tag.id));
  const currentImage = activity?.imageUrl.startsWith("/api/assets/") || activity?.status === "published"
    ? activity?.imageUrl
    : creator?.workUrls[0];

  function chooseCreator(id: number) {
    const selected = creators.find((item) => item.id === id);
    if (!selected) return;
    setForm((current) => ({
      ...current,
      creatorId: selected.id,
      title: current.title || selected.brandName,
      province: selected.province,
      city: selected.city,
      district: selected.district,
      tagIds: selected.tags.map((tag) => tag.id),
    }));
  }

  function toggleTag(id: number) {
    setForm((current) => ({
      ...current,
      tagIds: current.tagIds.includes(id)
        ? current.tagIds.filter((item) => item !== id)
        : [...current.tagIds, id].slice(0, 24),
    }));
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!form.creatorId) return setError("请选择TDE新遇官");
    if (!form.noPlan && (!form.title || !form.shortIntro || !form.startDate || !form.endDate))
      return setError("请完成活动名称、介绍和起止日期");
    setSaving(true);
    setError("");
    const { response, data } = await fetchJson("/api/admin/mini/activity", {
      method: activity ? "PATCH" : "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...form, id: form.id || undefined }),
    });
    if (!response.ok) {
      setSaving(false);
      return setError(data.error || "活动保存失败");
    }
    if (file) {
      const body = new FormData();
      body.append("activityId", String(data.activity.id));
      body.append("file", file);
      const imageResponse = await fetch("/api/admin/mini/activity-image", {
        method: "POST",
        body,
      });
      const imageData = await imageResponse.json().catch(() => ({}));
      if (!imageResponse.ok) {
        setSaving(false);
        return setError(imageData.error || "活动已保存，但图片上传失败");
      }
    }
    setSaving(false);
    await onSaved();
  }

  return (
    <div className="dialog-backdrop" onMouseDown={onClose}>
      <form className="admin-editor mini-activity-dialog" onSubmit={save} onMouseDown={(event) => event.stopPropagation()}>
        <header><div><p className="eyebrow">ACTIVITY PROFILE</p><h2>{activity ? "编辑活动" : "新增活动"}</h2><p>代新遇官完善顾客会看到的活动资料。</p></div><button type="button" onClick={onClose} aria-label="关闭"><X /></button></header>
        <div className="editor-scroll">
          <label className="field"><span>所属TDE新遇官</span><select value={form.creatorId} disabled={Boolean(activity)} onChange={(event) => chooseCreator(Number(event.target.value))}><option value="">请选择TDE新遇官</option>{creators.map((item) => <option key={item.id} value={item.id}>{item.brandName || item.phone} · {item.phone}</option>)}</select></label>
          <section className="mini-activity-image-editor">
            <div>{currentImage ? <Image src={currentImage} alt="活动图片" fill sizes="150px" unoptimized /> : <ImagePlus size={24} />}</div>
            <label className="button secondary"><ImagePlus size={17}/>{file ? file.name : currentImage ? "更换活动图片" : "上传活动图片"}<input type="file" accept=".jpg,.jpeg,.png,.webp" onChange={(event) => { const selected = event.target.files?.[0] || null; if (selected && selected.size > 20 * 1024 * 1024) { setError("图片不能超过20MB"); event.currentTarget.value = ""; return; } setFile(selected); }}/></label>
          </section>
          <label className="agreement"><input type="checkbox" checked={form.noPlan} onChange={(event) => setForm({ ...form, noPlan: event.target.checked })}/><span>近期无计划（不会展示给顾客）</span></label>
          {!form.noPlan ? (
            <>
              <div className="form-grid two"><label className="field"><span>活动名称</span><input value={form.title} maxLength={50} onChange={(event) => setForm({ ...form, title: event.target.value })}/></label><label className="field"><span>一句话介绍</span><input value={form.shortIntro} maxLength={100} onChange={(event) => setForm({ ...form, shortIntro: event.target.value })}/></label></div>
              <div className="form-grid two"><label className="field"><span>开始日期</span><input type="date" value={form.startDate} onChange={(event) => setForm({ ...form, startDate: event.target.value, endDate: form.endDate || event.target.value })}/></label><label className="field"><span>结束日期</span><input type="date" min={form.startDate} value={form.endDate} onChange={(event) => setForm({ ...form, endDate: event.target.value })}/></label></div>
              <div className="form-grid three"><label className="field"><span>省份</span><select value={form.province} onChange={(event) => setForm({ ...form, province: event.target.value, city: "", district: "" })}><option value="">请选择省份</option>{locations.map((item) => <option key={item.code}>{item.name}</option>)}</select></label><label className="field"><span>城市</span><select value={form.city} disabled={!province} onChange={(event) => setForm({ ...form, city: event.target.value, district: "" })}><option value="">请选择城市</option>{province?.cities.map((item) => <option key={item.code}>{item.name}</option>)}</select></label><label className="field"><span>区</span><select value={form.district} disabled={!city} onChange={(event) => setForm({ ...form, district: event.target.value })}><option value="">请选择区</option>{city?.districts?.map((item) => <option key={item.code}>{item.name}</option>)}</select></label></div>
              <label className="field"><span>具体地点（选填）</span><input value={form.address} maxLength={100} onChange={(event) => setForm({ ...form, address: event.target.value })}/></label>
              <label className="field"><span>活动详情（选填）</span><textarea rows={5} value={form.description} maxLength={1000} onChange={(event) => setForm({ ...form, description: event.target.value })}/></label>
              <label className="agreement"><input type="checkbox" checked={form.acceptsQidengDuringActivity} onChange={(event) => setForm({ ...form, acceptsQidengDuringActivity: event.target.checked })}/><span>活动期间也不影响参加TDE邀请</span></label>
            </>
          ) : null}
          <label className="field"><span>展示状态</span><select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value as MiniActivity["status"] })}><option value="draft">草稿</option><option value="published">已发布</option><option value="paused">已暂停</option><option value="archived">已归档</option></select></label>
          <section className="mini-activity-tags"><h3>适合谁 / 活动标签</h3><div>{availableTags.map((tag) => <button type="button" className={form.tagIds.includes(tag.id) ? "selected" : ""} key={tag.id} onClick={() => toggleTag(tag.id)}>{form.tagIds.includes(tag.id) ? "✓ " : ""}{tag.label}</button>)}</div></section>
          {error ? <p className="form-error">{error}</p> : null}
        </div>
        <footer><button className="button secondary" type="button" onClick={onClose}>取消</button><button className="button primary" disabled={saving}>{saving ? "保存中" : "保存活动"}</button></footer>
      </form>
    </div>
  );
}

function WorkshopOperationsView({
  admin,
  creators,
  tags,
  locations,
  data,
  showToast,
  onRefresh,
}: {
  admin: AdminOverview["admin"];
  creators: CreatorProfile[];
  tags: Tag[];
  locations: LocationProvince[];
  data: WorkshopAdminData | null;
  showToast: (message: string) => void;
  onRefresh: () => void | Promise<void>;
}) {
  const [editing, setEditing] = useState<
    | { kind: "venue"; item: WorkshopVenue | null }
    | { kind: "venueHour"; item: VenueHour | null; venueId?: number }
    | { kind: "kit"; item: WorkshopKit | null }
    | { kind: "kitGuide"; item: KitGuide | null; kitId?: number }
    | { kind: "venueRule"; item: VenueRule | null; venueId?: number }
    | { kind: "venueKit"; item: VenueKit | null; venueId?: number; kitId?: number }
    | { kind: "project"; item: WorkshopProject | null }
    | { kind: "projectSchedule"; item: ProjectSchedule | null; projectId?: number }
    | { kind: "banner"; item: HomepageBanner | null }
    | { kind: "slot"; item: HomepageSlot | null }
    | null
  >(null);
  const [reviewingApplication, setReviewingApplication] = useState<CreatorApplicationAdminItem | null>(null);

  if (!data)
    return (
      <section className="admin-section-block">
        <p className="empty-note">正在读取工作坊运营配置。</p>
      </section>
    );

  async function reviewApplication(
    creatorId: number,
    status: "active" | "needs_changes" | "rejected",
    reviewNote: string,
  ) {
    const { response, data: payload } = await fetchJson("/api/admin/workshop/creator-application", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ creatorId, status, reviewNote }),
    });
    if (!response.ok) {
      showToast(payload.error || "申请审核失败");
      return false;
    }
    showToast(status === "active" ? "新遇官申请已通过" : status === "needs_changes" ? "已通知新遇官补充资料" : "新遇官申请已拒绝");
    await onRefresh();
    return true;
  }

  async function restoreVisitor(creatorId: number) {
    if (!window.confirm("确认恢复为游客状态？新遇官工作台会立即关闭，已发布体验会暂停，但申请资料和草稿都会保留。")) return false;
    const { response, data: payload } = await fetchJson("/api/admin/workshop/creator-application", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ creatorId, action: "restore_visitor" }),
    });
    if (!response.ok) {
      showToast(payload.error || "恢复游客状态失败");
      return false;
    }
    showToast("已恢复游客状态并关闭新遇官工作台");
    await onRefresh();
    return true;
  }

  async function reviewOperation(item: ProjectOperationRequest, status: "approved" | "rejected") {
    const reviewNote = window.prompt(
      status === "approved" ? "通过申请，可填写补充说明（选填）" : "请填写未通过原因",
      item.reviewNote || "",
    );
    if (reviewNote === null || (status === "rejected" && !reviewNote.trim())) return;
    const { response, data: payload } = await fetchJson("/api/admin/workshop/project-operation", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: item.id, status, reviewNote }),
    });
    if (!response.ok) return showToast(payload.error || "推荐栏目审核失败");
    showToast(status === "approved" ? "推荐栏目申请已通过" : "推荐栏目申请已退回");
    await onRefresh();
  }

  async function replyReviewThread(thread: ReviewThread) {
    await fetchJson("/api/admin/workshop/review-thread", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: thread.id, action: "read" }),
    });
    const body = window.prompt(`回复“${thread.creatorName}”的审核沟通`, "");
    if (!body?.trim()) return;
    const { response, data: payload } = await fetchJson("/api/admin/workshop/review-thread", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: thread.id, body }),
    });
    if (!response.ok) return showToast(payload.error || "审核回复发送失败");
    showToast("审核回复已发送到新遇官通知");
    await onRefresh();
  }

  return (
    <>
      <section className="mini-metrics workshop-metrics">
        <article><span>体验点</span><strong>{data.metrics.venues}</strong><small>{admin.role === "super" ? "含快闪与合作空间" : "仅超管维护"}</small></article>
        <article><span>材料包</span><strong>{data.metrics.kits}</strong><small>{admin.role === "super" ? "自在货架" : "仅超管维护"}</small></article>
        <article><span>体验</span><strong>{data.metrics.projects}</strong><small>审核与前台展示分别管理</small></article>
        <article><span>教程 / 规范</span><strong>{data.kitGuides.length + data.venueRules.length}</strong><small>逐条维护并按顺序展示</small></article>
      </section>

      <section className="admin-section-block">
        <div className="admin-section-heading"><div><p className="eyebrow">CREATOR APPLICATIONS</p><h2>TDE新遇官申请</h2><p>保留邀请码来源、所属关系树和审核记录。</p></div></div>
        <div className="data-table-wrap"><table className="data-table"><thead><tr><th>申请人</th><th>城市</th><th>邀请码来源</th><th>状态</th><th>操作</th></tr></thead><tbody>{data.creatorApplications.map((item) => <tr key={item.creatorId}><td><strong>{item.brandName || "未命名新遇官"}</strong><span>{item.phone}</span></td><td>{item.city} {item.district}</td><td><strong>{item.registeredWithCode}</strong><span>{formatShanghaiDateTime(item.submittedAt)} · 第 {item.revision} 次</span></td><td>{applicationStatusLabel(item.status)}</td><td><button className="mini-row-action" type="button" onClick={() => setReviewingApplication(item)}>查看审核</button></td></tr>)}</tbody></table>{!data.creatorApplications.length ? <p className="empty-note">还没有TDE新遇官申请。</p> : null}</div>
      </section>

      <section className="admin-section-block">
        <div className="admin-section-heading"><div><p className="eyebrow">OPERATION TAG REVIEW</p><h2>首发尝鲜与限时限量审核</h2><p>申请与体验审核相互独立；今日上新由发布时间自动生成，好评精选只由超级管理员设置。</p></div><span>{data.operationRequests.filter((item) => item.status === "pending").length} 个待审核</span></div>
        <div className="data-table-wrap"><table className="data-table"><thead><tr><th>体验 / 新遇官</th><th>申请标签</th><th>申请资料</th><th>状态</th><th>操作</th></tr></thead><tbody>{data.operationRequests.map((item) => <tr key={item.id}><td><strong>{item.projectTitle}</strong><span>{item.creatorName}</span></td><td><strong>{item.requestType === "first_launch" ? "首发尝鲜" : "限时限量"}</strong><span>{formatShanghaiDateTime(item.createdAt)}</span></td><td><strong>{item.reason}</strong><span>{item.requestType === "limited" && item.endsAt ? `最多接待 ${item.maxPeople} 人 · 随项目可体验日期有效至 ${formatShanghaiDateTime(item.endsAt)}` : "通过后展示30天"}</span></td><td>{item.status === "pending" ? "待审核" : item.status === "approved" ? "已通过" : item.status === "rejected" ? "未通过" : item.status === "expired" ? "已到期" : "已撤回"}</td><td>{item.status === "pending" ? <><button className="mini-row-action" type="button" onClick={() => void reviewOperation(item, "approved")}>通过</button><button className="mini-row-action" type="button" onClick={() => void reviewOperation(item, "rejected")}>不通过</button></> : <span>{item.reviewNote || "已处理"}</span>}</td></tr>)}</tbody></table>{!data.operationRequests.length ? <p className="empty-note">还没有推荐栏目申请。</p> : null}</div>
      </section>

      <section className="admin-section-block">
        <div className="admin-section-heading"><div><p className="eyebrow">REVIEW CONVERSATIONS</p><h2>审核沟通</h2><p>统一承接新遇官申请、体验审核和推荐栏目审核中的补充说明。</p></div><span>{data.reviewThreads.reduce((total, item) => total + item.adminUnreadCount, 0)} 条未读</span></div>
        <div className="mini-consultations">{data.reviewThreads.map((thread) => <details key={thread.id} className={thread.adminUnreadCount ? "overdue" : ""}><summary><div><strong>{thread.subject}</strong><span>{thread.creatorName} · {formatShanghaiDateTime(thread.lastMessageAt)}</span></div><span>{thread.adminUnreadCount ? `${thread.adminUnreadCount} 条未读` : thread.status === "resolved" ? "已处理" : "沟通中"}</span></summary><div className="mini-message-history">{thread.messages?.map((message) => <p key={message.id}><strong>{message.senderType === "creator" ? "新遇官" : message.senderLabel || "TDE运营"}</strong><span>{message.body}</span><time>{formatShanghaiDateTime(message.createdAt)}</time></p>)}</div><button className="button secondary" type="button" onClick={() => void replyReviewThread(thread)}>回复新遇官</button></details>)}</div>
        {!data.reviewThreads.length ? <p className="empty-note">还没有审核沟通。</p> : null}
      </section>

      {admin.role === "super" ? (
        <>
          <section className="admin-section-block">
            <div className="admin-section-heading">
              <div><p className="eyebrow">SELF PLAY</p><h2>自在体验点与材料包</h2><p>体验点负责城市、商圈、地址和营业承接；材料包负责到店可玩的内容。</p></div>
              <div className="admin-heading-actions"><button className="button secondary" type="button" onClick={() => setEditing({ kind: "venue", item: null })}>新增体验点</button><button className="button primary" type="button" onClick={() => setEditing({ kind: "kit", item: null })}>新增材料包</button></div>
            </div>
            <div className="workshop-split">
              <div className="data-table-wrap">
                <table className="data-table">
                  <thead><tr><th>体验点</th><th>位置</th><th>状态</th><th>操作</th></tr></thead>
                  <tbody>{data.venues.map((venue) => {
                    const hours = data.venueHours.filter((item) => item.venueId === venue.id);
                    return (
                      <tr key={venue.id}><td><strong>{venue.name}</strong><span>{hours.length ? `${hours.length} 条营业时间` : venue.kind}</span></td><td><strong>{venue.city} {venue.businessArea}</strong><span>{venue.address}</span></td><td>{venue.status}</td><td><button className="mini-row-action" type="button" onClick={() => setEditing({ kind: "venueHour", item: null, venueId: venue.id })}><Plus size={15}/>营业</button><button className="mini-row-action" type="button" onClick={() => setEditing({ kind: "venue", item: venue })}><Pencil size={15}/>编辑</button></td></tr>
                    );
                  })}</tbody>
                </table>
                {!data.venues.length ? <p className="empty-note">还没有体验点。</p> : null}
              </div>
              <div className="data-table-wrap">
                <table className="data-table">
                  <thead><tr><th>材料包</th><th>价格 / 时长</th><th>状态</th><th>操作</th></tr></thead>
                  <tbody>{data.kits.map((kit) => {
                    const linked = data.venueKits.filter((item) => item.kitId === kit.id);
                    const guides = data.kitGuides.filter((item) => item.kitId === kit.id);
                    return (
                      <tr key={kit.id}><td><strong>{kit.title}</strong><span>{linked.length ? `${linked.length} 个体验点 · ${guides.length} 步教程` : `${guides.length} 步教程`}</span></td><td><strong>{(kit.priceCents / 100).toFixed(0)} 元</strong><span>{kit.durationMinutes || "-"} 分钟</span></td><td>{kit.status}</td><td><button className="mini-row-action" type="button" disabled={!data.venues.length} onClick={() => setEditing({ kind: "venueKit", item: null, kitId: kit.id, venueId: data.venues[0]?.id })}><Plus size={15}/>体验点</button><button className="mini-row-action" type="button" onClick={() => setEditing({ kind: "kit", item: kit })}><Pencil size={15}/>编辑</button></td></tr>
                    );
                  })}</tbody>
                </table>
                {!data.kits.length ? <p className="empty-note">还没有材料包。</p> : null}
              </div>
            </div>
          </section>

          <section className="admin-section-block">
            <div className="admin-section-heading">
              <div><p className="eyebrow">HOME OPERATION</p><h2>首页 Banner 与运营栏目</h2><p>栏目固定为限时限量、今日上新、首发尝鲜、好评精选。</p></div>
              <div className="admin-heading-actions"><button className="button secondary" type="button" onClick={() => setEditing({ kind: "banner", item: null })}>新增 Banner</button><button className="button primary" type="button" onClick={() => setEditing({ kind: "slot", item: null })}>新增栏目内容</button></div>
            </div>
            <div className="workshop-split">
              <div className="data-table-wrap">
                <table className="data-table"><thead><tr><th>Banner</th><th>链接</th><th>城市</th><th>操作</th></tr></thead><tbody>{data.homepageBanners.map((banner) => <tr key={banner.id}><td><strong>{banner.title || "未命名 Banner"}</strong><span>{banner.enabled ? "已启用" : "已关闭"}</span></td><td><strong>{banner.linkType}</strong><span>{banner.linkValue}</span></td><td>{banner.city || "全城"}</td><td><button className="mini-row-action" type="button" onClick={() => setEditing({ kind: "banner", item: banner })}><Pencil size={15}/>编辑</button></td></tr>)}</tbody></table>
                {!data.homepageBanners.length ? <p className="empty-note">还没有首页 Banner。</p> : null}
              </div>
              <div className="data-table-wrap">
                <table className="data-table"><thead><tr><th>栏目</th><th>内容</th><th>状态</th><th>操作</th></tr></thead><tbody>{data.homepageSlots.map((slot) => <tr key={slot.id}><td><strong>{slotLabel(slot.slotKey)}</strong><span>{slot.titleOverride || "使用内容标题"}</span></td><td><strong>{slot.contentType}</strong><span>ID {slot.contentId}</span></td><td>{slot.enabled ? slot.reviewStatus : "disabled"}</td><td><button className="mini-row-action" type="button" onClick={() => setEditing({ kind: "slot", item: slot })}><Pencil size={15}/>编辑</button></td></tr>)}</tbody></table>
                {!data.homepageSlots.length ? <p className="empty-note">还没有栏目内容。</p> : null}
              </div>
            </div>
          </section>
        </>
      ) : null}

      <section className="admin-section-block">
        <div className="admin-section-heading"><div><p className="eyebrow">SOLO CONTENT</p><h2>自在指南与店内规范</h2><p>超级管理员和子管理员均可逐条新增、排序和修改。</p></div></div>
        <div className="workshop-split">
          <div className="data-table-wrap"><table className="data-table"><thead><tr><th>教程步骤</th><th>材料包</th><th>操作</th></tr></thead><tbody>{data.kitGuides.map((guide) => <tr key={guide.id}><td><strong>{String(guide.stepOrder).padStart(2, "0")} · {guide.title}</strong><span>{guide.body}</span></td><td>{data.kits.find((kit) => kit.id === guide.kitId)?.title || "已下线材料包"}</td><td><button className="mini-row-action" type="button" onClick={() => setEditing({ kind: "kitGuide", item: guide, kitId: guide.kitId })}><Pencil size={15}/>编辑</button></td></tr>)}</tbody></table>{!data.kitGuides.length ? <p className="empty-note">还没有自助教程。</p> : null}<div className="admin-heading-actions">{data.kits.map((kit) => <button key={kit.id} className="mini-row-action" type="button" onClick={() => setEditing({ kind: "kitGuide", item: null, kitId: kit.id })}><Plus size={15}/>{kit.title}教程</button>)}</div></div>
          <div className="data-table-wrap"><table className="data-table"><thead><tr><th>店内规范</th><th>体验点</th><th>操作</th></tr></thead><tbody>{data.venueRules.map((rule) => <tr key={rule.id}><td><strong>{String(rule.stepOrder).padStart(2, "0")} · {rule.title}</strong><span>{rule.body}</span></td><td>{data.venues.find((venue) => venue.id === rule.venueId)?.name || "已下线体验点"}</td><td><button className="mini-row-action" type="button" onClick={() => setEditing({ kind: "venueRule", item: rule, venueId: rule.venueId })}><Pencil size={15}/>编辑</button></td></tr>)}</tbody></table>{!data.venueRules.length ? <p className="empty-note">还没有店内规范。</p> : null}<div className="admin-heading-actions">{data.venues.map((venue) => <button key={venue.id} className="mini-row-action" type="button" onClick={() => setEditing({ kind: "venueRule", item: null, venueId: venue.id })}><Plus size={15}/>{venue.name}规范</button>)}</div></div>
        </div>
      </section>

      <section className="admin-section-block">
        <div className="admin-section-heading">
          <div><p className="eyebrow">COMPANION PLAY</p><h2>体验</h2><p>前台以一句话体验优先展示，每位新遇官只展示一个体验。</p></div>
          <button className="button primary" type="button" disabled={!creators.length} onClick={() => setEditing({ kind: "project", item: null })}>新增体验</button>
        </div>
        <div className="data-table-wrap">
          <table className="data-table">
            <thead><tr><th>一句话体验</th><th>TDE新遇官</th><th>城市</th><th>状态</th><th>消费者联系</th><th>操作</th></tr></thead>
            <tbody>{data.projects.map((project) => (
              <tr key={project.id}>
                <td><strong>{project.oneLiner}</strong><span>{project.title || "未填体验名"}</span></td>
                <td><strong>{project.creatorName}</strong></td>
                <td><strong>{project.city} {project.district}</strong><span>{project.durationMinutes || "-"} 分钟</span></td>
                <td>{project.status}{project.selectedForDisplay ? " · 前台展示" : ""}</td>
                <td>{data.creatorApplications.some((application) => application.creatorId === project.creatorId && application.status === "active" && application.phonePublicAuthorized) ? <><strong>已开放</strong><span>注册手机号已公开</span></> : <><strong>未开放</strong><span>注册手机号未公开</span></>}</td>
                <td><button className="mini-row-action" type="button" onClick={() => setEditing({ kind: "projectSchedule", item: null, projectId: project.id })}><Plus size={15}/>日期</button><button className="mini-row-action" type="button" onClick={() => setEditing({ kind: "project", item: project })}><Pencil size={15}/>编辑</button></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
        {!data.projects.length ? <p className="empty-note">还没有体验。</p> : null}
      </section>

      {editing ? (
        <WorkshopEditorDialog
          editing={editing}
          admin={admin}
          creators={creators}
          tags={tags}
          locations={locations}
          data={data}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            showToast("工作坊配置已保存");
            await onRefresh();
          }}
        />
      ) : null}
      {reviewingApplication ? (
        <CreatorApplicationDialog
          application={reviewingApplication}
          onClose={() => setReviewingApplication(null)}
          onReview={(status, reviewNote) => reviewApplication(reviewingApplication.creatorId, status, reviewNote)}
          onRestore={() => restoreVisitor(reviewingApplication.creatorId)}
        />
      ) : null}
    </>
  );
}

function applicationStatusLabel(status: CreatorApplicationAdminItem["status"]) {
  return status === "pending" ? "待审核" : status === "needs_changes" ? "待补件" : status === "active" ? "已通过" : "未通过";
}

function CreatorApplicationDialog({
  application,
  onClose,
  onReview,
  onRestore,
}: {
  application: CreatorApplicationAdminItem;
  onClose: () => void;
  onReview: (status: "active" | "needs_changes" | "rejected", reviewNote: string) => Promise<boolean>;
  onRestore: () => Promise<boolean>;
}) {
  const [reviewNote, setReviewNote] = useState(application.reviewNote);
  const [saving, setSaving] = useState(false);
  const categories = ["我的身份", "我的作品", "我的客群", "我的风格", "现场体验", "DIY材料包"];

  async function review(status: "active" | "needs_changes" | "rejected") {
    if (status !== "active" && !reviewNote.trim()) return;
    setSaving(true);
    const saved = await onReview(status, reviewNote.trim());
    setSaving(false);
    if (saved) onClose();
  }

  async function restoreVisitor() {
    setSaving(true);
    const saved = await onRestore();
    setSaving(false);
    if (saved) onClose();
  }

  return (
    <div className="dialog-backdrop" onMouseDown={onClose}>
      <section className="creator-dossier creator-application-dialog" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
        <header><div><p className="eyebrow">CREATOR APPLICATION</p><h2>{application.brandName || "未命名新遇官"}</h2><span>{applicationStatusLabel(application.status)} · 第 {application.revision} 次提交</span></div><button type="button" onClick={onClose} aria-label="关闭"><X /></button></header>
        <div className="dossier-scroll">
          <section className="creator-application-summary">
            <div>{application.representativeImageUrl ? <Image src={application.representativeImageUrl} alt="申请代表图" fill sizes="180px" unoptimized /> : <ImagePlus size={28} />}</div>
            <dl>
              <div><dt>手机号</dt><dd>{application.phone}</dd></div>
              <div><dt>常驻地区</dt><dd>{application.province} {application.city} {application.district}</dd></div>
              <div><dt>注册邀请码</dt><dd>{application.registeredWithCode}</dd></div>
              <div><dt>直接邀请人</dt><dd>{application.invitedByName || "平台或子管理员"}</dd></div>
              <div><dt>所属子管理员</dt><dd>{application.managerName || "平台直属"}</dd></div>
              <div><dt>提交时间</dt><dd>{formatShanghaiDateTime(application.submittedAt)}</dd></div>
              <div><dt>品牌Logo</dt><dd>{application.logoImageUrl ? <a href={application.logoImageUrl} target="_blank" rel="noreferrer">查看Logo</a> : "未上传"}</dd></div>
              <div><dt>新遇官工作台</dt><dd>{application.workspaceEnabled ? "已开启" : "已恢复游客状态"}</dd></div>
            </dl>
          </section>
          <section><h3>完整介绍</h3><p>{application.intro || "未填写"}</p></section>
          <section><h3>六类新遇官标签</h3>{categories.map((category) => <div className="dossier-tags" key={category}><strong>{category}</strong><div>{application.tags.filter((tag) => tag.category === category).map((tag) => <span key={tag.id}>{tag.label}{tag.status === "pending" ? "（待复核）" : ""}</span>)}{application.customTags.filter((tag) => tag.category === category && !application.tags.some((selected) => selected.category === category && selected.label === tag.label)).map((tag) => <span key={`${tag.category}-${tag.label}`}>{tag.label}（待复核）</span>)}</div></div>)}</section>
          <section><h3>线下体验</h3><p>{application.opportunityTypes.join("、") || "未选择"}</p></section>
          <section><h3>已经安排的活动档期</h3>{application.noBookings ? <p>近期无其他活动安排（指TDE以外的活动）</p> : application.busyPeriods.length ? application.busyPeriods.map((period) => <p key={`${period.startDate}-${period.endDate}`}>{period.startDate}{period.endDate !== period.startDate ? ` 至 ${period.endDate}` : ""}{period.note ? ` · ${period.note}` : ""}</p>) : <p>未填写</p>}</section>
          <section className="application-review-field"><h3>审核意见</h3><textarea value={reviewNote} maxLength={300} rows={4} placeholder="补件或拒绝时必须填写" onChange={(event) => setReviewNote(event.target.value)} /></section>
        </div>
        <footer className="application-review-actions">{application.workspaceEnabled ? <button className="button secondary" type="button" disabled={saving} onClick={() => void restoreVisitor()}>恢复游客状态</button> : null}<button className="button secondary" type="button" disabled={saving || !reviewNote.trim()} onClick={() => void review("needs_changes")}>请补充</button><button className="button secondary" type="button" disabled={saving || !reviewNote.trim()} onClick={() => void review("rejected")}>不通过</button><button className="button primary" type="button" disabled={saving} onClick={() => void review("active")}>审核通过</button></footer>
      </section>
    </div>
  );
}

function slotLabel(key: HomepageSlot["slotKey"]) {
  return ({
    limited: "限时限量",
    new_today: "今日上新",
    first_launch: "首发尝鲜",
    featured: "好评精选",
  } as Record<HomepageSlot["slotKey"], string>)[key];
}

function WorkshopEditorDialog({
  editing,
  admin,
  creators,
  tags,
  locations,
  data,
  onClose,
  onSaved,
}: {
  editing:
    | { kind: "venue"; item: WorkshopVenue | null }
    | { kind: "venueHour"; item: VenueHour | null; venueId?: number }
    | { kind: "kit"; item: WorkshopKit | null }
    | { kind: "kitGuide"; item: KitGuide | null; kitId?: number }
    | { kind: "venueRule"; item: VenueRule | null; venueId?: number }
    | { kind: "venueKit"; item: VenueKit | null; venueId?: number; kitId?: number }
    | { kind: "project"; item: WorkshopProject | null }
    | { kind: "projectSchedule"; item: ProjectSchedule | null; projectId?: number }
    | { kind: "banner"; item: HomepageBanner | null }
    | { kind: "slot"; item: HomepageSlot | null };
  admin: AdminOverview["admin"];
  creators: CreatorProfile[];
  tags: Tag[];
  locations: LocationProvince[];
  data: WorkshopAdminData;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const firstCreator = creators[0];
  const [form, setForm] = useState<Record<string, string | number | boolean>>(() => initialWorkshopForm(editing, firstCreator));
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const province = locations.find((item) => item.name === form.province);
  const city = province?.cities.find((item) => item.name === form.city);
  const selectedProject = data.projects.find((item) => item.id === Number(form.projectId));
  const selectedLinkType = String(form.linkType || "none");
  const selectedSlotContentType = String(form.contentType || "project");
  const selectedProjectTagIds = String(form.tagIds || "").split(",").map(Number).filter(Boolean);
  const creatorApprovedTagIds = new Set(
    data.approvedProjectTagIdsByCreator?.[Number(form.creatorId)] || [],
  );
  const projectTagCategories = ["我的作品", "我的客群", "我的风格", "现场体验", "项目场景"];
  const editableProjectTags = tags.filter((tag) => {
    if (tag.status !== "active") return false;
    if (["我的作品", "我的客群", "我的风格", "现场体验"].includes(tag.category))
      return creatorApprovedTagIds.has(tag.id);
    if (tag.category === "项目场景") return true;
    return admin.role === "super" && tag.category === "平台运营" && tag.label === "好评精选";
  });
  const projectTagGroups = projectTagCategories.map((category) => ({
    category,
    label: category === "我的作品" ? "体验品类" : category === "我的客群" ? "适合人群" : category === "我的风格" ? "体验风格" : category === "现场体验" ? "体验形式" : "使用场景",
    tags: editableProjectTags.filter((tag) => tag.category === category),
  }));
  const dialogTitle = ({
    venue: editing.item ? "编辑体验点" : "新增体验点",
    venueHour: editing.item ? "编辑营业时间" : "新增营业时间",
    kit: editing.item ? "编辑材料包" : "新增材料包",
    kitGuide: editing.item ? "编辑教程步骤" : "新增教程步骤",
    venueRule: editing.item ? "编辑店内规范" : "新增店内规范",
    venueKit: editing.item ? "编辑可体验点" : "配置可体验点",
    project: editing.item ? "编辑体验" : "新增体验",
    projectSchedule: editing.item ? "编辑体验日期" : "新增体验日期",
    banner: editing.item ? "编辑首页 Banner" : "新增首页 Banner",
    slot: editing.item ? "编辑首页栏目内容" : "新增首页栏目内容",
  } as Record<typeof editing.kind, string>)[editing.kind];

  function field(key: string, value: string | number | boolean) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function chooseCreator(id: number) {
    const creator = creators.find((item) => item.id === id);
    if (!creator) return field("creatorId", id);
    setForm((current) => ({
      ...current,
      creatorId: id,
      province: current.province || creator.province,
      city: current.city || creator.city,
      district: current.district || creator.district,
      tagIds: "",
    }));
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    const endpoint = ({
      venue: "/api/admin/workshop/venue",
      venueHour: "/api/admin/workshop/venue-hour",
      kit: "/api/admin/workshop/kit",
      kitGuide: "/api/admin/workshop/kit-guide",
      venueRule: "/api/admin/workshop/venue-rule",
      venueKit: "/api/admin/workshop/venue-kit",
      project: "/api/admin/workshop/project",
      projectSchedule: "/api/admin/workshop/project-schedule",
      banner: "/api/admin/workshop/homepage-banner",
      slot: "/api/admin/workshop/homepage-slot",
    } as Record<typeof editing.kind, string>)[editing.kind];
    const editableProjectTagIds = new Set(editableProjectTags.map((tag) => tag.id));
    const projectTagIds = editing.kind === "project"
      ? [...new Set(selectedProjectTagIds.filter((id) => editableProjectTagIds.has(id)))]
      : [];
    const { response, data } = await fetchJson(endpoint, {
      method: editing.item ? "PATCH" : "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ...form,
        tagIds: editing.kind === "project" ? projectTagIds : form.tagIds,
      }),
    });
    setSaving(false);
    if (!response.ok) return setError(data.error || "保存失败");
    const savedId = Number(data.venue?.id || data.kit?.id || data.project?.id || data.banner?.id || form.id || 0);
    if (imageFile && imageUploadKind(editing.kind) && savedId) {
      const body = new FormData();
      body.append("kind", imageUploadKind(editing.kind)!);
      body.append("id", String(savedId));
      body.append("file", imageFile);
      const imageResponse = await fetch("/api/admin/workshop/image", { method: "POST", body });
      const imageData = await imageResponse.json().catch(() => ({}));
      if (!imageResponse.ok) return setError(imageData.error || "资料已保存，但图片上传失败");
    }
    await onSaved();
  }

  return (
    <div className="dialog-backdrop" onMouseDown={onClose}>
      <form className="admin-editor workshop-editor" onSubmit={save} onMouseDown={(event) => event.stopPropagation()}>
        <header><div><p className="eyebrow">WORKSHOP OPS</p><h2>{dialogTitle}</h2><p>{admin.role === "super" ? "超级管理员可维护全局运营资源。" : "子管理员只能维护自己范围内的体验。"}</p></div><button type="button" onClick={onClose} aria-label="关闭"><X /></button></header>
        <div className="editor-scroll">
          {editing.kind === "venue" ? (
            <>
              <WorkshopImageField url={editing.item?.coverUrl || null} label="体验点封面" file={imageFile} onChange={setImageFile}/>
              <div className="form-grid two"><label className="field"><span>体验点名称</span><input value={String(form.name)} maxLength={60} onChange={(event) => field("name", event.target.value)} required/></label><label className="field"><span>类型</span><select value={String(form.kind)} onChange={(event) => field("kind", event.target.value)}><option value="popup">快闪</option><option value="store">门店</option><option value="partner">合作空间</option><option value="event">活动点</option></select></label></div>
              <LocationFields form={form} province={province} city={city} locations={locations} field={field}/>
              <div className="form-grid two"><label className="field"><span>商圈关键词</span><input value={String(form.businessArea)} maxLength={40} onChange={(event) => field("businessArea", event.target.value)}/></label><label className="field"><span>状态</span><select value={String(form.status)} onChange={(event) => field("status", event.target.value)}><option value="draft">草稿</option><option value="published">已发布</option><option value="paused">已暂停</option><option value="archived">已归档</option></select></label></div>
              <label className="field"><span>详细地址</span><input value={String(form.address)} maxLength={120} onChange={(event) => field("address", event.target.value)}/></label>
              <label className="field"><span>路线指引</span><textarea rows={4} value={String(form.routeHint)} maxLength={200} onChange={(event) => field("routeHint", event.target.value)}/></label>
            </>
          ) : null}

          {editing.kind === "kit" ? (
            <>
              <WorkshopImageField url={editing.item?.coverUrl || null} label="材料包封面" file={imageFile} onChange={setImageFile}/>
              <div className="form-grid two"><label className="field"><span>材料包名称</span><input value={String(form.title)} maxLength={80} onChange={(event) => field("title", event.target.value)} required/></label><label className="field"><span>价格（分）</span><input type="number" min={0} value={Number(form.priceCents)} onChange={(event) => field("priceCents", Number(event.target.value))}/></label></div>
              <div className="form-grid two"><label className="field"><span>副标题</span><input value={String(form.subtitle)} maxLength={100} onChange={(event) => field("subtitle", event.target.value)}/></label><label className="field"><span>适龄</span><input value={String(form.ageRange)} maxLength={40} onChange={(event) => field("ageRange", event.target.value)}/></label></div>
              <div className="form-grid three"><label className="field"><span>时长分钟</span><input type="number" min={0} value={Number(form.durationMinutes)} onChange={(event) => field("durationMinutes", Number(event.target.value))}/></label><label className="field"><span>难度</span><select value={String(form.difficulty)} onChange={(event) => field("difficulty", event.target.value)}><option value="easy">简单</option><option value="medium">中等</option><option value="hard">较难</option></select></label><label className="field"><span>状态</span><select value={String(form.status)} onChange={(event) => field("status", event.target.value)}><option value="draft">草稿</option><option value="published">已发布</option><option value="paused">已暂停</option><option value="archived">已归档</option></select></label></div>
              <label className="field"><span>材料包说明</span><textarea rows={5} value={String(form.description)} maxLength={1000} onChange={(event) => field("description", event.target.value)}/></label>
              <label className="field"><span>安全提醒</span><textarea rows={3} value={String(form.safetyNotes)} maxLength={500} onChange={(event) => field("safetyNotes", event.target.value)}/></label>
              <section className="mini-activity-tags"><h3>体验分类与推荐栏目</h3><div>{tags.filter((tag) => tag.status === "active" && ["项目场景", "项目运营", ...(admin.role === "super" ? ["平台运营"] : [])].includes(tag.category)).map((tag) => <button type="button" key={tag.id} className={String(form.tagIds || "").split(",").map(Number).includes(tag.id) ? "selected" : ""} onClick={() => toggleIdList(form, field, "tagIds", tag.id)}>{tag.label}</button>)}</div></section>
            </>
          ) : null}

          {editing.kind === "kitGuide" ? (
            <>
              <div className="form-grid two"><WorkshopContentSelect label="材料包" value={Number(form.kitId)} type="kit" data={data} onChange={(value) => field("kitId", value)} required/><label className="field"><span>步骤顺序</span><input type="number" min={1} max={99} value={Number(form.stepOrder)} onChange={(event) => field("stepOrder", Number(event.target.value))} required/></label></div>
              <label className="field"><span>步骤标题</span><input value={String(form.title)} maxLength={60} onChange={(event) => field("title", event.target.value)} required/></label>
              <label className="field"><span>操作说明</span><textarea rows={5} value={String(form.body)} maxLength={600} onChange={(event) => field("body", event.target.value)} required/></label>
              <div className="form-grid two"><label className="field"><span>提醒级别</span><select value={String(form.safetyLevel)} onChange={(event) => field("safetyLevel", event.target.value)}><option value="normal">普通步骤</option><option value="notice">注意</option><option value="warning">安全提醒</option></select></label><label className="field"><span>视频链接（选填）</span><input value={String(form.videoUrl)} maxLength={500} onChange={(event) => field("videoUrl", event.target.value)}/></label></div>
              <p className="field-help">二维码直达路径：pages/kit-detail/kit-detail?scene=k{Number(form.kitId) || "材料包ID"}</p>
            </>
          ) : null}

          {editing.kind === "venueRule" ? (
            <>
              <div className="form-grid two"><WorkshopContentSelect label="体验点" value={Number(form.venueId)} type="venue" data={data} onChange={(value) => field("venueId", value)} required/><label className="field"><span>规范顺序</span><input type="number" min={1} max={99} value={Number(form.stepOrder)} onChange={(event) => field("stepOrder", Number(event.target.value))} required/></label></div>
              <label className="field"><span>规范标题</span><input value={String(form.title)} maxLength={60} onChange={(event) => field("title", event.target.value)} required/></label>
              <label className="field"><span>规范内容</span><textarea rows={5} value={String(form.body)} maxLength={600} onChange={(event) => field("body", event.target.value)} required/></label>
              <label className="field"><span>补充链接（选填）</span><input value={String(form.linkUrl)} maxLength={500} onChange={(event) => field("linkUrl", event.target.value)}/></label>
            </>
          ) : null}

              {editing.kind === "venueHour" ? (
            <>
              <div className="form-grid two"><WorkshopContentSelect label="体验点" value={Number(form.venueId)} type="venue" data={data} onChange={(value) => field("venueId", value)} required/><label className="field"><span>类型</span><select value={String(form.dateOverride ? "date" : "weekday")} onChange={(event) => { if (event.target.value === "date") field("dateOverride", new Date().toISOString().slice(0, 10)); else field("dateOverride", ""); }}><option value="weekday">按星期</option><option value="date">指定日期</option></select></label></div>
              {form.dateOverride ? <label className="field"><span>指定日期</span><input type="date" value={String(form.dateOverride)} onChange={(event) => field("dateOverride", event.target.value)}/></label> : <label className="field"><span>星期</span><select value={Number(form.weekday)} onChange={(event) => field("weekday", Number(event.target.value))}>{["周日", "周一", "周二", "周三", "周四", "周五", "周六"].map((label, index) => <option key={label} value={index}>{label}</option>)}</select></label>}
              <div className="form-grid two"><label className="field"><span>开始营业</span><input type="time" value={String(form.openTime)} disabled={Boolean(form.closed)} onChange={(event) => field("openTime", event.target.value)}/></label><label className="field"><span>结束营业</span><input type="time" value={String(form.closeTime)} disabled={Boolean(form.closed)} onChange={(event) => field("closeTime", event.target.value)}/></label></div>
              <label className="agreement"><input type="checkbox" checked={Boolean(form.closed)} onChange={(event) => field("closed", event.target.checked)}/><span>当天不营业</span></label>
              <label className="field"><span>备注</span><input value={String(form.note)} maxLength={120} onChange={(event) => field("note", event.target.value)}/></label>
            </>
          ) : null}

          {editing.kind === "venueKit" ? (
            <>
              <div className="form-grid two"><WorkshopContentSelect label="体验点" value={Number(form.venueId)} type="venue" data={data} onChange={(value) => field("venueId", value)} required/><WorkshopContentSelect label="材料包" value={Number(form.kitId)} type="kit" data={data} onChange={(value) => field("kitId", value)} required/></div>
              <label className="agreement"><input type="checkbox" checked={Boolean(form.available)} onChange={(event) => field("available", event.target.checked)}/><span>顾客可在这个体验点选择该材料包</span></label>
            </>
          ) : null}

          {editing.kind === "project" ? (
            <>
              <WorkshopImageField url={editing.item?.coverUrl || null} label="体验项目封面" file={imageFile} onChange={setImageFile}/>
              <label className="field"><span>所属TDE新遇官</span><select value={Number(form.creatorId)} disabled={Boolean(editing.item)} onChange={(event) => chooseCreator(Number(event.target.value))}>{creators.map((creator) => <option key={creator.id} value={creator.id}>{creator.brandName || creator.phone} · {creator.city}</option>)}</select></label>
              <label className="field"><span>一句话体验</span><input value={String(form.oneLiner)} maxLength={80} onChange={(event) => field("oneLiner", event.target.value)} required placeholder="例如：一起拍一组像电影剧照的周末照片"/></label>
              <div className="form-grid two"><label className="field"><span>体验名称</span><input value={String(form.title)} maxLength={80} onChange={(event) => field("title", event.target.value)}/></label><label className="field"><span>状态</span><select value={String(form.status)} onChange={(event) => field("status", event.target.value)}>{admin.role === "super" ? <><option value="draft">草稿</option><option value="pending">待审核</option><option value="published">已发布</option><option value="paused">已暂停</option><option value="archived">已归档</option><option value="rejected">未通过</option></> : <><option value="pending">提交平台审核</option><option value="archived">归档</option></>}</select></label></div>
              <label className="agreement"><input type="checkbox" checked={Boolean(form.selectedForDisplay)} onChange={(event) => field("selectedForDisplay", event.target.checked)}/><span>作为该TDE新遇官唯一的前台展示体验</span></label>
              <label className="field"><span>可体验日期</span><input type="date" value={String(form.startDate)} onChange={(event) => { field("startDate", event.target.value); field("endDate", event.target.value); }}/><small>新建时先填写一个日期；保存后可在体验列表中逐条增加更多精确日期。</small></label>
              {editing.item?.schedules.length ? <p className="field-help">已设置 {editing.item.schedules.filter((item) => item.status === "open").length} 个可体验日期：{editing.item.schedules.filter((item) => item.status === "open").map((item) => item.availableDate).join("、")}</p> : null}
              <LocationFields form={form} province={province} city={city} locations={locations} field={field}/>
              <div className="form-grid two"><label className="field"><span>最少人数</span><input type="number" min={1} value={Number(form.minPeople)} onChange={(event) => field("minPeople", Number(event.target.value))}/></label><label className="field"><span>最多人数</span><input type="number" min={1} value={Number(form.maxPeople)} onChange={(event) => field("maxPeople", Number(event.target.value))}/></label></div>
              <div className="form-grid two"><label className="field"><span>时长分钟</span><input type="number" min={0} value={Number(form.durationMinutes)} onChange={(event) => field("durationMinutes", Number(event.target.value))}/></label><label className="field"><span>价格（分）</span><input type="number" min={0} value={Number(form.priceCents)} onChange={(event) => field("priceCents", Number(event.target.value))}/></label></div>
              <div className="form-grid two"><label className="field"><span>适合年龄</span><input value={String(form.ageRange)} maxLength={40} onChange={(event) => field("ageRange", event.target.value)} placeholder="例如：8岁以上"/></label><label className="field"><span>体验难度</span><select value={String(form.difficulty)} onChange={(event) => field("difficulty", event.target.value)}><option value="easy">零基础友好</option><option value="medium">需要一点经验</option><option value="hard">进阶体验</option></select></label></div>
              <label className="field"><span>地点提示</span><input value={String(form.addressHint)} maxLength={120} onChange={(event) => field("addressHint", event.target.value)}/></label>
              <label className="field"><span>体验详情（不超过2000字）</span><textarea rows={7} value={String(form.description)} maxLength={2000} onChange={(event) => field("description", event.target.value)}/></label>
              <label className="field"><span>安全提醒</span><textarea rows={3} value={String(form.safetyNotes)} maxLength={500} onChange={(event) => field("safetyNotes", event.target.value)} placeholder="材料、工具、过敏或儿童陪同要求"/></label>
              <section className="mini-activity-tags"><h3>体验发现标签</h3><p className="field-help">体验所选的品类、适合人群、体验风格和体验形式都会参与前台筛选；只可使用该新遇官已经审核通过的标签。</p>{projectTagGroups.map((group) => <div key={group.category} className="mini-project-tag-group"><strong>{group.label}</strong><div>{group.tags.map((tag) => <button type="button" key={tag.id} className={selectedProjectTagIds.includes(tag.id) ? "selected" : ""} onClick={() => toggleIdList(form, field, "tagIds", tag.id)}>{tag.label}</button>)}</div>{!group.tags.length ? <span>该新遇官暂无可用标签</span> : null}</div>)}</section>
              {admin.role === "super" ? <section className="mini-activity-tags"><h3>平台精选</h3><p className="field-help">首发尝鲜和限时限量必须走新遇官申请；今日上新由发布时间自动生成。</p><div>{editableProjectTags.filter((tag) => tag.category === "平台运营").map((tag) => <button type="button" key={tag.id} className={selectedProjectTagIds.includes(tag.id) ? "selected" : ""} onClick={() => toggleIdList(form, field, "tagIds", tag.id)}>{tag.label}</button>)}</div></section> : null}
              {admin.role === "super" ? <label className="field"><span>审核意见</span><textarea rows={3} value={String(form.reviewNote)} maxLength={300} onChange={(event) => field("reviewNote", event.target.value)} placeholder="未通过或需要补充资料时填写，新遇官可在审核沟通中看到"/></label> : null}
            </>
          ) : null}

          {editing.kind === "projectSchedule" ? (
            <>
              <WorkshopContentSelect label="体验" value={Number(form.projectId)} type="project" data={data} onChange={(value) => field("projectId", value)} required/>
              {selectedProject ? <p className="field-help">当前体验：{selectedProject.creatorName} · {selectedProject.city} {selectedProject.district}</p> : null}
              <div className="form-grid two"><label className="field"><span>体验日期</span><input type="date" value={String(form.availableDate)} onChange={(event) => field("availableDate", event.target.value)} required/></label><label className="field"><span>状态</span><select value={String(form.status)} onChange={(event) => field("status", event.target.value)}><option value="open">展示</option><option value="closed">关闭</option></select></label></div>
              <div className="form-grid two"><label className="field"><span>开始时间</span><input type="time" value={String(form.startTime)} onChange={(event) => field("startTime", event.target.value)}/></label><label className="field"><span>结束时间</span><input type="time" value={String(form.endTime)} onChange={(event) => field("endTime", event.target.value)}/></label></div>
              <label className="field"><span>备注</span><input value={String(form.note)} maxLength={120} onChange={(event) => field("note", event.target.value)}/></label>
            </>
          ) : null}

          {editing.kind === "banner" ? (
            <>
              <WorkshopImageField url={editing.item?.imageUrl || null} label="Banner 图片" file={imageFile} onChange={setImageFile}/>
              <div className="form-grid two"><label className="field"><span>Banner 标题</span><input value={String(form.title)} maxLength={80} onChange={(event) => field("title", event.target.value)}/></label><label className="field"><span>城市</span><input value={String(form.city)} maxLength={30} onChange={(event) => field("city", event.target.value)} placeholder="留空为全城"/></label></div>
              <label className="field"><span>副标题</span><input value={String(form.subtitle)} maxLength={120} onChange={(event) => field("subtitle", event.target.value)}/></label>
              <div className="form-grid two"><label className="field"><span>链接类型</span><select value={selectedLinkType} onChange={(event) => { field("linkType", event.target.value); field("linkValue", ""); }}><option value="none">无</option><option value="kit">材料包</option><option value="venue">体验点</option><option value="project">体验</option><option value="topic">专题</option><option value="url">链接</option></select></label>{selectedLinkType === "kit" || selectedLinkType === "venue" || selectedLinkType === "project" ? <WorkshopContentSelect label="链接内容" value={Number(form.linkValue)} type={selectedLinkType as "kit" | "venue" | "project"} data={data} onChange={(value) => field("linkValue", String(value))}/> : selectedLinkType === "topic" ? <label className="field"><span>专题关键词</span><input value={String(form.linkValue)} maxLength={40} onChange={(event) => field("linkValue", event.target.value)} placeholder="如：带孩子玩"/></label> : selectedLinkType === "url" ? <label className="field"><span>外部链接</span><input value={String(form.linkValue)} maxLength={240} onChange={(event) => field("linkValue", event.target.value)}/></label> : <p className="field-help">不设置跳转。</p>}</div>
              <label className="agreement"><input type="checkbox" checked={Boolean(form.enabled)} onChange={(event) => field("enabled", event.target.checked)}/><span>启用 Banner</span></label>
            </>
          ) : null}

          {editing.kind === "slot" ? (
            <>
              <div className="form-grid two"><label className="field"><span>栏目</span><select value={String(form.slotKey)} onChange={(event) => field("slotKey", event.target.value)}><option value="limited">限时限量</option><option value="new_today">今日上新</option><option value="first_launch">首发尝鲜</option><option value="featured">好评精选</option></select></label><label className="field"><span>内容类型</span><select value={selectedSlotContentType} onChange={(event) => { field("contentType", event.target.value); field("contentId", 0); }}><option value="project">体验</option><option value="kit">材料包</option><option value="venue">体验点</option><option value="topic">专题</option></select></label></div>
              <div className="form-grid two">{selectedSlotContentType === "topic" ? <label className="field"><span>专题关键词</span><input value={String(form.titleOverride)} maxLength={80} onChange={(event) => field("titleOverride", event.target.value)} placeholder="如：带孩子玩"/></label> : <WorkshopContentSelect label="栏目内容" value={Number(form.contentId)} type={selectedSlotContentType as "kit" | "venue" | "project"} data={data} onChange={(value) => field("contentId", value)}/>}<label className="field"><span>审核状态</span><select value={String(form.reviewStatus)} onChange={(event) => field("reviewStatus", event.target.value)}><option value="approved">已通过</option><option value="pending">待审核</option><option value="rejected">未通过</option></select></label></div>
              <label className="field"><span>展示标题覆盖</span><input value={String(form.titleOverride)} maxLength={80} onChange={(event) => field("titleOverride", event.target.value)}/></label>
              <label className="agreement"><input type="checkbox" checked={Boolean(form.enabled)} onChange={(event) => field("enabled", event.target.checked)}/><span>启用栏目内容</span></label>
            </>
          ) : null}

          {error ? <p className="form-error">{error}</p> : null}
        </div>
        <footer><button className="button secondary" type="button" onClick={onClose}>取消</button><button className="button primary" disabled={saving}>{saving ? "保存中" : "保存"}</button></footer>
      </form>
    </div>
  );
}

function LocationFields({
  form,
  province,
  city,
  locations,
  field,
}: {
  form: Record<string, string | number | boolean>;
  province?: LocationProvince;
  city?: LocationProvince["cities"][number];
  locations: LocationProvince[];
  field: (key: string, value: string | number | boolean) => void;
}) {
  return (
    <div className="form-grid three">
      <label className="field"><span>省份</span><select value={String(form.province)} onChange={(event) => { field("province", event.target.value); field("city", ""); field("district", ""); }}><option value="">请选择省份</option>{locations.map((item) => <option key={item.code}>{item.name}</option>)}</select></label>
      <label className="field"><span>城市</span><select value={String(form.city)} disabled={!province} onChange={(event) => { field("city", event.target.value); field("district", ""); }}><option value="">请选择城市</option>{province?.cities.map((item) => <option key={item.code}>{item.name}</option>)}</select></label>
      <label className="field"><span>区</span><select value={String(form.district)} disabled={!city} onChange={(event) => field("district", event.target.value)}><option value="">请选择区</option>{city?.districts?.map((item) => <option key={item.code}>{item.name}</option>)}</select></label>
    </div>
  );
}

function WorkshopContentSelect({
  label,
  value,
  type,
  data,
  onChange,
  required = false,
}: {
  label: string;
  value: number;
  type: "venue" | "kit" | "project";
  data: WorkshopAdminData;
  onChange: (value: number) => void;
  required?: boolean;
}) {
  const options = type === "venue"
    ? data.venues.map((item) => ({ id: item.id, label: `${item.name} · ${item.city}${item.businessArea ? ` ${item.businessArea}` : ""}` }))
    : type === "kit"
      ? data.kits.map((item) => ({ id: item.id, label: `${item.title}${item.subtitle ? ` · ${item.subtitle}` : ""}` }))
      : data.projects.map((item) => ({ id: item.id, label: `${item.oneLiner} · ${item.creatorName}` }));
  return (
    <label className="field">
      <span>{label}</span>
      <select value={value || ""} required={required} onChange={(event) => onChange(Number(event.target.value || 0))}>
        <option value="">请选择{label}</option>
        {options.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
      </select>
    </label>
  );
}

function WorkshopImageField({
  url,
  label,
  file,
  onChange,
}: {
  url: string | null;
  label: string;
  file: File | null;
  onChange: (file: File | null) => void;
}) {
  return (
    <section className="mini-activity-image-editor workshop-image-editor">
      <div>{url ? <Image src={url} alt={label} fill sizes="150px" unoptimized /> : <ImagePlus size={24} />}</div>
      <label className="button secondary"><ImagePlus size={17}/>{file ? file.name : url ? `更换${label}` : `上传${label}`}<input type="file" accept=".jpg,.jpeg,.png,.webp" onChange={(event) => { const selected = event.target.files?.[0] || null; onChange(selected); }}/></label>
    </section>
  );
}

function imageUploadKind(kind: string) {
  return ({
    venue: "venue",
    kit: "kit",
    project: "project",
    banner: "banner",
  } as Record<string, "venue" | "kit" | "project" | "banner" | undefined>)[kind];
}

function initialWorkshopForm(
  editing:
    | { kind: "venue"; item: WorkshopVenue | null }
    | { kind: "venueHour"; item: VenueHour | null; venueId?: number }
    | { kind: "kit"; item: WorkshopKit | null }
    | { kind: "kitGuide"; item: KitGuide | null; kitId?: number }
    | { kind: "venueRule"; item: VenueRule | null; venueId?: number }
    | { kind: "venueKit"; item: VenueKit | null; venueId?: number; kitId?: number }
    | { kind: "project"; item: WorkshopProject | null }
    | { kind: "projectSchedule"; item: ProjectSchedule | null; projectId?: number }
    | { kind: "banner"; item: HomepageBanner | null }
    | { kind: "slot"; item: HomepageSlot | null },
  creator?: CreatorProfile,
): Record<string, string | number | boolean> {
  if (editing.kind === "venue") {
    const item = editing.item;
    return {
    id: item?.id || 0,
    name: item?.name || "",
    kind: item?.kind || "popup",
    province: item?.province || "",
    city: item?.city || "",
    district: item?.district || "",
    businessArea: item?.businessArea || "",
    address: item?.address || "",
    routeHint: item?.routeHint || "",
    status: item?.status || "published",
  };
  }
  if (editing.kind === "kit") {
    const item = editing.item;
    return {
    id: item?.id || 0,
    title: item?.title || "",
    subtitle: item?.subtitle || "",
    description: item?.description || "",
    priceCents: item?.priceCents || 0,
    ageRange: item?.ageRange || "",
    durationMinutes: item?.durationMinutes || 60,
    difficulty: item?.difficulty || "easy",
    safetyNotes: item?.safetyNotes || "",
    tagIds: item?.tags.map((tag) => tag.id).join(",") || "",
    status: item?.status || "published",
  };
  }
  if (editing.kind === "kitGuide") {
    const item = editing.item;
    return {
      id: item?.id || 0,
      kitId: item?.kitId || editing.kitId || 0,
      stepOrder: item?.stepOrder || 1,
      title: item?.title || "",
      body: item?.body || "",
      videoUrl: item?.videoUrl || "",
      safetyLevel: item?.safetyLevel || "normal",
    };
  }
  if (editing.kind === "venueRule") {
    const item = editing.item;
    return {
      id: item?.id || 0,
      venueId: item?.venueId || editing.venueId || 0,
      stepOrder: item?.stepOrder || 1,
      title: item?.title || "",
      body: item?.body || "",
      linkUrl: item?.linkUrl || "",
    };
  }
  if (editing.kind === "venueHour") {
    const item = editing.item;
    return {
      id: item?.id || 0,
      venueId: item?.venueId || editing.venueId || 0,
      weekday: item?.weekday ?? 1,
      dateOverride: item?.dateOverride || "",
      openTime: item?.openTime || "10:00",
      closeTime: item?.closeTime || "21:00",
      closed: item?.closed ?? false,
      note: item?.note || "",
    };
  }
  if (editing.kind === "venueKit") {
    const item = editing.item;
    return {
      venueId: item?.venueId || editing.venueId || 0,
      kitId: item?.kitId || editing.kitId || 0,
      available: item?.available ?? true,
    };
  }
  if (editing.kind === "project") {
    const item = editing.item;
    return {
    id: item?.id || 0,
    creatorId: item?.creatorId || creator?.id || 0,
    oneLiner: item?.oneLiner || "",
    title: item?.title || "",
    description: item?.description || "",
    province: item?.province || creator?.province || "",
    city: item?.city || creator?.city || "",
    district: item?.district || creator?.district || "",
    addressHint: item?.addressHint || "",
    startDate: item?.startDate || "",
    endDate: item?.endDate || "",
    noPlan: item?.noPlan ?? false,
    minPeople: item?.minPeople || 1,
    maxPeople: item?.maxPeople || 4,
    priceCents: item?.priceCents || 0,
    durationMinutes: item?.durationMinutes || 90,
    ageRange: item?.ageRange || "",
    difficulty: item?.difficulty || "easy",
    safetyNotes: item?.safetyNotes || "",
    selectedForDisplay: item?.selectedForDisplay ?? true,
    status: item?.status || "pending",
    reviewNote: item?.reviewNote || "",
    tagIds: item?.tags.map((tag) => tag.id).join(",") || "",
  };
  }
  if (editing.kind === "projectSchedule") {
    const item = editing.item;
    return {
      id: item?.id || 0,
      projectId: item?.projectId || editing.projectId || 0,
      availableDate: item?.availableDate || new Date().toISOString().slice(0, 10),
      startTime: item?.startTime || "14:00",
      endTime: item?.endTime || "16:00",
      status: item?.status || "open",
      note: item?.note || "",
    };
  }
  if (editing.kind === "banner") {
    const item = editing.item;
    return {
    id: item?.id || 0,
    title: item?.title || "",
    subtitle: item?.subtitle || "",
    linkType: item?.linkType || "none",
    linkValue: item?.linkValue || "",
    city: item?.city || "",
    enabled: item?.enabled ?? true,
  };
  }
  const item = editing.item;
  return {
    id: item?.id || 0,
    slotKey: item?.slotKey || "new_today",
    contentType: item?.contentType || "project",
    contentId: item?.contentId || 0,
    titleOverride: item?.titleOverride || "",
    reviewStatus: item?.reviewStatus || "approved",
    enabled: item?.enabled ?? true,
  };
}

function toggleIdList(
  form: Record<string, string | number | boolean>,
  field: (key: string, value: string | number | boolean) => void,
  key: string,
  id: number,
) {
  const values = String(form[key] || "").split(",").map(Number).filter(Boolean);
  const next = values.includes(id) ? values.filter((item) => item !== id) : [...values, id];
  field(key, next.join(","));
}

function MiniCreatorLimitRow({
  creator,
  defaultActivityLimit,
  defaultReplyTimeout,
  onSave,
}: {
  creator: CreatorProfile;
  defaultActivityLimit: number;
  defaultReplyTimeout: number;
  onSave: (creator: CreatorProfile, activityLimit: string, replyTimeout: string) => void;
}) {
  const [activityLimit, setActivityLimit] = useState(
    creator.activityLimit === null ? "" : String(creator.activityLimit),
  );
  const [replyTimeout, setReplyTimeout] = useState(
    creator.replyTimeoutMinutes === null ? "" : String(creator.replyTimeoutMinutes),
  );
  return (
    <article>
      <div><strong>{creator.brandName || creator.phone}</strong><span>{creator.city} {creator.district} · {creator.phone}</span></div>
      <label><span>活动上限</span><input type="number" min={1} max={20} value={activityLimit} placeholder={String(defaultActivityLimit)} onChange={(event) => setActivityLimit(event.target.value)}/></label>
      <label><span>回复分钟</span><input type="number" min={10} max={10080} value={replyTimeout} placeholder={String(defaultReplyTimeout)} onChange={(event) => setReplyTimeout(event.target.value)}/></label>
      <button type="button" onClick={() => onSave(creator, activityLimit, replyTimeout)}>保存</button>
    </article>
  );
}
