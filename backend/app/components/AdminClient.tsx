"use client";

import {
  Bell,
  BookOpenText,
  Bot,
  CalendarDays,
  ChartNoAxesColumn,
  Check,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Download,
  Image as ImageIcon,
  ImagePlus,
  KeyRound,
  LayoutDashboard,
  LoaderCircle,
  LogOut,
  MapPin,
  Menu,
  MessageSquareText,
  Palette,
  Plus,
  Search,
  Trash2,
  Smartphone,
  Tags,
  TrendingUp,
  UserCog,
  Network,
  Users,
  X,
} from "lucide-react";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import type {
  AdminOverview,
  AdminAccount,
  CopyGenerationStage,
  CopyMode,
  CreatorProfile,
  CreatorRating,
  PlatformNotification,
  PlatformSettings,
  RedbookAlgorithmSettings,
  Tag,
  TrendSettings,
  TrendTerm,
} from "../../lib/types";
import { allowedContentIcons } from "../../lib/platform-settings";
import { tagCategoryNames, cooperationTypes, precisionInviteGoals, precisionInviteScenes } from "../../lib/catalog";
import { formatShanghaiDateTime, parseDatabaseDate } from "../../lib/datetime";
import { fetchJson } from "./client-request";
import { saveBlobWithPicker } from "../../lib/download";
import { QrCodeDownloadDialog } from "./QrCodeDownloadDialog";
import { WorkImageCropDialog } from "./StudioClient";
import { MiniProgramAdminView } from "./MiniProgramAdminView";
import { CreatorVisualization } from "./CreatorVisualization";
import { CustomSelect } from "./CustomSelect";
import { VizManagement } from "./VizManagement";
import { DesignPlannerClient } from "./DesignPlannerClient";
import { QIDENG_COLORS } from "../design-system-values";

type AdminSection = "overview" | "resources" | "creators" | "mini" | "admins" | "tags" | "invites" | "messages" | "writer" | "redbook" | "trends" | "viz" | "events" | "venue" | "design";
type LocationProvince = { code: string; name: string; cities: Array<{ code: string; name: string; districts?: Array<{ code: string; name: string }> }> };
type CreatorImageSlotKey = "representative" | "logo" | "product" | "booth" | "history";
type CreatorImageSlot = {
  key: CreatorImageSlotKey;
  label: string;
  hint: string;
  field: "representativeImageKey" | "logoImageKey" | "productImageKey" | "boothImageKey" | "historyImageKey";
  getUrl: (creator: CreatorProfile) => string | null;
};

const creatorImageSlots: CreatorImageSlot[] = [
  {
    key: "representative",
    label: "代表图",
    hint: "主理人端和公开主页默认展示图",
    field: "representativeImageKey",
    getUrl: (creator) => creator.representativeImageUrl || creator.workUrls[0] || null,
  },
  {
    key: "logo",
    label: "Logo",
    hint: "品牌标识",
    field: "logoImageKey",
    getUrl: (creator) => creator.logoUrl || null,
  },
  {
    key: "product",
    label: "产品图",
    hint: "主打产品或作品图",
    field: "productImageKey",
    getUrl: (creator) => creator.productImageUrl || null,
  },
  {
    key: "booth",
    label: "展位图",
    hint: "摊位、空间或展陈图",
    field: "boothImageKey",
    getUrl: (creator) => creator.boothImageUrl || null,
  },
  {
    key: "history",
    label: "历史活动图",
    hint: "过往活动、现场照片或记录图",
    field: "historyImageKey",
    getUrl: (creator) => creator.historyImageUrl || null,
  },
];

const nav: Array<{ key: AdminSection; label: string; icon: React.ReactNode; superOnly?: boolean }> = [
  { key: "overview", label: "运营概览", icon: <LayoutDashboard size={19} />, superOnly: true },
  { key: "resources", label: "用户资源看板", icon: <ChartNoAxesColumn size={19} />, superOnly: true },
  { key: "creators", label: "用户管理", icon: <Users size={19} /> },
  { key: "events", label: "活动管理", icon: <CalendarDays size={19} /> },
  { key: "design", label: "设计策划", icon: <Palette size={19} /> },
  { key: "venue", label: "场地方管理", icon: <MapPin size={19} /> },
  { key: "mini", label: "小程序运营", icon: <Smartphone size={19} /> },
  { key: "viz", label: "可视化管理", icon: <ImageIcon size={19} />, superOnly: true },
  { key: "admins", label: "子管理员与关系", icon: <UserCog size={19} />, superOnly: true },
  { key: "tags", label: "标签与复核", icon: <Tags size={19} />, superOnly: true },
  { key: "invites", label: "邀请码管理", icon: <KeyRound size={19} />, superOnly: true },
  { key: "messages", label: "平台通知", icon: <MessageSquareText size={19} /> },
  { key: "writer", label: "文章生成管理", icon: <Bot size={19} />, superOnly: true },
  { key: "redbook", label: "红薯算法", icon: <BookOpenText size={19} />, superOnly: true },
  { key: "trends", label: "趋势词库", icon: <TrendingUp size={19} />, superOnly: true },
];

export function AdminClient() {
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [locations, setLocations] = useState<LocationProvince[]>([]);
  const [section, setSection] = useState<AdminSection>("overview");
  const [loading, setLoading] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [showPasswordDialog, setShowPasswordDialog] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [{ response, data }, places] = await Promise.all([
        fetchJson("/api/admin/overview", { cache: "no-store" }),
        fetch("/api/public/locations").then((response) => response.json()),
      ]);
      if (response.status === 401) {
        window.location.replace("/admin/login");
        return;
      }
      if (!response.ok) throw new Error(data.error || "运营台加载失败");
      setOverview(data as AdminOverview);
      if ((data as AdminOverview).admin.role === "subadmin") setSection("creators");
      setLocations(places.provinces || []);
      setError("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "运营台加载失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function showToast(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(""), 2500);
  }

  async function logout() {
    await fetch("/api/admin/logout", { method: "POST" });
    window.location.replace("/admin/login");
  }

  if (loading && !overview) return <main className="admin-loading"><LoaderCircle className="spin" /><p>正在读取运营数据</p></main>;
  if (error || !overview) return <main className="admin-loading"><p>{error || "运营台暂时无法打开"}</p><button className="button secondary" onClick={load}>重新加载</button></main>;

  const visibleNav = nav.filter((item) => !item.superOnly || overview.admin.role === "super");
  const currentLabel = visibleNav.find((item) => item.key === section)?.label || "用户管理";
  return (
    <main className="admin-page">
      <aside className={menuOpen ? "admin-sidebar open" : "admin-sidebar"}>
        <header><div className="admin-brand-lockup"><strong>TDE</strong><small>COCOC</small></div><div><strong>运营台</strong><span>CURATED CONTROL</span></div><button type="button" onClick={() => setMenuOpen(false)} aria-label="关闭菜单"><X /></button></header>
        <nav>{visibleNav.map((item) => <button key={item.key} className={section === item.key ? "active" : ""} type="button" onClick={() => { setSection(item.key); setMenuOpen(false); }}>{item.icon}<span>{item.label}</span>{item.key === "tags" && overview.metrics.pendingTags ? <i>{overview.metrics.pendingTags}</i> : null}</button>)}</nav>
        <div className="admin-sidebar-actions">{overview.admin.role === "subadmin" ? <button className="admin-logout" type="button" onClick={() => setShowPasswordDialog(true)}><KeyRound size={18} />修改密码</button> : null}<button className="admin-logout" type="button" onClick={logout}><LogOut size={18} />退出运营台</button></div>
      </aside>
      {menuOpen ? <button className="admin-menu-backdrop" type="button" onClick={() => setMenuOpen(false)} aria-label="关闭菜单" /> : null}
      {showPasswordDialog ? <ChangePasswordDialog onClose={() => setShowPasswordDialog(false)} showToast={showToast} /> : null}
      <section className="admin-main">
        <header className="admin-topbar"><button type="button" className="admin-menu-button" onClick={() => setMenuOpen(true)} aria-label="打开菜单"><Menu /></button><div><span>TDE</span><h1>{currentLabel}</h1></div><button className="icon-button" type="button" onClick={load} aria-label="刷新数据"><LoaderCircle size={18} className={loading ? "spin" : ""} /></button></header>
        <div className="admin-content">
          {section === "overview" ? <OverviewView overview={overview} onNavigate={setSection} /> : null}
          {section === "resources" && overview.admin.role === "super" ? <ResourceDashboard overview={overview} locations={locations} showToast={showToast} onNavigate={setSection} /> : null}
          {section === "creators" ? <CreatorSearchView overview={overview} locations={locations} notifications={overview.notifications} showToast={showToast} onRefresh={load} /> : null}
          {section === "events" ? <EventsView showToast={showToast} onRefresh={load} /> : null}
          {section === "design" ? <DesignPlannerClient showToast={showToast} role={overview.admin.role} /> : null}
          {section === "venue" ? <VenueTagsView showToast={showToast} /> : null}
          {section === "mini" ? <MiniProgramAdminView admin={overview.admin} creators={overview.creators} tags={overview.tags} locations={locations} showToast={showToast} /> : null}
          {section === "viz" && overview.admin.role === "super" ? <VizManagement showToast={showToast} creators={overview.creators} /> : null}
          {section === "admins" && overview.admin.role === "super" ? <AdminAccountsView accounts={overview.adminAccounts} creators={overview.creators} showToast={showToast} onRefresh={load} /> : null}
          {section === "tags" ? <TagsAdminView tags={overview.tags} creators={overview.creators} showToast={showToast} onRefresh={load} /> : null}
          {section === "invites" ? <InvitesView inviteCodes={overview.inviteCodes} creators={overview.creators} settings={overview.settings} showToast={showToast} onRefresh={load} /> : null}
          {section === "messages" ? <MessagesView creators={overview.creators} notifications={overview.notifications} showToast={showToast} onRefresh={load} /> : null}
          {section === "writer" ? <WriterAdminView overview={overview} showToast={showToast} onRefresh={load} /> : null}
          {section === "redbook" ? <RedbookSettingsView showToast={showToast} /> : null}
          {section === "trends" ? <TrendLibraryView showToast={showToast} /> : null}
        </div>
      </section>
      {toast ? <div className="toast">{toast}</div> : null}
    </main>
  );
}

function writerMissingStep(creator: CreatorProfile) {
  if (creator.workUrls.length !== 1) return "上传图片";
  if (!creator.tagsSubmittedAt) return "筛选标签";
  if (!creator.scheduleConfirmedAt) return "活动计划";
  if (!creator.province || !creator.city) return "常驻城市";
  if (!creator.intro) return "品牌介绍";
  return "";
}

function ResourceDashboard({ overview, locations, showToast, onNavigate }: { overview: AdminOverview; locations: LocationProvince[]; showToast: (message: string) => void; onNavigate: (section: AdminSection) => void }) {
  const [filters, setFilters] = useState({ province: "", city: "", district: "", startDate: "", endDate: "", schedule: "", rating: "", managerAdminId: "", opportunityType: "", tagIds: [] as number[] });
  const [expandedStat, setExpandedStat] = useState<{ type: "city" | "district" | "tag" | "rating"; key: string; label: string } | null>(null);
  const province = locations.find((item) => item.name === filters.province);
  const city = province?.cities.find((item) => item.name === filters.city);
  const creators = useMemo(() => overview.creators.filter((creator) => {
    if (filters.province && creator.province !== filters.province) return false;
    if (filters.city && creator.city !== filters.city) return false;
    if (filters.district && creator.district !== filters.district) return false;
    if (filters.rating && creator.adminRating !== filters.rating) return false;
    if (filters.managerAdminId && creator.managerAdminId !== Number(filters.managerAdminId)) return false;
    if (filters.opportunityType && !creator.opportunityTypes.includes(filters.opportunityType)) return false;
    if (filters.tagIds.length && !filters.tagIds.every((id) => creator.tags.some((tag) => tag.id === id))) return false;
    if (filters.schedule === "none" && !creator.noBookings) return false;
    if (filters.schedule === "planned" && (creator.noBookings || !(creator.busyPeriods || []).length)) return false;
    if (filters.startDate || filters.endDate) {
      const from = filters.startDate || filters.endDate;
      const to = filters.endDate || filters.startDate;
      if (!(creator.busyPeriods || []).some((period) => period.startDate <= to && period.endDate >= from)) return false;
    }
    return true;
  }), [filters, overview.creators]);
  const top = (values: string[]) => Object.entries(values.filter(Boolean).reduce<Record<string, number>>((result, value) => ({ ...result, [value]: (result[value] || 0) + 1 }), {})).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([key, count]) => ({ key, label: key, count }));
  const cityStats = top(creators.map((creator) => creator.city));
  const districtStats = top(creators.map((creator) => creator.district));
  const tagStats = top(creators.flatMap((creator) => [...new Set(creator.tags.map((tag) => tag.label))]));
  const ratingStats = (["excellent", "good", "average", "poor", ""] as CreatorRating[]).map((rating) => ({ key: rating, label: ratingLabel(rating), count: creators.filter((creator) => creator.adminRating === rating).length }));
  const expandedUsers = expandedStat ? creators.filter((creator) => {
    if (expandedStat.type === "city") return creator.city === expandedStat.key;
    if (expandedStat.type === "district") return creator.district === expandedStat.key;
    if (expandedStat.type === "tag") return creator.tags.some((tag) => tag.label === expandedStat.key);
    if (expandedStat.type === "rating") return creator.adminRating === expandedStat.key;
    return false;
  }) : [];
  async function download() {
    const response = await fetch("/api/admin/export", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ creatorIds: creators.map((item) => item.id) }) });
    if (!response.ok) return showToast("资料下载失败");
    const blob = await response.blob(); const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = `TDE用户资源_${new Date().toISOString().slice(0, 10)}.zip`; link.click(); URL.revokeObjectURL(url);
  }
  return <div className="admin-stack resource-dashboard"><section className="filter-panel"><div className="admin-section-heading"><div><p className="eyebrow">RESOURCE DASHBOARD</p><h2>用户资源看板</h2><p>组合城市、区、日期、标签、分级和合作意向，统计结果按用户去重。</p></div><button className="button secondary" type="button" disabled={!creators.length} onClick={download}><Download size={17} />下载当前结果</button></div><div className="filter-grid"><label><span>省份</span><select value={filters.province} onChange={(event) => setFilters({ ...filters, province: event.target.value, city: "", district: "" })}><option value="">全部省份</option>{locations.map((item) => <option key={item.code}>{item.name}</option>)}</select></label><label><span>城市</span><select value={filters.city} onChange={(event) => setFilters({ ...filters, city: event.target.value, district: "" })}><option value="">全部城市</option>{province?.cities.map((item) => <option key={item.code}>{item.name}</option>)}</select></label><label><span>区</span><select value={filters.district} onChange={(event) => setFilters({ ...filters, district: event.target.value })} disabled={!city}><option value="">全部区</option>{city?.districts?.map((item) => <option key={item.code}>{item.name}</option>)}</select></label><label><span>日期计划</span><select value={filters.schedule} onChange={(event) => setFilters({ ...filters, schedule: event.target.value })}><option value="">全部状态</option><option value="planned">已有其他活动日期</option><option value="none">近期无其他活动</option></select></label><label><span>分级</span><select value={filters.rating} onChange={(event) => setFilters({ ...filters, rating: event.target.value })}><option value="">全部分级</option><option value="excellent">优秀</option><option value="good">良好</option><option value="average">一般</option><option value="poor">差</option></select></label><label><span>日期开始</span><input type="date" value={filters.startDate} onChange={(event) => setFilters({ ...filters, startDate: event.target.value })} /></label><label><span>日期结束</span><input type="date" min={filters.startDate} value={filters.endDate} onChange={(event) => setFilters({ ...filters, endDate: event.target.value })} /></label><label><span>所属子管理员</span><select value={filters.managerAdminId} onChange={(event) => setFilters({ ...filters, managerAdminId: event.target.value })}><option value="">全部来源</option>{overview.adminAccounts.map((item) => <option key={item.id} value={item.id}>{item.phone}</option>)}</select></label><label><span>合作意向</span><select value={filters.opportunityType} onChange={(event) => setFilters({ ...filters, opportunityType: event.target.value })}><option value="">全部合作意向</option>{cooperationTypes.map((item) => <option key={item}>{item}</option>)}</select></label></div><div className="resource-tag-filter"><strong>标签（同时满足全部）</strong><div>{overview.tags.filter((tag) => tag.status === "active").map((tag) => <button type="button" className={filters.tagIds.includes(tag.id) ? "selected" : ""} key={tag.id} onClick={() => setFilters({ ...filters, tagIds: filters.tagIds.includes(tag.id) ? filters.tagIds.filter((id) => id !== tag.id) : [...filters.tagIds, tag.id] })}>{tag.label}</button>)}</div></div><button className="text-button" type="button" onClick={() => setFilters({ province: "", city: "", district: "", startDate: "", endDate: "", schedule: "", rating: "", managerAdminId: "", opportunityType: "", tagIds: [] })}>清空全部条件</button></section>
    <section className="resource-total"><span>符合当前条件</span><strong>{creators.length}</strong><i>位用户</i></section>
    <div className="resource-stat-grid">{[{ type: "city" as const, title: "城市人数", items: cityStats }, { type: "district" as const, title: "区人数", items: districtStats }, { type: "tag" as const, title: "标签人数", items: tagStats }, { type: "rating" as const, title: "用户分级", items: ratingStats }].map((group) => <section className="admin-section-block" key={group.type}><h2>{group.title}</h2>{group.items.map((item) => { const active = expandedStat !== null && expandedStat.type === group.type && expandedStat.key === item.key; return <button key={item.key} className={active ? "stat-row active" : "stat-row"} type="button" onClick={() => setExpandedStat(active ? null : { type: group.type, key: item.key, label: item.label })}><span>{item.label}</span><strong>{item.count}</strong></button>; })}</section>)}</div>
    {expandedStat ? <section className="admin-section-block"><div className="admin-section-heading"><div><h2>「{expandedStat.label}」用户列表</h2><p>点击用户进入用户管理查看/编辑。</p></div><span>{expandedUsers.length} 人</span></div><div className="stat-user-list">{expandedUsers.slice(0, 100).map((creator) => <button key={creator.id} type="button" onClick={() => onNavigate("creators")}><strong>{creator.brandName || creator.userName || creator.phone}</strong><span>{creator.phone} · 邀请码 {creator.inviteCode}</span></button>)}{expandedUsers.length ? null : <p className="empty-note">暂无用户。</p>}</div></section> : null}
    <section className="admin-section-block"><div className="admin-section-heading"><div><h2>匹配用户</h2><p>点击“用户管理”可继续修改详细资料。</p></div><span>{creators.length} 人</span></div><div className="resource-user-list">{creators.slice(0, 100).map((creator) => <article key={creator.id}><div><strong>{creator.brandName || creator.phone}</strong><span>{creator.phone} · {[creator.city, creator.district].filter(Boolean).join(" ") || "未填城市"}</span></div><div className="table-tags">{creator.tags.slice(0, 4).map((tag) => <span key={tag.id}>{tag.label}</span>)}</div><b>{ratingLabel(creator.adminRating)}</b></article>)}</div></section>
  </div>;
}

function ChangePasswordDialog({ onClose, showToast }: { onClose: () => void; showToast: (message: string) => void }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (password.length < 6) return setError("新密码至少需要6位");
    if (password !== confirm) return setError("两次输入的密码不一致");
    setSaving(true); setError("");
    const { response, data } = await fetchJson("/api/admin/account/password", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ password }) });
    setSaving(false);
    if (!response.ok) return setError(data.error || "修改失败");
    showToast("登录密码已修改，下次登录请使用新密码");
    onClose();
  }
  return (
    <div className="dialog-backdrop" onMouseDown={onClose}>
      <form className="admin-message-dialog" onSubmit={submit} onMouseDown={(event) => event.stopPropagation()}>
        <p className="eyebrow">ACCOUNT SECURITY</p>
        <h2>修改登录密码</h2>
        <p className="field-help">修改后，下次登录请使用新密码。若忘记密码，可联系超级管理员重置。</p>
        <label className="field"><span>新密码</span><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} maxLength={64} required autoFocus /></label>
        <label className="field"><span>确认新密码</span><input type="password" value={confirm} onChange={(event) => setConfirm(event.target.value)} maxLength={64} required /></label>
        {error ? <p className="form-error">{error}</p> : null}
        <button className="button primary full" type="submit" disabled={saving}>{saving ? "保存中" : "保存新密码"}</button>
      </form>
    </div>
  );
}

function relationshipRows(creators: CreatorProfile[]) {
  const ids = new Set(creators.map((item) => item.id));
  const children = new Map<number | null, CreatorProfile[]>();
  for (const creator of creators) {
    const parent = creator.invitedByCreatorId && ids.has(creator.invitedByCreatorId) ? creator.invitedByCreatorId : null;
    children.set(parent, [...(children.get(parent) || []), creator]);
  }
  const rows: Array<{ creator: CreatorProfile; depth: number }> = [];
  const walk = (parent: number | null, depth: number) => {
    for (const creator of (children.get(parent) || []).sort((a, b) => a.createdAt.localeCompare(b.createdAt))) {
      rows.push({ creator, depth }); walk(creator.id, depth + 1);
    }
  };
  walk(null, 0); return rows;
}

function AdminAccountsView({ accounts, creators, showToast, onRefresh }: { accounts: AdminAccount[]; creators: CreatorProfile[]; showToast: (message: string) => void; onRefresh: () => void }) {
  const [codes, setCodes] = useState<Record<number, string>>(() => Object.fromEntries(accounts.map((item) => [item.id, item.inviteCode])));
  const [selectedId, setSelectedId] = useState<number | "">(accounts[0]?.id || "");
  const [keyword, setKeyword] = useState("");
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newPhoneConfirm, setNewPhoneConfirm] = useState("");
  const [creating, setCreating] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editPassword, setEditPassword] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  async function update(account: AdminAccount, status: AdminAccount["status"]) {
    const { response, data } = await fetchJson("/api/admin/accounts", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: account.id, status, inviteCode: codes[account.id] || account.inviteCode }) });
    if (!response.ok) return showToast(data.error || "操作失败");
    showToast(status === "active" ? "子管理员已审核通过" : status === "suspended" ? "子管理员已停用" : "审核状态已更新"); onRefresh();
  }
  async function createAccount(event: FormEvent) {
    event.preventDefault();
    if (!newName.trim()) return showToast("请填写子管理员姓名");
    if (newPhone !== newPhoneConfirm) return showToast("两次输入的手机号不一致");
    setCreating(true);
    const { response, data } = await fetchJson("/api/admin/accounts", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: newName.trim(), phone: newPhone }) });
    setCreating(false);
    if (!response.ok) return showToast(data.error || "创建失败");
    showToast(`子管理员「${newName.trim()}」已创建，默认密码为手机号`);
    setNewName(""); setNewPhone(""); setNewPhoneConfirm("");
    onRefresh();
  }
  function openEdit(account: AdminAccount) {
    setEditId(account.id); setEditName(account.name); setEditPhone(account.phone); setEditPassword("");
  }
  async function saveEdit(account: AdminAccount) {
    setSavingEdit(true);
    const { response, data } = await fetchJson("/api/admin/accounts", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: account.id, name: editName, phone: editPhone, password: editPassword || undefined }) });
    setSavingEdit(false);
    if (!response.ok) return showToast(data.error || "保存失败");
    showToast("子管理员信息已更新"); setEditId(null); onRefresh();
  }
  const selectedCreators = creators.filter((creator) => creator.managerAdminId === Number(selectedId) && (!keyword || [creator.phone, creator.brandName, creator.inviteCode].join(" ").toLowerCase().includes(keyword.toLowerCase())));
  const rows = relationshipRows(selectedCreators);
  return <div className="admin-stack"><section className="admin-section-block"><div className="admin-section-heading"><div><p className="eyebrow">CREATE SUBADMIN</p><h2>新增子管理员</h2><p>由超管直接创建；首次登录账号为手机号、密码为手机号，子管理员可在运营台自行修改密码。</p></div></div><form className="admin-inline-form" onSubmit={createAccount}><label className="field"><span>姓名</span><input value={newName} onChange={(event) => setNewName(event.target.value)} maxLength={40} placeholder="例如：王小明" required /></label><label className="field"><span>手机号（登录账号）</span><input inputMode="numeric" value={newPhone} onChange={(event) => setNewPhone(event.target.value.replace(/\D/g, "").slice(0, 11))} required /></label><label className="field"><span>确认手机号</span><input inputMode="numeric" value={newPhoneConfirm} onChange={(event) => setNewPhoneConfirm(event.target.value.replace(/\D/g, "").slice(0, 11))} required /></label><button className="button primary" type="submit" disabled={creating}>{creating ? "创建中" : "创建子管理员"}</button></form></section>
    <section className="admin-section-block"><div className="admin-section-heading"><div><p className="eyebrow">TEAM ACCESS</p><h2>子管理员审核与权限</h2><p>子管理员只能管理、绑定并通知自己关系下的新遇官，不能下载资料或修改平台设置。</p></div><span>{accounts.filter((item) => item.status === "pending").length} 个待审核</span></div><div className="admin-account-list">{accounts.length ? accounts.map((account) => <article key={account.id}><div><strong>{account.name || account.phone}</strong><span>{account.phone} · {account.status === "pending" ? "待审核" : account.status === "active" ? "已启用" : account.status === "suspended" ? "已停用" : "未通过"} · {formatShanghaiDateTime(account.createdAt)}</span></div><label><span>固定邀请码</span><input value={codes[account.id] ?? account.inviteCode} onChange={(event) => setCodes({ ...codes, [account.id]: event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8) })} /></label><b>{account.totalUsers} 位用户</b><div>{account.status !== "active" ? <button className="button primary" type="button" onClick={() => update(account, "active")}>审核通过</button> : <button className="button secondary" type="button" onClick={() => update(account, "suspended")}>停用</button>}{account.status === "pending" ? <button className="button secondary" type="button" onClick={() => update(account, "rejected")}>不通过</button> : null}<button className="button secondary" type="button" onClick={() => openEdit(account)}>编辑账号</button></div>{editId === account.id ? <div className="admin-edit-account"><label className="field"><span>姓名</span><input value={editName} onChange={(event) => setEditName(event.target.value)} maxLength={40} /></label><label className="field"><span>登录账号（手机号）</span><input inputMode="numeric" value={editPhone} onChange={(event) => setEditPhone(event.target.value.replace(/\D/g, "").slice(0, 11))} /></label><label className="field"><span>重置登录密码（留空则不修改）</span><input value={editPassword} onChange={(event) => setEditPassword(event.target.value)} maxLength={64} placeholder="至少6位" /></label><div><button className="button primary" type="button" disabled={savingEdit} onClick={() => saveEdit(account)}>{savingEdit ? "保存中" : "保存修改"}</button><button className="button secondary" type="button" onClick={() => setEditId(null)}>取消</button></div></div> : null}</article>) : <p className="empty-note">还没有子管理员，请在上方创建。</p>}</div></section>
    <section className="admin-section-block"><div className="admin-section-heading"><div><p className="eyebrow">INVITATION NETWORK</p><h2>邀请关系树</h2><p>邀请码只用于识别，真实上下级关系由后台永久记录。</p></div><Network size={22} /></div><div className="relationship-filters"><select value={selectedId} onChange={(event) => setSelectedId(event.target.value ? Number(event.target.value) : "")}><option value="">选择子管理员</option>{accounts.map((item) => <option key={item.id} value={item.id}>{item.name || item.phone} · {item.inviteCode}</option>)}</select><input value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="搜索手机号、品牌或邀请码" /></div><div className="relationship-tree">{rows.map(({ creator, depth }) => <article key={creator.id} style={{ "--tree-depth": Math.min(depth, 8) } as React.CSSProperties}><i>{depth ? "↳" : "●"}</i><div><strong>{creator.brandName || creator.phone}</strong><span>{creator.phone} · 邀请码 {creator.inviteCode}</span></div><time>{formatShanghaiDateTime(creator.createdAt)}</time></article>)}{selectedId && !rows.length ? <p className="empty-note">当前子管理员还没有发展用户。</p> : null}</div></section>
  </div>;
}

function OverviewView({ overview, onNavigate }: { overview: AdminOverview; onNavigate: (section: AdminSection) => void }) {
  const ready = overview.creators.filter((creator) => !writerMissingStep(creator)).length;
  const metrics = [
    { label: "注册用户", value: overview.metrics.creators, icon: <Users />, section: "creators" as AdminSection },
    { label: "可生成文章", value: ready, icon: <Bot />, section: "writer" as AdminSection },
    { label: "待完善生成资料", value: overview.creators.length - ready, icon: <CalendarDays />, section: "creators" as AdminSection },
    { label: "待复核标签", value: overview.metrics.pendingTags, icon: <Tags />, section: "tags" as AdminSection },
  ];
  const steps = ["上传图片", "筛选标签", "活动计划", "常驻城市", "品牌介绍"];
  const [expandedStat, setExpandedStat] = useState<string | null>(null);
  const readinessStats = [
    { key: "ready", label: "已具备生成条件", count: ready, users: overview.creators.filter((creator) => !writerMissingStep(creator)) },
    ...steps.map((step) => ({ key: step, label: `停在${step}`, count: overview.creators.filter((creator) => writerMissingStep(creator) === step).length, users: overview.creators.filter((creator) => writerMissingStep(creator) === step) })),
  ];
  const expanded = readinessStats.find((stat) => stat.key === expandedStat) || null;
  return <div className="admin-stack"><section className="metric-grid">{metrics.map((metric) => <button key={metric.label} type="button" onClick={() => onNavigate(metric.section)}><span>{metric.icon}</span><strong>{metric.value}</strong><p>{metric.label}</p></button>)}</section><section className="admin-section-block"><div className="admin-section-heading"><div><p className="eyebrow">ARTICLE READINESS</p><h2>文章生成资料进度</h2></div><button type="button" onClick={() => onNavigate("creators")}>进入寻人筛选</button></div><div className="category-stats">{readinessStats.map((stat) => <button key={stat.key} className={expandedStat === stat.key ? "active" : ""} type="button" onClick={() => setExpandedStat(expandedStat === stat.key ? null : stat.key)}><span>{stat.label}</span><strong>{stat.count}</strong></button>)}</div>{expanded ? <div className="stat-user-list"><p className="stat-user-list-head">{expanded.label} · {expanded.count} 位（点击用户进入用户管理）</p>{expanded.users.map((creator) => <button key={creator.id} type="button" onClick={() => onNavigate("creators")}><strong>{creator.brandName || creator.userName || creator.phone}</strong><span>{creator.phone} · 邀请码 {creator.inviteCode}</span></button>)}{expanded.users.length ? null : <p className="empty-note">暂无该状态下用户。</p>}</div> : null}</section></div>;
}

function CreatorSearchView({
  overview,
  locations,
  notifications,
  showToast,
  onRefresh,
}: {
  overview: AdminOverview;
  locations: LocationProvince[];
  notifications: PlatformNotification[];
  showToast: (message: string) => void;
  onRefresh: () => void;
}) {
  const [filters, setFilters] = useState({
    keyword: "",
    inviteCode: "",
    province: "",
    city: "",
    district: "",
    startDate: "",
    endDate: "",
    rating: "",
    accountStatus: "active",
    flowStatus: "",
    managerAdminId: "",
    opportunityType: "",
    precisionInviteGoal: "",
    precisionInviteScene: "",
    xiaohongshuFollowersMin: "",
    douyinFollowersMin: "",
    xiaohongshuLinkStatus: "",
    douyinLinkStatus: "",
    tagIds: [] as number[],
  });
  const [appliedFilters, setAppliedFilters] = useState({
    keyword: "",
    inviteCode: "",
    province: "",
    city: "",
    district: "",
    startDate: "",
    endDate: "",
    rating: "",
    accountStatus: "active",
    flowStatus: "",
    managerAdminId: "",
    opportunityType: "",
    precisionInviteGoal: "",
    precisionInviteScene: "",
    xiaohongshuFollowersMin: "",
    douyinFollowersMin: "",
    xiaohongshuLinkStatus: "",
    douyinLinkStatus: "",
    tagIds: [] as number[],
  });
  const [results, setResults] = useState<CreatorProfile[]>(overview.creators.filter((creator) => !creator.suspended));
  const [selected, setSelected] = useState<number[]>([]);
  const [visualizing, setVisualizing] = useState(false);
  const [searching, setSearching] = useState(false);
  const [tagPanel, setTagPanel] = useState(false);
  const [composeIds, setComposeIds] = useState<number[] | null>(null);
  const [editing, setEditing] = useState<CreatorProfile | null>(null);
  const [creating, setCreating] = useState(false);
  const [downloadQr, setDownloadQr] = useState<{ downloadUrl: string; originalName: string; size: number; expiresAt: number } | null>(null);
  const isSuper = overview.admin.role === "super";
  const province = locations.find((item) => item.name === filters.province);
  const city = province?.cities.find((item) => item.name === filters.city);
  const filterableTags = overview.tags.filter(
    (tag) => tag.status === "active" || tag.status === "retired",
  );
  const categories = tagCategoryNames.filter((category) =>
    filterableTags.some((tag) => tag.category === category),
  );

  // 筛选选项常量
  const ratingOptions = [
    { value: "", label: "全部分级" },
    { value: "excellent", label: "优秀" },
    { value: "good", label: "良好" },
    { value: "average", label: "一般" },
    { value: "poor", label: "差" },
  ];
  const flowStatusOptions = [
    { value: "", label: "全部流程状态" },
    { value: "uploadImage", label: "待完成上传图片" },
    { value: "filterTags", label: "待完成筛选标签" },
    { value: "schedule", label: "待完成活动计划" },
    { value: "city", label: "待完成常驻城市" },
    { value: "intro", label: "待完成品牌介绍" },
    { value: "ready", label: "可生成文章" },
  ];
  const accountStatusOptions = [
    { value: "active", label: "正常用户" },
    { value: "archived", label: "已移出用户" },
    { value: "all", label: "全部用户" },
  ];
  const provinceOptions = [
    { value: "", label: "全部省份" },
    ...locations.map((item) => ({ value: item.name, label: item.name })),
  ];
  const cityOptions = [
    { value: "", label: "全部城市" },
    ...(province?.cities.map((item) => ({ value: item.name, label: item.name })) || []),
  ];
  const districtOptions = [
    { value: "", label: "全部区" },
    ...(city?.districts?.map((item) => ({ value: item.name, label: item.name })) || []),
  ];
  const managerOptions = [
    { value: "", label: "全部来源" },
    ...overview.adminAccounts
      .filter((item) => item.status === "active")
      .map((item) => ({ value: String(item.id), label: `${item.phone} · ${item.inviteCode}` })),
  ];
  const opportunityOptions = [
    { value: "", label: "全部合作意向" },
    ...cooperationTypes.map((item) => ({ value: item, label: item })),
  ];
  const precisionGoalOptions = [
    { value: "", label: "全部合作目标" },
    ...precisionInviteGoals.map((item) => ({ value: item, label: item })),
  ];
  const precisionSceneOptions = [
    { value: "", label: "全部期待场景" },
    ...precisionInviteScenes.map((item) => ({ value: item, label: item })),
  ];
  const linkStatusOptions = [
    { value: "", label: "不限" },
    { value: "filled", label: "已填写" },
    { value: "empty", label: "未填写" },
  ];

  // 检查是否有任何筛选条件（accountStatus 默认 active 不算）
  const hasAnyFilter = Boolean(
    filters.keyword ||
      filters.inviteCode ||
      filters.province ||
      filters.city ||
      filters.district ||
      filters.startDate ||
      filters.endDate ||
      filters.rating ||
      filters.flowStatus ||
      filters.managerAdminId ||
      filters.opportunityType ||
      filters.precisionInviteGoal ||
      filters.precisionInviteScene ||
      filters.xiaohongshuFollowersMin ||
      filters.douyinFollowersMin ||
      filters.xiaohongshuLinkStatus ||
      filters.douyinLinkStatus ||
      filters.tagIds.length > 0,
  );

  async function search(event?: FormEvent) {
    event?.preventDefault();
    // 空搜索检查：没有任何筛选条件时提示用户
    if (!hasAnyFilter) {
      showToast("请先选择至少一个筛选条件");
      return;
    }
    setSearching(true);
    const { response, data } = await fetchJson("/api/admin/creators", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(filters),
    });
    setSearching(false);
    if (response.ok) {
      let matched = data.creators as CreatorProfile[];
      if (filters.flowStatus) {
        const flowStepMap: Record<string, string> = {
          uploadImage: "上传图片",
          filterTags: "筛选标签",
          schedule: "活动计划",
          city: "常驻城市",
          intro: "品牌介绍",
        };
        matched = matched.filter((creator) => {
          const step = writerMissingStep(creator);
          if (filters.flowStatus === "ready") return step === "";
          return step === (flowStepMap[filters.flowStatus] || "");
        });
      }
      setResults(matched);
      setAppliedFilters({ ...filters, tagIds: [...filters.tagIds] });
      setSelected([]);
      showToast(`找到 ${matched.length} 位匹配用户`);
    }
  }

  function toggleTag(id: number) {
    setFilters((current) => ({
      ...current,
      tagIds: current.tagIds.includes(id)
        ? current.tagIds.filter((item) => item !== id)
        : [...current.tagIds, id],
    }));
  }

  function clearFilters() {
    const cleared = {
      keyword: "",
      inviteCode: "",
      province: "",
      city: "",
      district: "",
      startDate: "",
      endDate: "",
      rating: "",
      accountStatus: "active",
      flowStatus: "",
      managerAdminId: "",
      opportunityType: "",
      precisionInviteGoal: "",
      precisionInviteScene: "",
      xiaohongshuFollowersMin: "",
      douyinFollowersMin: "",
      xiaohongshuLinkStatus: "",
      douyinLinkStatus: "",
      tagIds: [] as number[],
    };
    setFilters(cleared);
    setAppliedFilters(cleared);
    setResults(overview.creators.filter((creator) => !creator.suspended));
    setSelected([]);
  }

  async function setCreatorSuspended(creator: CreatorProfile, suspended: boolean) {
    const action = suspended ? "移出用户列表" : "恢复用户";
    const warning = suspended
      ? "用户资料、图片、标签、日期和历史记录都会保留，之后仍可恢复。"
      : "恢复后用户可以重新登录，并会回到正常用户列表。";
    if (!window.confirm(`确认${action}“${creator.brandName || creator.phone}”？\n${warning}`)) return;
    const { response, data } = await fetchJson("/api/admin/creators", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "setSuspended", creatorId: creator.id, suspended }),
    });
    if (!response.ok) return showToast(data.error || `${action}失败`);
    setResults((current) => {
      if (filters.accountStatus === "active" && data.creator.suspended)
        return current.filter((item) => item.id !== creator.id);
      if (filters.accountStatus === "archived" && !data.creator.suspended)
        return current.filter((item) => item.id !== creator.id);
      return current.map((item) => item.id === creator.id ? data.creator : item);
    });
    setEditing(null);
    showToast(suspended ? "用户已移出列表，资料已安全保留" : "用户已恢复");
    onRefresh();
  }

  async function generateClaimCode(creator: CreatorProfile) {
    const { response, data } = await fetchJson("/api/admin/creators", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "generateClaimCode", creatorId: creator.id }),
    });
    if (!response.ok) return showToast(data.error || "认领码生成失败");
    window.prompt(
      `请将此认领码交给“${creator.brandName || creator.phone}”。\n认领码7天有效、只能使用一次；重新生成后旧码立即失效。`,
      data.claim.code,
    );
  }

  async function updateWecomBinding(creator: CreatorProfile, action: "approve" | "rebind" | "reject" | "disable" | "delete") {
    let reason = "";
    if (action === "reject") {
      reason = window.prompt(`请填写否决“${creator.brandName || creator.phone}”企业微信通知绑定的原因`, "")?.trim() || "";
      if (!reason) return;
    }
    const labels = { approve: "同意绑定", rebind: "重新匹配", reject: "否决", disable: "停用", delete: "删除" };
    if (action !== "reject" && !window.confirm(`确认${labels[action]}“${creator.brandName || creator.phone}”的企业微信通知？`)) return;
    const { response, data } = await fetchJson("/api/admin/wecom/bindings", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ creatorId: creator.id, action, reason }),
    });
    if (!response.ok) return showToast(data.error || "企业微信通知绑定操作失败");
    setResults((current) => current.map((item) => item.id === creator.id ? { ...item, wecomBinding: data.binding } : item));
    showToast(action === "approve" || action === "rebind" ? "企业微信通知已接通" : action === "reject" ? "绑定申请已否决" : action === "disable" ? "企业微信通知已停用" : "企业微信通知绑定已删除");
    onRefresh();
  }

  async function download() {
    const response = await fetch("/api/admin/export", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        creatorIds: selected.length ? selected : results.map((item) => item.id),
        mode: "qrcode",
      }),
    });
    if (!response.ok) return showToast("资料下载失败");
    const data = await response.json().catch(() => ({}));
    if (!data.downloadUrl) return showToast("生成下载链接失败");
    setDownloadQr({
      downloadUrl: data.downloadUrl,
      originalName: data.originalName || "TDE用户资料.zip",
      size: data.size || 0,
      expiresAt: data.expiresAt,
    });
  }

  return (
    <div className="admin-stack">
      <form className="filter-panel" onSubmit={search}>
        <div className="filter-grid">
          <label>
            <span>品牌、手机号、展位描述或标签</span>
            <input
              value={filters.keyword}
              onChange={(event) =>
                setFilters({ ...filters, keyword: event.target.value })
              }
              placeholder="支持模糊搜索"
            />
          </label>
          <label>
            <span>注册使用的邀请码</span>
            <input
              value={filters.inviteCode}
              onChange={(event) =>
                setFilters({
                  ...filters,
                  inviteCode: event.target.value
                    .toUpperCase()
                    .replace(/[^A-Z0-9]/g, "")
                    .slice(0, 8),
                })
              }
              placeholder="完整或部分邀请码"
            />
          </label>
          <label>
            <span>省份</span>
            <CustomSelect
              value={filters.province}
              onChange={(val) =>
                setFilters({
                  ...filters,
                  province: val,
                  city: "",
                  district: "",
                })
              }
              options={provinceOptions}
              placeholder="全部省份"
            />
          </label>
          <label>
            <span>城市</span>
            <CustomSelect
              value={filters.city}
              onChange={(val) => setFilters({ ...filters, city: val, district: "" })}
              options={cityOptions}
              placeholder="全部城市"
            />
          </label>
          <label>
            <span>区</span>
            <CustomSelect
              value={filters.district}
              onChange={(val) => setFilters({ ...filters, district: val })}
              options={districtOptions}
              placeholder="全部区"
              disabled={!city}
            />
          </label>
          <label>
            <span>用户分级</span>
            <CustomSelect
              value={filters.rating}
              onChange={(val) => setFilters({ ...filters, rating: val })}
              options={ratingOptions}
              placeholder="全部分级"
            />
          </label>
          <label>
            <span>流程状态</span>
            <CustomSelect
              value={filters.flowStatus}
              onChange={(val) => setFilters({ ...filters, flowStatus: val })}
              options={flowStatusOptions}
              placeholder="全部流程状态"
            />
          </label>
          <label>
            <span>用户状态</span>
            <CustomSelect
              value={filters.accountStatus}
              onChange={(val) => setFilters({ ...filters, accountStatus: val })}
              options={accountStatusOptions}
              placeholder="正常用户"
            />
          </label>
          {isSuper ? (
            <label>
              <span>所属子管理员</span>
              <CustomSelect
                value={filters.managerAdminId}
                onChange={(val) => setFilters({ ...filters, managerAdminId: val })}
                options={managerOptions}
                placeholder="全部来源"
              />
            </label>
          ) : null}
          <label>
            <span>合作意向</span>
            <CustomSelect
              value={filters.opportunityType}
              onChange={(val) => setFilters({ ...filters, opportunityType: val })}
              options={opportunityOptions}
              placeholder="全部合作意向"
            />
          </label>
          <label>
            <span>精准邀约 · 合作目标</span>
            <CustomSelect
              value={filters.precisionInviteGoal}
              onChange={(val) => setFilters({ ...filters, precisionInviteGoal: val })}
              options={precisionGoalOptions}
              placeholder="全部合作目标"
            />
          </label>
          <label>
            <span>精准邀约 · 期待场景</span>
            <CustomSelect
              value={filters.precisionInviteScene}
              onChange={(val) => setFilters({ ...filters, precisionInviteScene: val })}
              options={precisionSceneOptions}
              placeholder="全部期待场景"
            />
          </label>
          <label>
            <span>小红书粉丝数 ≥</span>
            <input
              type="number"
              min="0"
              step="1"
              value={filters.xiaohongshuFollowersMin}
              onChange={(event) => setFilters({ ...filters, xiaohongshuFollowersMin: event.target.value })}
              placeholder="选填"
            />
          </label>
          <label>
            <span>抖音粉丝数 ≥</span>
            <input
              type="number"
              min="0"
              step="1"
              value={filters.douyinFollowersMin}
              onChange={(event) => setFilters({ ...filters, douyinFollowersMin: event.target.value })}
              placeholder="选填"
            />
          </label>
          <label>
            <span>小红书链接</span>
            <CustomSelect
              value={filters.xiaohongshuLinkStatus}
              onChange={(val) => setFilters({ ...filters, xiaohongshuLinkStatus: val })}
              options={linkStatusOptions}
              placeholder="不限"
            />
          </label>
          <label>
            <span>抖音链接</span>
            <CustomSelect
              value={filters.douyinLinkStatus}
              onChange={(val) => setFilters({ ...filters, douyinLinkStatus: val })}
              options={linkStatusOptions}
              placeholder="不限"
            />
          </label>
          <label>
            <span>明确空档开始</span>
            <input
              type="date"
              value={filters.startDate}
              onChange={(event) =>
                setFilters({ ...filters, startDate: event.target.value })
              }
            />
          </label>
          <label>
            <span>明确空档结束</span>
            <input
              type="date"
              value={filters.endDate}
              min={filters.startDate}
              onChange={(event) =>
                setFilters({ ...filters, endDate: event.target.value })
              }
            />
          </label>
          <button
            className="tag-filter-toggle"
            type="button"
            onClick={() => setTagPanel((current) => !current)}
          >
            <span>标签筛选</span>
            <strong>
              {filters.tagIds.length
                ? `已选 ${filters.tagIds.length} 个 · 同时满足全部`
                : "不限标签"}
            </strong>
            <ChevronDown size={18} />
          </button>
        </div>
        {tagPanel ? (
          <div className="filter-tags">
            {categories.map((category) => (
              <section key={category}>
                <h3>{category}</h3>
                <div>
                  {filterableTags
                    .filter((tag) => tag.category === category)
                    .map((tag) => (
                      <button
                        key={tag.id}
                        type="button"
                        className={
                          filters.tagIds.includes(tag.id) ? "selected" : ""
                        }
                        onClick={() => toggleTag(tag.id)}
                      >
                        {filters.tagIds.includes(tag.id) ? (
                          <Check size={13} />
                        ) : null}
                        {tag.label}
                        {tag.status === "retired" ? "（已下架）" : ""}
                      </button>
                    ))}
                </div>
              </section>
            ))}
          </div>
        ) : null}
        <div className="filter-actions">
          <button type="button" onClick={clearFilters}>
            清空条件
          </button>
          <button className="button primary" disabled={searching}>
            <Search size={18} />
            {searching ? "搜索中" : "开始搜索"}
          </button>
        </div>
      </form>
      <section className="admin-section-block">
        <div className="result-toolbar">
          <div>
            <h2>筛选结果</h2>
            <span>
              {results.length} 位用户 · 已选 {selected.length} 位
            </span>
          </div>
          <div className="result-actions">
            <button
              className="button secondary"
              type="button"
              onClick={() => setVisualizing(true)}
            >
              <ImageIcon size={17} />
              可视化
            </button>
            <button className="button primary" type="button" onClick={() => setCreating(true)}><Plus size={17} />新增用户</button>
            <button
              className="button secondary"
              type="button"
              disabled={!selected.length}
              onClick={() => setComposeIds(selected)}
            >
              <MessageSquareText size={17} />
              通知已选用户
            </button>
            {isSuper ? <button
              className="button secondary"
              type="button"
              disabled={!results.length}
              onClick={download}
            >
              <Download size={17} />
              下载{selected.length ? "已选" : "全部"}资料
            </button> : null}
          </div>
        </div>
        <div className="data-table-wrap">
          <table className="data-table creators-table">
            <thead>
              <tr>
                <th>
                  <input
                    type="checkbox"
                    checked={
                      Boolean(results.length) &&
                      selected.length === results.length
                    }
                    onChange={(event) =>
                      setSelected(
                        event.target.checked
                          ? results.map((item) => item.id)
                          : [],
                      )
                    }
                    aria-label="全选"
                  />
                </th>
                <th>用户/品牌</th>
                <th>邀请码与关系</th>
                <th>联系方式</th>
                <th>企微通知</th>
                <th>省市区</th>
                <th style={{ minWidth: 220 }}>标签</th>
                <th>活动计划</th>
                <th>流程状态</th>
                <th>分级</th>
                <th>备注</th>
                <th style={{ minWidth: 170 }}>合作意向</th>
                <th style={{ minWidth: 230 }}>精准邀约</th>
                <th style={{ minWidth: 220 }}>品牌影响力</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {results.map((creator) => (
                <tr key={creator.id}>
                  <td>
                    <input
                      type="checkbox"
                      checked={selected.includes(creator.id)}
                      onChange={() =>
                        setSelected((current) =>
                          current.includes(creator.id)
                            ? current.filter((id) => id !== creator.id)
                            : [...current, creator.id],
                        )
                      }
                      aria-label={`选择 ${creator.brandName}`}
                    />
                  </td>
                  <td>
                    <strong>{creator.brandName || creator.userName}</strong>
                    <span>
                      UID {creator.id} · 用户邀请码 {creator.inviteCode}
                    </span>
                    {creator.suspended ? <span className="status-rejected">已移出</span> : null}
                    <span>完整度 {creator.profileCompleteness}%</span>
                  </td>
                  <td>
                    <strong>注册邀请码 {creator.registeredWithCode}</strong>
                    <span>来自 {creator.invitedByName}</span>
                    <span>{formatShanghaiDateTime(creator.createdAt)}</span>
                  </td>
                  <td>
                    <strong>{creator.phone}</strong>
                  </td>
                  <td>
                    <strong>{wecomBindingStatusLabel(creator.wecomBinding.status)}</strong>
                    <span>{creator.wecomBinding.status === "approved" ? `通知成员 ${creator.wecomBinding.wecomUserId}` : creator.wecomBinding.lastError || creator.wecomBinding.reviewReason || "加入企业微信后由管理员匹配通知成员"}</span>
                    <div className="table-actions wecom-binding-actions">
                      {creator.wecomBinding.status !== "approved" ? <button type="button" onClick={() => void updateWecomBinding(creator, "approve")}>同意绑定</button> : null}
                      {creator.wecomBinding.status === "approved" ? <button type="button" onClick={() => void updateWecomBinding(creator, "rebind")}>重新匹配</button> : null}
                      {creator.wecomBinding.status === "approved" ? <button type="button" onClick={() => void updateWecomBinding(creator, "disable")}>停用</button> : null}
                      {["unbound", "pending", "error"].includes(creator.wecomBinding.status) ? <button type="button" onClick={() => void updateWecomBinding(creator, "reject")}>否决</button> : null}
                      {isSuper && creator.wecomBinding.id ? <button type="button" onClick={() => void updateWecomBinding(creator, "delete")}>删除</button> : null}
                    </div>
                  </td>
                  <td>
                    <strong>
                      {creator.province} {creator.city} {creator.district}
                    </strong>
                  </td>
                  <td style={{ minWidth: 220 }}>
                    <div className="table-tags">
                      {creator.tags.slice(0, 3).map((tag) => (
                        <span key={tag.id}>
                          {tag.label}
                          {tag.status === "retired" ? "（已下架）" : ""}
                        </span>
                      ))}
                      {creator.tags.length > 3 ? (
                        <i>+{creator.tags.length - 3}</i>
                      ) : null}
                    </div>
                  </td>
                  <td>
                    <strong>
                      {creator.noBookings
                        ? "近期无其他活动"
                        : `${creator.busyPeriods?.length || 0} 条`}
                    </strong>
                    <span>
                      {creator.scheduleConfirmedAt
                        ? `确认于 ${formatShanghaiDateTime(creator.scheduleConfirmedAt)}`
                        : "未提交"}
                    </span>
                  </td>
                  <td>
                    <strong>
                      {writerMissingStep(creator)
                        ? `待完成${writerMissingStep(creator)}`
                        : "可生成文章"}
                    </strong>
                  </td>
                  <td><strong>{ratingLabel(creator.adminRating)}</strong></td>
                  <td><span className="table-note">{creator.adminNote || "暂无备注"}</span></td>
                  <td style={{ minWidth: 170 }}><div className="table-tags">{creator.opportunityTypes.slice(0, 3).map((item) => <span key={item}>{item}</span>)}{creator.opportunityTypes.length > 3 ? <i>+{creator.opportunityTypes.length - 3}</i> : null}</div></td>
                  <td style={{ minWidth: 230 }}>
                    <div className="table-note">
                      <strong>目标：{creator.precisionInviteGoals.join("、") || "未填写"}</strong>
                      <span>场景：{creator.precisionInviteScenes.join("、") || "未填写"}</span>
                    </div>
                  </td>
                  <td style={{ minWidth: 220 }}>
                    <div className="table-note">
                      <strong>小红书：{formatFollowerCount(creator.xiaohongshuFollowers)}{creator.xiaohongshuUrl ? " · 有链接" : ""}</strong>
                      <span>抖音：{formatFollowerCount(creator.douyinFollowers)}{creator.douyinUrl ? " · 有链接" : ""}</span>
                    </div>
                  </td>
                  <td><div className="table-actions"><button type="button" onClick={() => setEditing(creator)}>编辑资料</button><button type="button" onClick={() => void generateClaimCode(creator)}>生成认领码</button><button type="button" onClick={() => setCreatorSuspended(creator, !creator.suspended)}>{creator.suspended ? "恢复" : "移出"}</button></div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {results.length ? null : <p className="empty-note">未找到对应用户。</p>}
      </section>
      {editing ? <CreatorManagementDialog creator={editing} tags={overview.tags} locations={locations} text={overview.settings.uiText} onClose={() => setEditing(null)} onSaved={(creator) => { setEditing(creator); setResults((current) => current.map((item) => item.id === creator.id ? creator : item)); showToast("用户资料已更新"); onRefresh(); }} /> : null}
      {creating ? <ManagedCreatorCreateDialog accounts={overview.adminAccounts} tags={overview.tags} locations={locations} text={overview.settings.uiText} isSuper={isSuper} onClose={() => setCreating(false)} onCreated={(creator, claim) => { setCreating(false); setResults((current) => [creator, ...current.filter((item) => item.id !== creator.id)]); setEditing(creator); window.prompt("新遇官档案已建立。请把以下7天有效、单次使用的认领码交给本人；本人从小程序“我的”进入认领，不使用密码。", claim.code); onRefresh(); }} /> : null}
      {visualizing ? <CreatorVisualization creators={results} onClose={() => setVisualizing(false)} /> : null}
      {downloadQr ? (
        <QrCodeDownloadDialog
          open={true}
          onClose={() => setDownloadQr(null)}
          downloadUrl={downloadQr.downloadUrl}
          originalName={downloadQr.originalName}
          size={downloadQr.size}
          expiresAt={downloadQr.expiresAt}
        />
      ) : null}
      {composeIds ? (
        <MessageComposeDialog
          creatorIds={composeIds}
          creators={overview.creators}
          notifications={notifications}
          source="creator_search"
          filterSnapshot={appliedFilters}
          onClose={() => setComposeIds(null)}
          onSent={(sent) => {
            setComposeIds(null);
            setSelected([]);
            showToast(`已向 ${sent} 位用户发送平台通知`);
            onRefresh();
          }}
        />
      ) : null}
    </div>
  );
}

function ratingLabel(value: CreatorRating) {
  return { excellent: "优秀", good: "良好", average: "一般", poor: "差", "": "未分级" }[value];
}

function wecomBindingStatusLabel(status: CreatorProfile["wecomBinding"]["status"]) {
  return {
    unbound: "待加入企业微信",
    pending: "待管理员绑定",
    approved: "通知已接通",
    rejected: "已否决",
    disabled: "已停用",
    error: "绑定失败",
  }[status];
}

function formatFollowerCount(value: number | null) {
  return value == null ? "未填写" : new Intl.NumberFormat("zh-CN").format(value);
}

function ManagedCreatorCreateDialog({ accounts, tags, locations, text, isSuper, onClose, onCreated }: {
  accounts: AdminAccount[];
  tags: Tag[];
  locations: LocationProvince[];
  text: Record<string, string>;
  isSuper: boolean;
  onClose: () => void;
  onCreated: (creator: CreatorProfile, claim: { code: string; expiresAt: string }) => void;
}) {
  const [form, setForm] = useState({ phone: "", brandName: "", province: "", city: "", district: "", managerAdminId: "", intro: "", adminRating: "" as CreatorRating, adminNote: "", tagIds: [] as number[], opportunityTypes: [] as string[], opportunityOptIn: false, precisionInviteGoals: [] as string[], precisionInviteScenes: [] as string[], xiaohongshuFollowers: "", xiaohongshuUrl: "", douyinFollowers: "", douyinUrl: "", noBookings: false, busyPeriods: [] as { startDate: string; endDate: string; note: string }[] });
  const [saving, setSaving] = useState(false);
  const [cropFile, setCropFile] = useState<File | null>(null);
  const [representativeFile, setRepresentativeFile] = useState<File | null>(null);
  const [error, setError] = useState("");
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const province = locations.find((item) => item.name === form.province);
  const city = province?.cities.find((item) => item.name === form.city);
  const activeTags = tags.filter((item) => item.status === "active" || item.status === "retired");
  function toggleTag(tag: Tag) {
    setForm((current) => {
      if (current.tagIds.includes(tag.id)) return { ...current, tagIds: current.tagIds.filter((id) => id !== tag.id) };
      const categoryCount = activeTags.filter((item) => item.category === tag.category && current.tagIds.includes(item.id)).length;
      if (categoryCount >= 8) { setError(`“${tag.category}”最多选择8个标签`); return current; }
      return { ...current, tagIds: [...current.tagIds, tag.id] };
    });
  }
  async function upload(creatorId: number, file: File) {
    const body = new FormData();
    body.append("creatorId", String(creatorId));
    body.append("kind", "representative");
    body.append("file", file);
    const response = await fetch("/api/admin/creator-image", { method: "POST", body });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "图片上传失败");
    return data.creator;
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true); setError("");
    try {
      const { response, data } = await fetchJson("/api/admin/creators", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "create", phone: form.phone, brandName: form.brandName, province: form.province, city: form.city, district: form.district, managerAdminId: form.managerAdminId }) });
      if (!response.ok) throw new Error(data.error || "新增用户失败");
      const creator = data.creator;
      if (form.intro || form.adminRating || form.adminNote || form.tagIds.length || form.opportunityTypes.length || form.opportunityOptIn || form.precisionInviteGoals.length || form.precisionInviteScenes.length || form.xiaohongshuFollowers || form.xiaohongshuUrl || form.douyinFollowers || form.douyinUrl || form.noBookings || form.busyPeriods.length) {
        const { response: r2, data: d2 } = await fetchJson("/api/admin/creators", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "updateDetails", creatorId: creator.id, intro: form.intro, adminRating: form.adminRating, adminNote: form.adminNote, tagIds: form.tagIds, opportunityTypes: form.opportunityTypes, opportunityOptIn: form.opportunityOptIn, precisionInviteGoals: form.precisionInviteGoals, precisionInviteScenes: form.precisionInviteScenes, xiaohongshuFollowers: form.xiaohongshuFollowers, xiaohongshuUrl: form.xiaohongshuUrl, douyinFollowers: form.douyinFollowers, douyinUrl: form.douyinUrl, noBookings: form.noBookings, busyPeriods: form.busyPeriods }) });
        if (!r2.ok) throw new Error(d2.error || "补充资料保存失败");
      }
      let finalCreator = creator;
      if (representativeFile) {
        try { finalCreator = await upload(creator.id, representativeFile); }
        catch (e) { setError(e instanceof Error ? e.message : "图片上传失败（可稍后补充）"); }
      }
      onCreated(finalCreator, data.claim);
    } catch (e) {
      setError(e instanceof Error ? e.message : "新增用户失败");
    } finally {
      setSaving(false);
    }
  }
  return <div className="dialog-backdrop" onMouseDown={onClose}><form className="admin-editor" onSubmit={submit} onMouseDown={(event) => event.stopPropagation()}><header><div><p className="eyebrow">NEW USER</p><h2>新增新遇官档案</h2></div><button type="button" onClick={onClose} aria-label="关闭"><X /></button></header><div className="editor-scroll"><section className="admin-profile-image"><div>{representativeFile ? <ImagePlus size={24} /> : <ImagePlus size={24} />}</div><label className="button secondary"><ImagePlus size={17} />{representativeFile ? "已选择代表图片" : "上传代表图片"}<input type="file" accept=".jpg,.jpeg,.png,.webp" onChange={(event) => { const file = event.target.files?.[0]; event.currentTarget.value = ""; if (file) setCropFile(file); }} /></label></section><label className="field"><span>本人手机号</span><input inputMode="numeric" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value.replace(/\D/g, "").slice(0, 11) })} required /></label><div className="form-grid two"><label className="field"><span>品牌/工作室名称</span><input value={form.brandName} onChange={(event) => setForm({ ...form, brandName: event.target.value })} maxLength={40} /></label><label className="field"><span>分级</span><select value={form.adminRating} onChange={(event) => setForm({ ...form, adminRating: event.target.value as CreatorRating })}><option value="">未分级</option><option value="excellent">优秀</option><option value="good">良好</option><option value="average">一般</option><option value="poor">差</option></select></label></div>{isSuper ? <label className="field"><span>所属子管理员</span><select value={form.managerAdminId} onChange={(event) => setForm({ ...form, managerAdminId: event.target.value })} required><option value="">请选择</option>{accounts.filter((item) => item.status === "active").map((item) => <option key={item.id} value={item.id}>{item.phone} · {item.inviteCode}</option>)}</select></label> : null}<div className="form-grid two"><label className="field"><span>省份</span><select value={form.province} onChange={(event) => setForm({ ...form, province: event.target.value, city: "", district: "" })}><option value="">请选择省份</option>{locations.map((item) => <option key={item.code}>{item.name}</option>)}</select></label><label className="field"><span>城市</span><select value={form.city} onChange={(event) => setForm({ ...form, city: event.target.value, district: "" })} disabled={!province}><option value="">请选择城市</option>{province?.cities.map((item) => <option key={item.code}>{item.name}</option>)}</select></label></div><label className="field"><span>区</span><select value={form.district} onChange={(event) => setForm({ ...form, district: event.target.value })} disabled={!city}><option value="">请选择区</option>{city?.districts?.map((item) => <option key={item.code}>{item.name}</option>)}</select></label><label className="field"><span>品牌或个人介绍</span><textarea rows={6} maxLength={2000} value={form.intro} onChange={(event) => setForm({ ...form, intro: event.target.value })} /></label><label className="field"><span>内部备注（用户不可见）</span><textarea rows={4} maxLength={500} value={form.adminNote} onChange={(event) => setForm({ ...form, adminNote: event.target.value })} /></label><section><h3>精准邀约</h3><div className="admin-opportunity-tags">{precisionInviteGoals.map((item) => <button type="button" className={form.precisionInviteGoals.includes(item) ? "selected" : ""} key={item} onClick={() => setForm({ ...form, precisionInviteGoals: form.precisionInviteGoals.includes(item) ? form.precisionInviteGoals.filter((value) => value !== item) : [...form.precisionInviteGoals, item] })}>{item}</button>)}</div><p className="field-help">合作目标</p><div className="admin-opportunity-tags">{precisionInviteScenes.map((item) => <button type="button" className={form.precisionInviteScenes.includes(item) ? "selected" : ""} key={item} onClick={() => setForm({ ...form, precisionInviteScenes: form.precisionInviteScenes.includes(item) ? form.precisionInviteScenes.filter((value) => value !== item) : [...form.precisionInviteScenes, item] })}>{item}</button>)}</div><p className="field-help">期待场景</p></section><section><h3>品牌影响力（选填）</h3><div className="form-grid two"><label className="field"><span>小红书粉丝数</span><input type="number" min="0" step="1" value={form.xiaohongshuFollowers} onChange={(event) => setForm({ ...form, xiaohongshuFollowers: event.target.value })} /></label><label className="field"><span>小红书链接</span><input type="url" maxLength={300} value={form.xiaohongshuUrl} onChange={(event) => setForm({ ...form, xiaohongshuUrl: event.target.value })} placeholder="https://" /></label><label className="field"><span>抖音粉丝数</span><input type="number" min="0" step="1" value={form.douyinFollowers} onChange={(event) => setForm({ ...form, douyinFollowers: event.target.value })} /></label><label className="field"><span>抖音链接</span><input type="url" maxLength={300} value={form.douyinUrl} onChange={(event) => setForm({ ...form, douyinUrl: event.target.value })} placeholder="https://" /></label></div></section><section className="admin-schedule-editor"><h3>其他活动日期</h3><label className="agreement"><input type="checkbox" checked={form.noBookings} onChange={(event) => setForm({ ...form, noBookings: event.target.checked, busyPeriods: event.target.checked ? [] : form.busyPeriods })} /><span>近期无其他活动（指TDE以外的活动）</span></label>{!form.noBookings ? <>{form.busyPeriods.map((period, index) => <div className="admin-period-row" key={`${index}-${period.startDate || index}`}><input type="date" value={period.startDate} onChange={(event) => setForm({ ...form, busyPeriods: form.busyPeriods.map((item, itemIndex) => itemIndex === index ? { ...item, startDate: event.target.value, endDate: item.endDate || event.target.value } : item) })} /><input type="date" value={period.endDate} min={period.startDate} onChange={(event) => setForm({ ...form, busyPeriods: form.busyPeriods.map((item, itemIndex) => itemIndex === index ? { ...item, endDate: event.target.value } : item) })} /><input value={period.note} maxLength={20} placeholder="活动说明" onChange={(event) => setForm({ ...form, busyPeriods: form.busyPeriods.map((item, itemIndex) => itemIndex === index ? { ...item, note: event.target.value } : item) })} /><button type="button" onClick={() => setForm({ ...form, busyPeriods: form.busyPeriods.filter((_, itemIndex) => itemIndex !== index) })} aria-label="删除日期"><Trash2 size={16} /></button></div>)}<button className="button secondary" type="button" onClick={() => setForm({ ...form, busyPeriods: [...form.busyPeriods, { startDate: "", endDate: "", note: "" }] })}><Plus size={16} />增加日期</button></> : null}</section><section><h3>标签</h3>{tagCategoryNames.map((category) => { const categoryTags = activeTags.filter((tag) => tag.category === category); const expanded = expandedCategories.has(category); const visibleTags = expanded ? categoryTags : categoryTags.slice(0, 6); return <div className="admin-tag-category" key={category}><strong>{category}</strong><div>{visibleTags.map((tag) => <button type="button" className={form.tagIds.includes(tag.id) ? "selected" : ""} key={tag.id} onClick={() => toggleTag(tag)}>{form.tagIds.includes(tag.id) ? <Check size={13} /> : null}{tag.label}</button>)}</div>{categoryTags.length > 6 ? <button type="button" className="text-button" onClick={() => setExpandedCategories((current) => { const next = new Set(current); if (expanded) next.delete(category); else next.add(category); return next; })}>{expanded ? "收起" : `展开全部 ${categoryTags.length} 个`}</button> : null}</div>; })}</section><section><h3>合作意向</h3><div className="admin-opportunity-tags">{cooperationTypes.map((item) => <button type="button" className={form.opportunityTypes.includes(item) ? "selected" : ""} key={item} onClick={() => setForm({ ...form, opportunityTypes: form.opportunityTypes.includes(item) ? form.opportunityTypes.filter((value) => value !== item) : [...form.opportunityTypes, item] })}>{item}</button>)}</div><label className="agreement"><input type="checkbox" checked={form.opportunityOptIn} onChange={(event) => setForm({ ...form, opportunityOptIn: event.target.checked })} /><span>允许TDE联系并匹配合作机会</span></label></section><p className="field-help">创建后会生成8位认领码。请交给本人从小程序“我的”完成微信手机号核验；新遇官不设置密码。</p>{error ? <p className="form-error">{error}</p> : null}</div><footer><button className="button secondary" type="button" onClick={onClose}>取消</button><button className="button primary" disabled={saving}>{saving ? "保存中" : "保存"}</button></footer></form>{cropFile ? <WorkImageCropDialog file={cropFile} text={text} onCancel={() => setCropFile(null)} onConfirm={(file) => { setRepresentativeFile(file); setCropFile(null); }} /> : null}</div>;
}

function CreatorManagementDialog({ creator, tags, locations, text, onClose, onSaved }: {
  creator: CreatorProfile;
  tags: Tag[];
  locations: LocationProvince[];
  text: Record<string, string>;
  onClose: () => void;
  onSaved: (creator: CreatorProfile) => void;
}) {
  const [form, setForm] = useState({ brandName: creator.brandName, intro: creator.intro, province: creator.province, city: creator.city, district: creator.district, adminRating: creator.adminRating, adminNote: creator.adminNote, opportunityTypes: [...creator.opportunityTypes], opportunityOptIn: creator.opportunityOptIn, precisionInviteGoals: [...creator.precisionInviteGoals], precisionInviteScenes: [...creator.precisionInviteScenes], xiaohongshuFollowers: creator.xiaohongshuFollowers == null ? "" : String(creator.xiaohongshuFollowers), xiaohongshuUrl: creator.xiaohongshuUrl, douyinFollowers: creator.douyinFollowers == null ? "" : String(creator.douyinFollowers), douyinUrl: creator.douyinUrl, noBookings: creator.noBookings, busyPeriods: (creator.busyPeriods || []).map((item) => ({ startDate: item.startDate, endDate: item.endDate, note: item.note })), tagIds: creator.tags.map((item) => item.id) });
  const [saving, setSaving] = useState(false);
  const [uploadingSlot, setUploadingSlot] = useState<CreatorImageSlotKey | null>(null);
  const [cropFile, setCropFile] = useState<File | null>(null);
  const [cropSlot, setCropSlot] = useState<CreatorImageSlotKey>("representative");
  const [error, setError] = useState("");
  const [showResetPwd, setShowResetPwd] = useState(false);
  const [resetPwdMode, setResetPwdMode] = useState<"default" | "manual">("default");
  const [resetPwdValue, setResetPwdValue] = useState("");
  const [resettingPwd, setResettingPwd] = useState(false);
  const province = locations.find((item) => item.name === form.province);
  const city = province?.cities.find((item) => item.name === form.city);
  const activeTags = tags.filter((item) => item.status === "active" || creator.tags.some((tag) => tag.id === item.id));
  function toggleTag(tag: Tag) {
    setForm((current) => {
      if (current.tagIds.includes(tag.id)) return { ...current, tagIds: current.tagIds.filter((id) => id !== tag.id) };
      const categoryCount = activeTags.filter((item) => item.category === tag.category && current.tagIds.includes(item.id)).length;
      if (categoryCount >= 8) { setError(`“${tag.category}”最多选择8个标签`); return current; }
      return { ...current, tagIds: [...current.tagIds, tag.id] };
    });
  }
  async function upload(slot: CreatorImageSlotKey, file: File) {
    setUploadingSlot(slot); setError("");
    try {
      const body = new FormData(); body.append("creatorId", String(creator.id)); body.append("kind", slot); body.append("file", file);
      const response = await fetch("/api/admin/creator-image", { method: "POST", body });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) return setError(data.error || "图片上传失败");
      onSaved(data.creator);
    } finally {
      setUploadingSlot(null);
    }
  }
  async function clearImage(slot: CreatorImageSlot) {
    setError("");
    const { response, data } = await fetchJson("/api/admin/creators", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "updateImages",
        creatorId: creator.id,
        [slot.field]: "",
      }),
    });
    if (!response.ok) return setError(data.error || "清除图片失败");
    onSaved(data.creator);
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!form.noBookings && !form.busyPeriods.length) return setError("请填写其他活动日期，或选择近期无其他活动");
    setSaving(true); setError("");
    const { response, data } = await fetchJson("/api/admin/creators", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "updateDetails", creatorId: creator.id, ...form }) });
    setSaving(false);
    if (!response.ok) return setError(data.error || "保存失败");
    onSaved(data.creator); onClose();
  }
  async function resetPassword() {
    if (resetPwdMode === "manual" && (resetPwdValue.length < 8 || resetPwdValue.length > 72)) {
      return setError("手动密码需要8-72位字符");
    }
    setResettingPwd(true); setError("");
    const { response, data } = await fetchJson(`/api/admin/creators/${creator.id}/reset-password`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ mode: resetPwdMode, password: resetPwdMode === "manual" ? resetPwdValue : undefined }),
    });
    setResettingPwd(false);
    if (!response.ok) return setError(data.error || "重置失败");
    setShowResetPwd(false); setResetPwdValue("");
    alert(resetPwdMode === "default" ? "密码已重置为 12345678" : "密码已重置为手动设置的新密码");
  }
  return <><div className="dialog-backdrop" onMouseDown={onClose}><form className="admin-editor creator-management-dialog" onSubmit={save} onMouseDown={(event) => event.stopPropagation()}><header><div><p className="eyebrow">USER PROFILE</p><h2>{creator.brandName || creator.phone}</h2><p>UID {creator.id} · {creator.phone} · 邀请码 {creator.inviteCode}</p></div><button type="button" onClick={onClose} aria-label="关闭"><X /></button></header><div className="editor-scroll">
    <section className="admin-image-collection"><h3>图片资料</h3><div className="admin-image-grid">{creatorImageSlots.map((slot) => { const url = slot.getUrl(creator); return <article className="admin-image-card" key={slot.key}><div className="admin-image-preview">{url ? <Image src={url} alt={slot.label} fill sizes="240px" unoptimized /> : <ImagePlus size={24} />}</div><div className="admin-image-meta"><strong>{slot.label}</strong><span>{slot.hint}</span></div><div className="admin-image-actions"><label className="button secondary"><ImagePlus size={16} />{uploadingSlot === slot.key ? "上传中" : url ? "更换" : "上传"}<input type="file" accept=".jpg,.jpeg,.png,.webp" disabled={Boolean(uploadingSlot)} onChange={(event) => { const file = event.target.files?.[0]; event.currentTarget.value = ""; if (file) { setCropSlot(slot.key); setCropFile(file); } }} /></label><button className="button secondary" type="button" disabled={!url} onClick={() => void clearImage(slot)}>清除</button></div></article>; })}</div></section>
    <div className="form-grid two"><label className="field"><span>品牌/工作室名称</span><input value={form.brandName} onChange={(event) => setForm({ ...form, brandName: event.target.value })} maxLength={40} /></label><label className="field"><span>分级</span><select value={form.adminRating} onChange={(event) => setForm({ ...form, adminRating: event.target.value as CreatorRating })}><option value="">未分级</option><option value="excellent">优秀</option><option value="good">良好</option><option value="average">一般</option><option value="poor">差</option></select></label><label className="field"><span>省份</span><select value={form.province} onChange={(event) => setForm({ ...form, province: event.target.value, city: "", district: "" })}><option value="">请选择省份</option>{locations.map((item) => <option key={item.code}>{item.name}</option>)}</select></label><label className="field"><span>城市</span><select value={form.city} onChange={(event) => setForm({ ...form, city: event.target.value, district: "" })} disabled={!province}><option value="">请选择城市</option>{province?.cities.map((item) => <option key={item.code}>{item.name}</option>)}</select></label><label className="field span-two"><span>区</span><select value={form.district} onChange={(event) => setForm({ ...form, district: event.target.value })} disabled={!city}><option value="">请选择区</option>{city?.districts?.map((item) => <option key={item.code}>{item.name}</option>)}</select></label></div>
    <label className="field"><span>品牌或个人介绍</span><textarea rows={6} maxLength={2000} value={form.intro} onChange={(event) => setForm({ ...form, intro: event.target.value })} /></label><label className="field"><span>内部备注（用户不可见）</span><textarea rows={4} maxLength={500} value={form.adminNote} onChange={(event) => setForm({ ...form, adminNote: event.target.value })} /></label>
    <section className="admin-schedule-editor"><h3>其他活动日期</h3><label className="agreement"><input type="checkbox" checked={form.noBookings} onChange={(event) => setForm({ ...form, noBookings: event.target.checked, busyPeriods: event.target.checked ? [] : form.busyPeriods })} /><span>近期无其他活动（指TDE以外的活动）</span></label>{!form.noBookings ? <>{form.busyPeriods.map((period, index) => <div className="admin-period-row" key={`${index}-${period.startDate}`}><input type="date" value={period.startDate} onChange={(event) => setForm({ ...form, busyPeriods: form.busyPeriods.map((item, itemIndex) => itemIndex === index ? { ...item, startDate: event.target.value, endDate: item.endDate || event.target.value } : item) })} /><input type="date" value={period.endDate} min={period.startDate} onChange={(event) => setForm({ ...form, busyPeriods: form.busyPeriods.map((item, itemIndex) => itemIndex === index ? { ...item, endDate: event.target.value } : item) })} /><input value={period.note} maxLength={20} placeholder="活动说明" onChange={(event) => setForm({ ...form, busyPeriods: form.busyPeriods.map((item, itemIndex) => itemIndex === index ? { ...item, note: event.target.value } : item) })} /><button type="button" onClick={() => setForm({ ...form, busyPeriods: form.busyPeriods.filter((_, itemIndex) => itemIndex !== index) })} aria-label="删除日期"><Trash2 size={16} /></button></div>)}<button className="button secondary" type="button" onClick={() => setForm({ ...form, busyPeriods: [...form.busyPeriods, { startDate: "", endDate: "", note: "" }] })}><Plus size={16} />增加日期</button></> : null}</section>
    <section><h3>标签</h3>{tagCategoryNames.map((category) => <div className="admin-tag-category" key={category}><strong>{category}</strong><div>{activeTags.filter((tag) => tag.category === category).map((tag) => <button type="button" className={form.tagIds.includes(tag.id) ? "selected" : ""} key={tag.id} onClick={() => toggleTag(tag)}>{form.tagIds.includes(tag.id) ? <Check size={13} /> : null}{tag.label}</button>)}</div></div>)}</section>
    <section><h3>精准邀约</h3><div className="admin-opportunity-tags">{precisionInviteGoals.map((item) => <button type="button" className={form.precisionInviteGoals.includes(item) ? "selected" : ""} key={item} onClick={() => setForm({ ...form, precisionInviteGoals: form.precisionInviteGoals.includes(item) ? form.precisionInviteGoals.filter((value) => value !== item) : [...form.precisionInviteGoals, item] })}>{item}</button>)}</div><p className="field-help">合作目标</p><div className="admin-opportunity-tags">{precisionInviteScenes.map((item) => <button type="button" className={form.precisionInviteScenes.includes(item) ? "selected" : ""} key={item} onClick={() => setForm({ ...form, precisionInviteScenes: form.precisionInviteScenes.includes(item) ? form.precisionInviteScenes.filter((value) => value !== item) : [...form.precisionInviteScenes, item] })}>{item}</button>)}</div><p className="field-help">期待场景</p></section>
    <section><h3>品牌影响力（选填）</h3><div className="form-grid two"><label className="field"><span>小红书粉丝数</span><input type="number" min="0" step="1" value={form.xiaohongshuFollowers} onChange={(event) => setForm({ ...form, xiaohongshuFollowers: event.target.value })} /></label><label className="field"><span>小红书链接</span><input type="url" maxLength={300} value={form.xiaohongshuUrl} onChange={(event) => setForm({ ...form, xiaohongshuUrl: event.target.value })} placeholder="https://" /></label><label className="field"><span>抖音粉丝数</span><input type="number" min="0" step="1" value={form.douyinFollowers} onChange={(event) => setForm({ ...form, douyinFollowers: event.target.value })} /></label><label className="field"><span>抖音链接</span><input type="url" maxLength={300} value={form.douyinUrl} onChange={(event) => setForm({ ...form, douyinUrl: event.target.value })} placeholder="https://" /></label></div></section>
    <section><h3>合作意向</h3><div className="admin-opportunity-tags">{cooperationTypes.map((item) => <button type="button" className={form.opportunityTypes.includes(item) ? "selected" : ""} key={item} onClick={() => setForm({ ...form, opportunityTypes: form.opportunityTypes.includes(item) ? form.opportunityTypes.filter((value) => value !== item) : [...form.opportunityTypes, item] })}>{item}</button>)}</div><label className="agreement"><input type="checkbox" checked={form.opportunityOptIn} onChange={(event) => setForm({ ...form, opportunityOptIn: event.target.checked })} /><span>允许TDE联系并匹配合作机会</span></label></section>
    {error ? <p className="form-error">{error}</p> : null}</div><footer><button className="button secondary" type="button" onClick={() => setShowResetPwd(!showResetPwd)}>🔑 重置密码</button><div style={{flex:1}} /><button className="button secondary" type="button" onClick={onClose}>取消</button><button className="button primary" disabled={saving}>{saving ? "保存中" : "保存更新"}</button></footer>{showResetPwd ? <div style={{position:"absolute",bottom:60,left:20,right:20,background:QIDENG_COLORS.surface,border:`2px solid ${QIDENG_COLORS.ink}`,borderRadius:10,padding:16,zIndex:10}}><h4 style={{margin:"0 0 10px"}}>重置用户密码</h4><div style={{display:"flex",gap:10,marginBottom:10}}><label style={{flex:1}}><input type="radio" checked={resetPwdMode==="default"} onChange={()=>setResetPwdMode("default")} /> 默认密码 12345678</label><label style={{flex:1}}><input type="radio" checked={resetPwdMode==="manual"} onChange={()=>setResetPwdMode("manual")} /> 手动设置</label></div>{resetPwdMode==="manual" ? <input style={{width:"100%",marginBottom:10,padding:"8px 10px",border:`1px solid ${QIDENG_COLORS.line}`,borderRadius:6}} value={resetPwdValue} onChange={(e)=>setResetPwdValue(e.target.value)} placeholder="输入8-72位新密码" /> : null}<div style={{display:"flex",gap:10}}><button className="button primary" type="button" disabled={resettingPwd} onClick={resetPassword}>{resettingPwd?"重置中":"确认重置"}</button><button className="button secondary" type="button" onClick={()=>{setShowResetPwd(false);setResetPwdValue("")}}>取消</button></div></div> : null}</form></div>{cropFile ? <WorkImageCropDialog file={cropFile} text={text} onCancel={() => setCropFile(null)} onConfirm={(file) => { const slot = cropSlot; setCropFile(null); void upload(slot, file); }} /> : null}</>;
}

function hasRecentDuplicate(
  notifications: PlatformNotification[],
  creatorIds: number[],
  subject: string,
  body: string,
) {
  const cutoff = Date.now() - 7 * 86400000;
  return notifications.find(
    (notification) =>
      (parseDatabaseDate(notification.createdAt)?.getTime() || 0) >= cutoff &&
      notification.subject === subject.trim() &&
      notification.body === body.trim() &&
      notification.recipients.some((recipient) =>
        creatorIds.includes(recipient.id),
      ),
  );
}

function MessageComposeDialog({
  creatorIds,
  creators,
  notifications,
  source,
  filterSnapshot,
  onClose,
  onSent,
}: {
  creatorIds: number[];
  creators: CreatorProfile[];
  notifications: PlatformNotification[];
  source: "platform" | "creator_search";
  filterSnapshot?: Record<string, unknown>;
  onClose: () => void;
  onSent: (sent: number) => void;
}) {
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const recipients = creators.filter((creator) =>
    creatorIds.includes(creator.id),
  );
  async function send(event: FormEvent) {
    event.preventDefault();
    const duplicate = hasRecentDuplicate(
      notifications,
      creatorIds,
      subject,
      body,
    );
    const warning = duplicate
      ? `\n注意：近7天内已向部分接收者发送过相同内容。`
      : "";
    if (
      !window.confirm(
        `将向 ${recipients.length} 位用户发送通知。${warning}\n确认发送？`,
      )
    )
      return;
    setSending(true);
    setError("");
    const { response, data } = await fetchJson("/api/admin/messages", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        creatorIds,
        subject,
        body,
        source,
        filterSnapshot,
      }),
    });
    setSending(false);
    if (!response.ok) return setError(data.error || "平台通知发送失败");
    onSent(data.sent);
  }
  return (
    <div className="dialog-backdrop" onMouseDown={onClose}>
      <form
        className="admin-message-dialog"
        onSubmit={send}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button
          className="dialog-close"
          type="button"
          onClick={onClose}
          aria-label="关闭"
        >
          <X />
        </button>
        <p className="eyebrow">PLATFORM MESSAGE</p>
        <h2>通知已选用户</h2>
        <p>
          本次共 {recipients.length} 位：
          {recipients
            .slice(0, 4)
            .map(
              (creator) =>
                creator.brandName || creator.userName || creator.phone,
            )
            .join("、")}
          {recipients.length > 4 ? ` 等 ${recipients.length} 位` : ""}
        </p>
        <p className="field-help">站内通知会永久保存；已接通的新遇官会同时收到企业微信应用消息。未绑定或发送失败会记录在通知历史中，可稍后重试。</p>
        <label className="field">
          <span>通知标题</span>
          <input
            value={subject}
            onChange={(event) => setSubject(event.target.value)}
            maxLength={80}
            required
            autoFocus
          />
        </label>
        <label className="field">
          <span>通知正文</span>
          <textarea
            value={body}
            onChange={(event) => setBody(event.target.value)}
            maxLength={500}
            rows={4}
            required
          />
        </label>
        {error ? <p className="form-error">{error}</p> : null}
        <button className="button primary full" type="submit" disabled={sending}>
          {sending ? "发送中" : "发送"}
        </button>
      </form>
    </div>
  );
}

function TagsAdminView({
  tags,
  creators,
  showToast,
  onRefresh,
}: {
  tags: Tag[];
  creators: CreatorProfile[];
  showToast: (message: string) => void;
  onRefresh: () => void;
}) {
  const [labels, setLabels] = useState<Record<string, string>>({});
  const [precisionFilters, setPrecisionFilters] = useState({
    goal: "",
    scene: "",
    xiaohongshuFollowersMin: "",
    douyinFollowersMin: "",
    xiaohongshuLinkStatus: "",
    douyinLinkStatus: "",
  });
  const creatorTags = tags.filter((tag) => tagCategoryNames.includes(tag.category));
  const active = creatorTags.filter((tag) => tag.status === "active");
  const pending = creatorTags.filter((tag) => tag.status === "pending");
  const categories = tagCategoryNames;
  const precisionCreators = creators.filter((creator) => {
    if (precisionFilters.goal && !creator.precisionInviteGoals.includes(precisionFilters.goal)) return false;
    if (precisionFilters.scene && !creator.precisionInviteScenes.includes(precisionFilters.scene)) return false;
    if (precisionFilters.xiaohongshuFollowersMin && (creator.xiaohongshuFollowers == null || creator.xiaohongshuFollowers < Number(precisionFilters.xiaohongshuFollowersMin))) return false;
    if (precisionFilters.douyinFollowersMin && (creator.douyinFollowers == null || creator.douyinFollowers < Number(precisionFilters.douyinFollowersMin))) return false;
    if (precisionFilters.xiaohongshuLinkStatus === "filled" && !creator.xiaohongshuUrl) return false;
    if (precisionFilters.xiaohongshuLinkStatus === "empty" && creator.xiaohongshuUrl) return false;
    if (precisionFilters.douyinLinkStatus === "filled" && !creator.douyinUrl) return false;
    if (precisionFilters.douyinLinkStatus === "empty" && creator.douyinUrl) return false;
    return true;
  });
  async function downloadPrecisionCreators() {
    const response = await fetch("/api/admin/export", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ creatorIds: precisionCreators.map((creator) => creator.id) }),
    });
    if (!response.ok) return showToast("精准邀约资料下载失败");
    const blob = await response.blob();
    const result = await saveBlobWithPicker(
      blob,
      `TDE精准邀约资料_${new Date().toISOString().slice(0, 10)}.zip`,
      "application/zip",
    );
    if (result === "cancelled") showToast("已取消下载");
  }
  async function create(event: FormEvent, category: string) {
    event.preventDefault();
    const label = labels[category] || "";
    const { response, data } = await fetchJson("/api/admin/tags", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ label, category }),
    });
    if (response.ok) {
      setLabels((current) => ({ ...current, [category]: "" }));
      showToast(`已新增标签“${data.tag.label}”`);
      onRefresh();
    } else showToast(data.error || "标签新增失败");
  }
  async function retire(tag: Tag) {
    if (
      !window.confirm(
        `确认将标签“${tag.label}”从公共标签库下架？\n已使用该标签的用户会保留历史记录。`,
      )
    )
      return;
    const { response, data } = await fetchJson("/api/admin/tags", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: tag.id }),
    });
    if (response.ok) {
      showToast(`标签“${tag.label}”已下架`);
      onRefresh();
    } else showToast(data.error || "标签下架失败");
  }
  async function review(
    id: number,
    status: "active" | "archived",
    replacementTagId?: number,
  ) {
    const { response } = await fetchJson("/api/admin/tags", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id, status, replacementTagId }),
    });
    if (response.ok) {
      showToast(
        status === "active"
          ? "标签已通过并进入公共标签库"
          : "标签已驳回并通知用户",
      );
      onRefresh();
    }
  }
  return (
    <div className="admin-stack">
      <section className="admin-section-block">
        <div className="admin-section-heading">
          <div>
            <p className="eyebrow">REVIEW QUEUE</p>
            <h2>待复核自定义标签</h2>
          </div>
          <span>{pending.length} 条</span>
        </div>
        <div className="review-list">
          {pending.length ? (
            pending.map((tag) => (
              <article key={tag.id}>
                <div>
                  <strong>{tag.label}</strong>
                  <span>{tag.category}</span>
                </div>
                <select defaultValue="" id={`replacement-${tag.id}`}>
                  <option value="">不分配替代标签</option>
                  {active
                    .filter((item) => item.category === tag.category)
                    .map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.label}
                      </option>
                    ))}
                </select>
                <button
                  className="approve"
                  type="button"
                  onClick={() => review(tag.id, "active")}
                >
                  <Check size={16} />
                  通过
                </button>
                <button
                  className="reject"
                  type="button"
                  onClick={() => {
                    const select = document.getElementById(
                      `replacement-${tag.id}`,
                    ) as HTMLSelectElement;
                    review(
                      tag.id,
                      "archived",
                      Number(select.value) || undefined,
                    );
                  }}
                >
                  <X size={16} />
                  驳回
                </button>
              </article>
            ))
          ) : (
            <p className="empty-note">当前没有待复核标签。</p>
          )}
        </div>
      </section>
      <section className="admin-section-block precision-invite-admin">
        <div className="admin-section-heading">
          <div>
            <p className="eyebrow">PRECISION INVITE</p>
            <h2>精准邀约资料</h2>
            <p>查看主理人填写的合作目标、期待场景和品牌影响力，可按条件筛选并下载当前结果。</p>
          </div>
          <button className="button secondary" type="button" disabled={!precisionCreators.length} onClick={() => void downloadPrecisionCreators()}>
            <Download size={17} />
            下载当前结果
          </button>
        </div>
        <div className="filter-grid">
          <label><span>合作目标</span><select value={precisionFilters.goal} onChange={(event) => setPrecisionFilters({ ...precisionFilters, goal: event.target.value })}><option value="">全部合作目标</option>{precisionInviteGoals.map((item) => <option key={item}>{item}</option>)}</select></label>
          <label><span>期待场景</span><select value={precisionFilters.scene} onChange={(event) => setPrecisionFilters({ ...precisionFilters, scene: event.target.value })}><option value="">全部期待场景</option>{precisionInviteScenes.map((item) => <option key={item}>{item}</option>)}</select></label>
          <label><span>小红书粉丝数 ≥</span><input type="number" min="0" step="1" value={precisionFilters.xiaohongshuFollowersMin} onChange={(event) => setPrecisionFilters({ ...precisionFilters, xiaohongshuFollowersMin: event.target.value })} /></label>
          <label><span>抖音粉丝数 ≥</span><input type="number" min="0" step="1" value={precisionFilters.douyinFollowersMin} onChange={(event) => setPrecisionFilters({ ...precisionFilters, douyinFollowersMin: event.target.value })} /></label>
          <label><span>小红书链接</span><select value={precisionFilters.xiaohongshuLinkStatus} onChange={(event) => setPrecisionFilters({ ...precisionFilters, xiaohongshuLinkStatus: event.target.value })}><option value="">不限</option><option value="filled">已填写</option><option value="empty">未填写</option></select></label>
          <label><span>抖音链接</span><select value={precisionFilters.douyinLinkStatus} onChange={(event) => setPrecisionFilters({ ...precisionFilters, douyinLinkStatus: event.target.value })}><option value="">不限</option><option value="filled">已填写</option><option value="empty">未填写</option></select></label>
        </div>
        <div className="result-toolbar"><div><h3>匹配用户</h3><span>{precisionCreators.length} 位</span></div></div>
        <div className="data-table-wrap">
          <table className="data-table">
            <thead><tr><th>用户/品牌</th><th>合作目标</th><th>期待场景</th><th>小红书</th><th>抖音</th></tr></thead>
            <tbody>{precisionCreators.map((creator) => <tr key={creator.id}><td><strong>{creator.brandName || creator.userName || creator.phone}</strong><span>UID {creator.id} · {creator.phone}</span></td><td>{creator.precisionInviteGoals.join("、") || "未填写"}</td><td>{creator.precisionInviteScenes.join("、") || "未填写"}</td><td><strong>{formatFollowerCount(creator.xiaohongshuFollowers)}</strong>{creator.xiaohongshuUrl ? <a href={creator.xiaohongshuUrl} target="_blank" rel="noreferrer">查看链接</a> : <span>未填写链接</span>}</td><td><strong>{formatFollowerCount(creator.douyinFollowers)}</strong>{creator.douyinUrl ? <a href={creator.douyinUrl} target="_blank" rel="noreferrer">查看链接</a> : <span>未填写链接</span>}</td></tr>)}</tbody>
          </table>
        </div>
        {precisionCreators.length ? null : <p className="empty-note">没有符合条件的精准邀约资料。</p>}
      </section>
      <section className="admin-section-block">
        <div className="admin-section-heading">
          <div>
            <p className="eyebrow">PUBLIC TAG LIBRARY</p>
            <h2>公共标签库</h2>
            <p>每个分类可直接新增；下架标签不会删除用户历史数据。</p>
          </div>
          <span>{active.length} 个标签</span>
        </div>
        <div className="tag-library">
          {categories.map((item) => (
            <section key={item}>
              <h3>{item}</h3>
              <div className="tag-library-items">
                {active
                  .filter((tag) => tag.category === item)
                  .map((tag) => (
                    <span key={tag.id}>
                      {tag.label}
                      <button
                        type="button"
                        onClick={() => retire(tag)}
                        aria-label={`下架标签 ${tag.label}`}
                      >
                        <X size={12} />
                      </button>
                    </span>
                  ))}
              </div>
              <form
                className="tag-category-add"
                onSubmit={(event) => create(event, item)}
              >
                <input
                  value={labels[item] || ""}
                  onChange={(event) =>
                    setLabels((current) => ({
                      ...current,
                      [item]: event.target.value,
                    }))
                  }
                  maxLength={20}
                  placeholder="增加标签"
                  required
                />
                <button type="submit" disabled={!labels[item]?.trim()}>
                  <Plus size={15} />
                  新增
                </button>
              </form>
            </section>
          ))}
        </div>
      </section>
    </div>
  );
}

function InvitesView({ inviteCodes, creators, settings, showToast, onRefresh }: {
  inviteCodes: AdminOverview["inviteCodes"];
  creators: CreatorProfile[];
  settings: PlatformSettings;
  showToast: (message: string) => void;
  onRefresh: () => void;
}) {
  const [code, setCode] = useState("");
  const [sharing, setSharing] = useState(settings.inviteSharing);
  const [inviteContactText, setInviteContactText] = useState(settings.inviteContactText);
  const [websiteContactText, setWebsiteContactText] = useState(settings.contactText);
  const [saving, setSaving] = useState(false);
  const [savingContact, setSavingContact] = useState(false);
  async function create(event: FormEvent) {
    event.preventDefault();
    const { response, data } = await fetchJson("/api/admin/invites", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code }),
    });
    if (!response.ok) return showToast(data.error || "邀请码创建失败");
    setCode("");
    showToast("平台邀请码已创建");
    onRefresh();
  }
  async function toggle(id: number, active: boolean) {
    const { response } = await fetchJson("/api/admin/invites", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id, active }),
    });
    if (response.ok) {
      showToast(active ? "邀请码已启用" : "邀请码已停用");
      onRefresh();
    }
  }
  async function saveSharing(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    const { response, data } = await fetchJson("/api/admin/settings", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ inviteSharing: sharing }),
    });
    setSaving(false);
    if (!response.ok) return showToast(data.error || "邀请码文案保存失败");
    setSharing(data.settings.inviteSharing);
    showToast("邀请码文案已保存");
    onRefresh();
  }
  async function saveInviteContactText(event: FormEvent) {
    event.preventDefault();
    setSavingContact(true);
    const { response, data } = await fetchJson("/api/admin/settings", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ inviteContactText: inviteContactText }),
    });
    setSavingContact(false);
    if (!response.ok) return showToast(data.error || "保存失败");
    setInviteContactText(data.settings.inviteContactText);
    showToast("联系文字已保存");
    onRefresh();
  }
  async function saveWebsiteContactText(event: FormEvent) {
    event.preventDefault();
    setSavingContact(true);
    const { response, data } = await fetchJson("/api/admin/settings", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ contactText: websiteContactText }),
    });
    setSavingContact(false);
    if (!response.ok) return showToast(data.error || "保存失败");
    setWebsiteContactText(data.settings.contactText);
    showToast("网站联系信息已保存");
    onRefresh();
  }
  const sampleCode = creators[0]?.inviteCode || "ABCD1234";
  const preview = sharing.template.replaceAll("{邀请码}", sampleCode).replaceAll("{加入网址}", sharing.joinUrl);
  const relationshipGroups = [
    ...creators.map((creator) => ({
      key: creator.inviteCode,
      name: creator.brandName || creator.userName || creator.phone || `UID ${creator.id}`,
      code: creator.inviteCode,
      members: creators.filter((member) => member.invitedByCreatorId === creator.id),
    })).filter((group) => group.members.length),
    ...inviteCodes.map((invite) => ({
      key: `platform-${invite.id}`,
      name: "平台邀请码",
      code: invite.code,
      members: creators.filter((member) => member.registeredWithCode === invite.code),
    })).filter((group) => group.members.length),
  ].sort((a, b) => b.members.length - a.members.length);
  return <div className="admin-stack">
    <form className="inline-admin-form invite-admin-form" onSubmit={create}><div><h2>新增平台邀请码</h2><p>留空可随机生成，也可以填写4至8位字母或数字。邀请码只验证有效性，不限制使用次数。</p></div><input value={code} onChange={(event) => setCode(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8))} placeholder="留空随机生成" /><button className="button primary"><Plus size={17} />生成邀请码</button></form>
    <section className="admin-section-block"><div className="admin-section-heading"><div><p className="eyebrow">PLATFORM INVITES</p><h2>平台邀请码</h2></div><span>{inviteCodes.filter((item) => item.active).length} 个启用</span></div><div className="invite-admin-list">{inviteCodes.map((item) => <article key={item.id}><div><strong>{item.code}</strong><span>{item.source === "platform" ? "平台邀请码" : item.source} · {formatShanghaiDateTime(item.createdAt)}</span></div><span className={item.active ? "clear" : "status"}>{item.active ? "已启用" : "已停用"}</span><button type="button" onClick={() => toggle(item.id, !item.active)}>{item.active ? "停用" : "重新启用"}</button></article>)}</div></section>
    <section className="admin-section-block"><div className="admin-section-heading"><div><p className="eyebrow">CREATOR INVITES</p><h2>TDE新遇官固定邀请码</h2></div><span>随账号自动生成</span></div><p className="empty-note">新遇官固定邀请码显示在用户资料中，不限制邀请次数。停用新遇官或其所属子管理员时，该邀请码立即失效。</p></section>
    <form className="admin-settings-form invite-sharing-settings" onSubmit={saveSharing}><section><div className="admin-section-heading"><div><p className="eyebrow">INVITE COPY</p><h2>邀请码文案管理</h2><p>模板支持 &#123;邀请码&#125; 和 &#123;加入网址&#125;，复制时自动替换为当前用户信息。</p></div></div><div className="form-grid two"><label className="field"><span>模块标题</span><input value={sharing.heading} onChange={(event) => setSharing({ ...sharing, heading: event.target.value })} maxLength={40} /></label><label className="field"><span>按钮文字</span><input value={sharing.buttonText} onChange={(event) => setSharing({ ...sharing, buttonText: event.target.value })} maxLength={20} /></label><label className="field span-two"><span>有效性说明</span><input value={sharing.description} onChange={(event) => setSharing({ ...sharing, description: event.target.value })} maxLength={120} /></label><label className="field"><span>复制按钮图标</span><select value={sharing.buttonIcon} onChange={(event) => setSharing({ ...sharing, buttonIcon: event.target.value })}>{allowedContentIcons.filter((item) => ["Clipboard", "Copy", "Send"].includes(item)).map((icon) => <option key={icon}>{icon}</option>)}</select></label><label className="field"><span>加入网址</span><input type="url" value={sharing.joinUrl} onChange={(event) => setSharing({ ...sharing, joinUrl: event.target.value })} maxLength={240} /></label><label className="field span-two"><span>完整复制模板</span><textarea rows={8} value={sharing.template} onChange={(event) => setSharing({ ...sharing, template: event.target.value })} maxLength={800} /></label></div><div className="invite-copy-preview"><span>实时预览</span><pre>{preview}</pre></div></section><button className="button primary" disabled={saving}>{saving ? "保存中" : "保存邀请码文案"}</button></form>
    <form className="admin-settings-form invite-sharing-settings" onSubmit={saveInviteContactText}><section><div className="admin-section-heading"><div><p className="eyebrow">CONTACT TEXT</p><h2>申请页联系文字</h2><p>显示在申请表单邀请码输入框下方，引导用户联系获取邀请码。</p></div></div><label className="field"><span>联系文字内容</span><textarea rows={3} value={inviteContactText} onChange={(event) => setInviteContactText(event.target.value)} maxLength={200} /></label></section><button className="button primary" disabled={savingContact}>{savingContact ? "保存中" : "保存联系文字"}</button></form>
    <form className="admin-settings-form invite-sharing-settings" onSubmit={saveWebsiteContactText}><section><div className="admin-section-heading"><div><p className="eyebrow">WEBSITE CONTACT</p><h2>TDE 网站联系信息</h2><p>主理人端“联系 TDE”会读取这里的正式文案，不影响邀请码帮助文案。</p></div></div><label className="field"><span>网站联系文案</span><textarea rows={5} value={websiteContactText} onChange={(event) => setWebsiteContactText(event.target.value)} maxLength={300} /></label></section><button className="button primary" disabled={savingContact}>{savingContact ? "保存中" : "保存网站联系信息"}</button></form>
    <section className="admin-section-block"><div className="admin-section-heading"><div><p className="eyebrow">INVITATION RELATIONSHIPS</p><h2>邀请关系</h2><p>按邀请来源归组，组内按注册时间从早到晚显示。</p></div><span>{relationshipGroups.reduce((sum, group) => sum + group.members.length, 0)} 条关系</span></div><div className="invite-relationship-list">{relationshipGroups.length ? relationshipGroups.map((group) => <details key={group.key} open><summary><div><strong>{group.name}</strong><span>邀请码 {group.code}</span></div><b>{group.members.length} 位</b></summary><div>{[...group.members].sort((a, b) => (parseDatabaseDate(a.createdAt)?.getTime() || 0) - (parseDatabaseDate(b.createdAt)?.getTime() || 0)).map((member, index) => <article key={member.id}><i>{index + 1}</i><div><strong>{member.brandName || member.userName || member.phone}</strong><span>UID {member.id} · {member.phone}</span></div><time>{formatShanghaiDateTime(member.createdAt)}</time></article>)}</div></details>) : <p className="empty-note">还没有邀请码使用关系。</p>}</div></section>
  </div>;
}

function MessagesView({ creators, notifications, showToast, onRefresh }: {
  creators: CreatorProfile[];
  notifications: PlatformNotification[];
  showToast: (message: string) => void;
  onRefresh: () => void;
}) {
  const [selected, setSelected] = useState<number[]>([]);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [retrying, setRetrying] = useState<number | null>(null);

  async function send(event: FormEvent) {
    event.preventDefault();
    const duplicate = hasRecentDuplicate(notifications, selected, subject, body);
    const warning = duplicate ? "\n注意：近7天内已向部分接收者发送过相同内容。" : "";
    if (!window.confirm(`将向 ${selected.length} 位新遇官发送站内通知，并向已接通账号推送企业微信消息。${warning}\n确认发送？`)) return;
    setSending(true);
    const { response, data } = await fetchJson("/api/admin/messages", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ creatorIds: selected, subject, body, source: "platform" }),
    });
    setSending(false);
    if (!response.ok) return showToast(data.error || "平台通知发送失败");
    setSubject("");
    setBody("");
    setSelected([]);
    showToast(`站内通知 ${data.sent} 条，企业微信成功 ${data.wecom?.sent || 0} 条`);
    onRefresh();
  }

  async function retry(notification: PlatformNotification) {
    setRetrying(notification.id);
    const { response, data } = await fetchJson("/api/admin/messages", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ campaignId: notification.id }),
    });
    setRetrying(null);
    if (!response.ok) return showToast(data.error || "企业微信消息重试失败");
    showToast(`重试完成：成功 ${data.wecom?.sent || 0} 条，待处理 ${Number(data.wecom?.failed || 0) + Number(data.wecom?.unbound || 0)} 条`);
    onRefresh();
  }

  return <div className="admin-stack">
    <div className="messages-admin">
      <section className="recipient-panel">
        <div className="admin-section-heading"><div><p className="eyebrow">RECIPIENTS</p><h2>选择接收新遇官</h2></div><button type="button" onClick={() => setSelected(selected.length === creators.length ? [] : creators.map((creator) => creator.id))}>{selected.length === creators.length ? "取消全选" : "选择全部"}</button></div>
        <div className="recipient-list">{creators.map((creator) => <label key={creator.id}><input type="checkbox" checked={selected.includes(creator.id)} onChange={() => setSelected((current) => current.includes(creator.id) ? current.filter((id) => id !== creator.id) : [...current, creator.id])} /><span><strong>{creator.brandName || creator.userName}</strong><i>{creator.phone} · {creator.city} · {wecomBindingStatusLabel(creator.wecomBinding.status)}</i></span></label>)}</div>
      </section>
      <form className="message-compose" onSubmit={send}>
        <p className="eyebrow">COMPOSE</p><h2>发送平台通知</h2>
        <p>站内信作为完整记录；企业微信应用消息负责及时提醒。短信通知已停用。</p>
        <label className="field"><span>通知标题</span><input value={subject} onChange={(event) => setSubject(event.target.value)} maxLength={80} required /></label>
        <label className="field"><span>通知正文</span><textarea value={body} onChange={(event) => setBody(event.target.value)} maxLength={500} rows={8} required /></label>
        <div className="compose-summary"><Bell size={18} /><span>将发送给 {selected.length} 位新遇官，其中 {creators.filter((creator) => selected.includes(creator.id) && creator.wecomBinding.status === "approved").length} 位已接通企业微信</span></div>
        <button className="button primary full" disabled={sending || !selected.length}>{sending ? "发送中" : "发送站内信和企业微信提醒"}</button>
      </form>
    </div>
    <section className="admin-section-block">
      <div className="admin-section-heading"><div><p className="eyebrow">SEND HISTORY</p><h2>平台通知记录</h2></div><span>{notifications.length} 个批次</span></div>
      <div className="notification-history">{notifications.length ? notifications.map((notification) => <details key={notification.id}>
        <summary><div><strong>{notification.subject}</strong><span>{notification.source === "creator_search" ? "寻人筛选" : "平台通知"} · 管理员 {notification.sender} · {formatShanghaiDateTime(notification.createdAt)}</span></div><span>站内已读 {notification.readCount}/{notification.sentCount} · 企业微信 {notification.wecomSentCount}/{notification.wecomRequestedCount}{notification.wecomFailedCount ? ` · 失败 ${notification.wecomFailedCount}` : ""}{notification.wecomUnboundCount ? ` · 未接通 ${notification.wecomUnboundCount}` : ""}</span></summary>
        <p>{notification.body}</p>
        {notification.source === "creator_search" ? <p className="filter-snapshot">筛选条件：{Object.entries(notification.filterSnapshot).filter(([, value]) => Array.isArray(value) ? value.length : Boolean(value)).map(([key, value]) => `${key}=${Array.isArray(value) ? value.join(",") : value}`).join("；") || "未限定条件"}</p> : null}
        <div className="notification-recipients">{notification.recipients.map((recipient) => <span key={recipient.id}>{recipient.name} · 站内{recipient.readAt ? "已读" : "未读"} · 企业微信{wecomDeliveryStatusLabel(recipient.wecomStatus)}{recipient.wecomError ? `（${recipient.wecomError}）` : ""}</span>)}</div>
        {notification.wecomSentCount < notification.sentCount ? <button className="button secondary" type="button" disabled={retrying === notification.id} onClick={() => void retry(notification)}>{retrying === notification.id ? "重试中" : "重试企业微信提醒"}</button> : null}
      </details>) : <p className="empty-note">还没有发送记录。</p>}</div>
    </section>
  </div>;
}

function wecomDeliveryStatusLabel(status: PlatformNotification["recipients"][number]["wecomStatus"]) {
  if (!status) return "待发送";
  return { pending: "发送中", sent: "已送达", failed: "失败", unbound: "未绑定", disabled: "已停用", not_configured: "未配置" }[status];
}

function QuotaEditor({ creator, mode, showToast, onRefresh }: {
  creator: CreatorProfile;
  mode: CopyMode;
  showToast: (message: string) => void;
  onRefresh: () => void;
}) {
  const initial = mode === "free" ? creator.copyQuota.freeLimit : creator.copyQuota.upgradeLimit;
  const used = mode === "free" ? creator.copyQuota.freeUsed : creator.copyQuota.upgradeUsed;
  const [value, setValue] = useState(String(initial));
  const [saving, setSaving] = useState(false);
  useEffect(() => setValue(String(initial)), [initial]);
  async function save() {
    setSaving(true);
    const { response, data } = await fetchJson("/api/admin/writer", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ creatorId: creator.id, mode, limit: Number(value) }),
    });
    setSaving(false);
    if (!response.ok) return showToast(data.error || "额度保存失败");
    showToast(`${mode === "free" ? "免费" : "升级"}总额度已更新`);
    onRefresh();
  }
  return <div className="quota-editor"><span>{mode === "free" ? "免费" : "升级"} · 已用 {used}</span><div><input type="number" min="0" max="10000" value={value} onChange={(event) => setValue(event.target.value)} aria-label={`${creator.brandName || creator.userName}${mode === "free" ? "免费" : "升级"}总额度`} /><button type="button" onClick={save} disabled={saving}>{saving ? "保存中" : "保存"}</button></div></div>;
}

function WriterAdminView({ overview, showToast, onRefresh }: {
  overview: AdminOverview;
  showToast: (message: string) => void;
  onRefresh: () => void;
}) {
  const [selected, setSelected] = useState<CreatorProfile | null>(null);
  const [phone, setPhone] = useState("");
  const [appliedPhone, setAppliedPhone] = useState("");
  const creators = appliedPhone ? overview.creators.filter((creator) => creator.phone?.includes(appliedPhone)) : overview.creators;
  return <div className="admin-stack"><WriterUiSettingsEditor settings={overview.settings} showToast={showToast} onRefresh={onRefresh} /><section className="admin-section-block"><div className="admin-section-heading"><div><p className="eyebrow">COCOC WRITER</p><h2>用户资料与生成额度</h2><p>按单个用户汇总资料、图片、标签、活动计划和文章记录。</p></div><span>{overview.generations.filter((item) => item.status === "completed").length} 次成功生成</span></div><form className="writer-phone-search" onSubmit={(event) => { event.preventDefault(); setAppliedPhone(phone.trim()); }}><label><span>手机号</span><input inputMode="numeric" value={phone} onChange={(event) => setPhone(event.target.value.replace(/\D/g, "").slice(0, 11))} placeholder="支持完整或部分手机号" /></label><button className="button primary"><Search size={17} />搜索</button><button type="button" className="button secondary" onClick={() => { setPhone(""); setAppliedPhone(""); }}>清空条件</button></form><div className="data-table-wrap"><table className="data-table writer-admin-table"><thead><tr><th>用户/品牌</th><th>资料状态</th><th>普通额度</th><th>加强额度</th><th>生成记录</th><th>完整档案</th></tr></thead><tbody>{creators.map((creator) => { const records = overview.generations.filter((item) => item.creatorId === creator.id); const missing = writerMissingStep(creator); return <tr key={creator.id}><td><strong>{creator.brandName || creator.userName || "未命名"}</strong><span>UID {creator.id} · {creator.phone}</span></td><td><strong>{missing ? `待完成${missing}` : "可生成文章"}</strong><span>{creator.tags.length} 个标签 · {creator.workUrls.length} 张代表图</span></td><td><QuotaEditor creator={creator} mode="free" showToast={showToast} onRefresh={onRefresh} /></td><td><QuotaEditor creator={creator} mode="upgrade" showToast={showToast} onRefresh={onRefresh} /></td><td><strong>{records.filter((item) => item.status === "completed").length} 次成功</strong><span>{records.filter((item) => item.status === "processing").length} 次处理中 · {records.filter((item) => item.status === "failed").length} 次失败</span></td><td><button className="table-notify-button" type="button" onClick={() => setSelected(creator)}>查看</button></td></tr>; })}</tbody></table></div>{creators.length ? null : <p className="empty-note">未找到对应用户。</p>}</section>{selected ? <CreatorDossierDialog creator={selected} records={overview.generations.filter((item) => item.creatorId === selected.id)} onClose={() => setSelected(null)} /> : null}</div>;
}

const writerStageKeys: CopyGenerationStage[] = ["queued", "analyzing", "writing", "checking", "retrying", "completed", "failed"];

function WriterUiSettingsEditor({ settings, showToast, onRefresh }: {
  settings: PlatformSettings;
  showToast: (message: string) => void;
  onRefresh: () => void;
}) {
  const [form, setForm] = useState(settings.writerUi);
  const [saving, setSaving] = useState(false);
  useEffect(() => setForm(settings.writerUi), [settings.writerUi]);
  function change(key: keyof typeof form, value: string | string[]) {
    setForm((current) => ({ ...current, [key]: value }));
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    const { response, data } = await fetchJson("/api/admin/settings", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ writerUi: form }),
    });
    setSaving(false);
    if (!response.ok) return showToast(data.error || "智能体提示保存失败");
    setForm(data.settings.writerUi);
    showToast("智能体状态与提示已保存");
    onRefresh();
  }
  return <form className="admin-settings-form writer-ui-settings" onSubmit={save}><section><div className="admin-section-heading"><div><p className="eyebrow">WRITER EXPERIENCE</p><h2>生成文章页面与等待提示</h2><p>这些文字会即时同步到用户端；Tips按每行顺序轮换，删除一行即停用该条。</p></div></div><div className="form-grid two"><label className="field"><span>页面标题</span><input value={form.pageTitle} onChange={(event) => change("pageTitle", event.target.value)} maxLength={40} /></label><label className="field"><span>生成按钮文字</span><input value={form.generateButton} onChange={(event) => change("generateButton", event.target.value)} maxLength={20} /></label><label className="field"><span>普通生成名称</span><input value={form.freeTitle} onChange={(event) => change("freeTitle", event.target.value)} maxLength={30} /></label><label className="field"><span>加强生成名称</span><input value={form.upgradeTitle} onChange={(event) => change("upgradeTitle", event.target.value)} maxLength={30} /></label><label className="field span-two"><span>页面说明</span><textarea rows={3} value={form.pageDescription} onChange={(event) => change("pageDescription", event.target.value)} maxLength={180} /></label><label className="field"><span>处理中按钮文字</span><input value={form.processingButton} onChange={(event) => change("processingButton", event.target.value)} maxLength={20} /></label><label className="field"><span>复制按钮文字</span><input value={form.copyButton} onChange={(event) => change("copyButton", event.target.value)} maxLength={20} /></label><label className="field"><span>查看结果按钮文字</span><input value={form.viewResultButton} onChange={(event) => change("viewResultButton", event.target.value)} maxLength={20} /></label></div></section><section><h2>任务状态文字</h2><div className="form-grid two">{writerStageKeys.map((stage) => <label className="field" key={stage}><span>{stage}</span><input value={form.statusLabels[stage]} onChange={(event) => setForm((current) => ({ ...current, statusLabels: { ...current.statusLabels, [stage]: event.target.value } }))} maxLength={60} /></label>)}</div><label className="field"><span>等待时间说明</span><input value={form.waitMessage} onChange={(event) => change("waitMessage", event.target.value)} maxLength={160} /></label><label className="field"><span>离开页面说明</span><input value={form.leaveMessage} onChange={(event) => change("leaveMessage", event.target.value)} maxLength={160} /></label><label className="field"><span>最新文案红色提示</span><input value={form.expiryWarning} onChange={(event) => change("expiryWarning", event.target.value)} maxLength={200} /></label><label className="field"><span>轮换 Tips（每行一条）</span><textarea rows={6} value={form.tips.join("\n")} onChange={(event) => change("tips", event.target.value.split("\n"))} maxLength={2000} /></label></section><section><h2>完成与失败提示</h2><div className="form-grid two"><label className="field"><span>完成弹窗标题</span><input value={form.successDialogTitle} onChange={(event) => change("successDialogTitle", event.target.value)} maxLength={60} /></label><label className="field"><span>完成弹窗正文</span><input value={form.successDialogBody} onChange={(event) => change("successDialogBody", event.target.value)} maxLength={200} /></label><label className="field"><span>完成通知标题</span><input value={form.completedNotificationSubject} onChange={(event) => change("completedNotificationSubject", event.target.value)} maxLength={80} /></label><label className="field"><span>失败通知标题</span><input value={form.failedNotificationSubject} onChange={(event) => change("failedNotificationSubject", event.target.value)} maxLength={80} /></label><label className="field span-two"><span>完成通知正文（支持 &#123;模式&#125;、&#123;标题&#125;）</span><textarea rows={3} value={form.completedNotificationBody} onChange={(event) => change("completedNotificationBody", event.target.value)} maxLength={300} /></label><label className="field span-two"><span>失败通知正文（支持 &#123;模式&#125;）</span><textarea rows={3} value={form.failedNotificationBody} onChange={(event) => change("failedNotificationBody", event.target.value)} maxLength={300} /></label></div></section><button className="button primary" disabled={saving}>{saving ? "保存中" : "保存文章生成提示"}</button></form>;
}

function CreatorDossierDialog({ creator, records, onClose }: {
  creator: CreatorProfile;
  records: AdminOverview["generations"];
  onClose: () => void;
}) {
  const categories = [
    ...(creator.boothDescription ? [`展位描述：${creator.boothDescription}`] : []),
    ...new Set(creator.tags.map((tag) => tag.category)),
  ];
  return <div className="dialog-backdrop" onMouseDown={onClose}><section className="creator-dossier" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}><header><div><p className="eyebrow">CREATOR DOSSIER</p><h2>{creator.brandName || creator.userName || "用户完整档案"}</h2><span>UID {creator.id} · {creator.phone} · 微信 {creator.wechat || "未填"}</span></div><button type="button" onClick={onClose} aria-label="关闭"><X /></button></header><div className="dossier-scroll"><section className="dossier-media"><div>{creator.logoUrl ? <Image src={creator.logoUrl} alt="品牌标识" fill sizes="110px" unoptimized /> : <Users />}</div><div>{creator.workUrls[0] ? <Image src={creator.workUrls[0]} alt="代表图片" fill sizes="220px" unoptimized /> : <span>未上传代表图片</span>}</div></section><section><h3>基础资料</h3><p>{creator.intro || "未填写品牌介绍"}</p><dl><div><dt>用户名称</dt><dd>{creator.userName || "未填"}</dd></div><div><dt>所在城市</dt><dd>{creator.province} {creator.city}</dd></div><div><dt>社交账号</dt><dd>{creator.socialAccount || "未填"}</dd></div><div><dt>注册邀请码</dt><dd>{creator.registeredWithCode}</dd></div><div><dt>邀请来源</dt><dd>{creator.invitedByName}</dd></div><div><dt>注册时间</dt><dd>{formatShanghaiDateTime(creator.createdAt)}</dd></div></dl></section><section><h3>精准邀约与品牌影响力</h3><dl><div><dt>合作目标</dt><dd>{creator.precisionInviteGoals.join("、") || "未填写"}</dd></div><div><dt>期待场景</dt><dd>{creator.precisionInviteScenes.join("、") || "未填写"}</dd></div><div><dt>小红书</dt><dd>{formatFollowerCount(creator.xiaohongshuFollowers)}{creator.xiaohongshuUrl ? <a href={creator.xiaohongshuUrl} target="_blank" rel="noreferrer"> · 查看链接</a> : ""}</dd></div><div><dt>抖音</dt><dd>{formatFollowerCount(creator.douyinFollowers)}{creator.douyinUrl ? <a href={creator.douyinUrl} target="_blank" rel="noreferrer"> · 查看链接</a> : ""}</dd></div></dl></section><section><h3>全部标签</h3>{categories.map((category) => <div className="dossier-tags" key={category}><strong>{category}</strong><div>{creator.tags.filter((tag) => tag.category === category).map((tag) => <span key={tag.id}>{tag.label}{tag.status === "pending" ? "（待复核）" : ""}</span>)}</div></div>)}</section><section><h3>日期计划</h3>{creator.noBookings ? <p>近期无其他活动（指TDE以外的活动）</p> : creator.busyPeriods?.length ? creator.busyPeriods.map((period) => <p key={period.id}>{period.startDate}{period.endDate !== period.startDate ? ` 至 ${period.endDate}` : ""} · {period.note || "线下见面计划"}</p>) : <p>未填写</p>}</section><section><h3>生成记录</h3>{records.length ? records.map((record) => <details key={record.id}><summary><span>{record.mode === "free" ? "免费" : "升级"} · {record.status === "completed" ? record.title : record.status === "failed" ? "生成失败" : `处理中 · ${record.stage}`}</span><time>{formatShanghaiDateTime(record.completedAt || record.createdAt)}</time></summary>{record.status === "completed" ? <div className="generation-audit"><strong>{record.title}</strong><p>{record.body}</p>{record.visualFacts.length ? <p>图片事实：{record.visualFacts.join("；")}</p> : null}{record.usedTags.length ? <p>采用标签：{record.usedTags.join("、")}</p> : null}</div> : <p>{record.error || `任务处理中，已尝试 ${record.attempts} 次`}</p>}</details>) : <p>还没有生成记录。</p>}</section></div></section></div>;
}

function RedbookSettingsView({ showToast }: { showToast: (message: string) => void }) {
  const [form, setForm] = useState<RedbookAlgorithmSettings | null>(null);
  const [configured, setConfigured] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    fetchJson("/api/admin/redbook", { cache: "no-store" }).then(
      ({ response, data }) => {
        if (!response.ok) return setError(data.error || "红薯算法加载失败");
        setForm(data.settings);
        setConfigured(Boolean(data.upgradeConfigured));
      },
    );
  }, []);
  if (error)
    return (
      <section className="admin-section-block">
        <p className="form-error">{error}</p>
      </section>
    );
  if (!form)
    return (
      <main className="admin-loading">
        <LoaderCircle className="spin" />
        <p>正在读取红薯算法</p>
      </main>
    );
  const change = <K extends keyof RedbookAlgorithmSettings>(
    key: K,
    value: RedbookAlgorithmSettings[K],
  ) => setForm((current) => (current ? { ...current, [key]: value } : current));
  async function save(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    const { response, data } = await fetchJson("/api/admin/redbook", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(form),
    });
    setSaving(false);
    if (!response.ok) return showToast(data.error || "红薯算法保存失败");
    setForm(data.settings);
    setConfigured(Boolean(data.upgradeConfigured));
    showToast("红薯算法已保存");
  }
  return (
    <form className="admin-settings-form redbook-settings" onSubmit={save}>
      <section>
        <div className="admin-section-heading">
          <div>
            <p className="eyebrow">REDBOOK ALGORITHM</p>
            <h2>红薯算法</h2>
            <p>免费生成与升级生成共用这里的内容规则。</p>
          </div>
          <span className={configured ? "clear" : "status"}>
            {configured ? "升级接口已配置" : "升级接口未配置"}
          </span>
        </div>
        <label className="toggle-row">
          <input
            type="checkbox"
            checked={form.enabled}
            onChange={(event) => change("enabled", event.target.checked)}
          />
          <span>启用文案生成功能</span>
        </label>
        <div className="form-grid two">
          <label className="field">
            <span>模板名称</span>
            <input
              value={form.name}
              onChange={(event) => change("name", event.target.value)}
              maxLength={30}
            />
          </label>
          <label className="field">
            <span>版本</span>
            <input
              value={form.version}
              onChange={(event) => change("version", event.target.value)}
              maxLength={20}
            />
          </label>
        </div>
      </section>
      <section>
        <h2>核心生成规则</h2>
        <label className="field">
          <span>算法说明</span>
          <textarea
            rows={12}
            value={form.systemPrompt}
            onChange={(event) => change("systemPrompt", event.target.value)}
            maxLength={4000}
          />
        </label>
        <label className="field">
          <span>合规规则</span>
          <textarea
            rows={8}
            value={form.complianceRules}
            onChange={(event) => change("complianceRules", event.target.value)}
            maxLength={3000}
          />
        </label>
      </section>
      <section>
        <h2>免费生成模板</h2>
        <p className="settings-help">
          每行一个模板。可使用：&#123;品牌&#125;、&#123;身份&#125;、&#123;作品&#125;、&#123;客群&#125;、&#123;风格&#125;。
        </p>
        <label className="field">
          <span>标题模板</span>
          <textarea
            rows={8}
            value={form.titleTemplates.join("\n")}
            onChange={(event) =>
              change("titleTemplates", event.target.value.split("\n"))
            }
          />
        </label>
        <label className="field">
          <span>开头模板</span>
          <textarea
            rows={8}
            value={form.openingTemplates.join("\n")}
            onChange={(event) =>
              change("openingTemplates", event.target.value.split("\n"))
            }
          />
        </label>
        <label className="field">
          <span>结尾模板</span>
          <textarea
            rows={8}
            value={form.closingTemplates.join("\n")}
            onChange={(event) =>
              change("closingTemplates", event.target.value.split("\n"))
            }
          />
        </label>
      </section>
      <button className="button primary" disabled={saving}>
        {saving ? "保存中" : "保存红薯算法"}
      </button>
    </form>
  );
}

function TrendLibraryView({ showToast }: { showToast: (message: string) => void }) {
  const [settings, setSettings] = useState<TrendSettings | null>(null);
  const [terms, setTerms] = useState<TrendTerm[]>([]);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState({ id: 0, term: "", source: "管理员录入", relatedTags: "", relatedCategories: "", score: 70, confidence: 70, risk: 0, status: "pending", expiresAt: "" });

  const load = useCallback(async () => {
    const { response, data } = await fetchJson("/api/admin/trends", { cache: "no-store" });
    if (!response.ok) return showToast(data.error || "趋势词库加载失败");
    setSettings(data.settings);
    setTerms(data.terms);
  }, [showToast]);

  useEffect(() => { void load(); }, [load]);

  async function request(body: Record<string, unknown>, method = "POST") {
    setSaving(true);
    const { response, data } = await fetchJson("/api/admin/trends", { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    setSaving(false);
    if (!response.ok) {
      showToast(data.error || "趋势词库操作失败");
      return false;
    }
    setSettings(data.settings);
    setTerms(data.terms);
    return true;
  }

  async function saveSettings(event: FormEvent) {
    event.preventDefault();
    if (settings && await request({ action: "settings", settings })) showToast("趋势词库规则已保存");
  }

  async function saveTerm(event: FormEvent) {
    event.preventDefault();
    const body = {
      ...draft,
      relatedTags: draft.relatedTags.split(/[，,]/).map((item) => item.trim()).filter(Boolean),
      relatedCategories: draft.relatedCategories.split(/[，,]/).map((item) => item.trim()).filter(Boolean),
      expiresAt: draft.expiresAt || null,
    };
    if (await request(body, draft.id ? "PATCH" : "POST")) {
      setDraft({ id: 0, term: "", source: "管理员录入", relatedTags: "", relatedCategories: "", score: 70, confidence: 70, risk: 0, status: "pending", expiresAt: "" });
      showToast("趋势词已保存");
    }
  }

  if (!settings) return <main className="admin-loading"><LoaderCircle className="spin" /><p>正在读取趋势词库</p></main>;

  return <div className="admin-stack trend-library-admin">
    <form className="admin-settings-form" onSubmit={saveSettings}>
      <section><div className="admin-section-heading"><div><p className="eyebrow">LOCAL TREND LIBRARY</p><h2>趋势词库</h2><p>生成时只读取本地已启用词条。站内标签热度、AI推荐和人工外部趋势必须明确标注来源。</p></div><button type="button" disabled={saving} onClick={async () => { if (await request({ action: "refresh", full: true })) showToast("已按站内标签热度更新"); }}><TrendingUp size={16} />立即更新</button></div>
      <label className="toggle-row"><input type="checkbox" checked={settings.automaticUpdate} onChange={(event) => setSettings({ ...settings, automaticUpdate: event.target.checked })} /><span>启用自动轮动更新</span></label>
      <div className="form-grid three"><label className="field"><span>更新间隔（小时）</span><input type="number" min="1" max="168" value={settings.updateIntervalHours} onChange={(event) => setSettings({ ...settings, updateIntervalHours: Number(event.target.value) })} /></label><label className="field"><span>每周全量更新日</span><select value={settings.weeklyFullUpdateDay} onChange={(event) => setSettings({ ...settings, weeklyFullUpdateDay: Number(event.target.value) })}>{["周日", "周一", "周二", "周三", "周四", "周五", "周六"].map((day, index) => <option key={day} value={index}>{day}</option>)}</select></label><label className="field"><span>每日清理小时</span><input type="number" min="0" max="23" value={settings.dailyCleanupHour} onChange={(event) => setSettings({ ...settings, dailyCleanupHour: Number(event.target.value) })} /></label><label className="field"><span>单次轮动标签数</span><input type="number" min="1" max="200" value={settings.rotationBatchSize} onChange={(event) => setSettings({ ...settings, rotationBatchSize: Number(event.target.value) })} /></label><label className="field"><span>基础模式最多调用</span><input type="number" min="0" max="3" value={settings.baseMaxTerms} onChange={(event) => setSettings({ ...settings, baseMaxTerms: Number(event.target.value) })} /></label><label className="field"><span>魔法模式最多调用</span><input type="number" min="0" max="5" value={settings.upgradeMaxTerms} onChange={(event) => setSettings({ ...settings, upgradeMaxTerms: Number(event.target.value) })} /></label></div>
      <div className="trend-mode-toggles"><label className="agreement"><input type="checkbox" checked={settings.baseEnabled} onChange={(event) => setSettings({ ...settings, baseEnabled: event.target.checked })} /><span>基础生成使用趋势词</span></label><label className="agreement"><input type="checkbox" checked={settings.upgradeEnabled} onChange={(event) => setSettings({ ...settings, upgradeEnabled: event.target.checked })} /><span>魔法生成使用趋势词</span></label></div>
      <p className="settings-help">最近自动更新：{settings.lastAutoUpdateAt ? formatShanghaiDateTime(settings.lastAutoUpdateAt) : "尚未更新"}。自动更新失败不会影响用户生成文章。</p></section>
      <button className="button primary" disabled={saving}>{saving ? "保存中" : "保存趋势规则"}</button>
    </form>
    <form className="admin-section-block trend-term-editor" onSubmit={saveTerm}><div className="admin-section-heading"><div><p className="eyebrow">TERM EDITOR</p><h2>{draft.id ? "编辑趋势词" : "新增趋势词"}</h2></div>{draft.id ? <button type="button" onClick={() => setDraft({ id: 0, term: "", source: "管理员录入", relatedTags: "", relatedCategories: "", score: 70, confidence: 70, risk: 0, status: "pending", expiresAt: "" })}>取消编辑</button> : null}</div><div className="form-grid three"><label className="field"><span>趋势词</span><input value={draft.term} onChange={(event) => setDraft({ ...draft, term: event.target.value })} maxLength={30} required /></label><label className="field"><span>来源</span><input value={draft.source} onChange={(event) => setDraft({ ...draft, source: event.target.value })} maxLength={30} required /></label><label className="field"><span>状态</span><select value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value })}><option value="pending">待审核</option><option value="enabled">启用</option><option value="expired">过期</option><option value="blacklist">黑名单</option></select></label><label className="field"><span>关联标签（逗号分隔）</span><input value={draft.relatedTags} onChange={(event) => setDraft({ ...draft, relatedTags: event.target.value })} /></label><label className="field"><span>关联分类（逗号分隔）</span><input value={draft.relatedCategories} onChange={(event) => setDraft({ ...draft, relatedCategories: event.target.value })} /></label><label className="field"><span>到期时间</span><input type="datetime-local" value={draft.expiresAt} onChange={(event) => setDraft({ ...draft, expiresAt: event.target.value })} /></label><label className="field"><span>分值 {draft.score}</span><input type="range" min="0" max="100" value={draft.score} onChange={(event) => setDraft({ ...draft, score: Number(event.target.value) })} /></label><label className="field"><span>可信度 {draft.confidence}</span><input type="range" min="0" max="100" value={draft.confidence} onChange={(event) => setDraft({ ...draft, confidence: Number(event.target.value) })} /></label><label className="field"><span>风险 {draft.risk}</span><input type="range" min="0" max="100" value={draft.risk} onChange={(event) => setDraft({ ...draft, risk: Number(event.target.value) })} /></label></div><button className="button primary" disabled={saving}>{saving ? "保存中" : "保存趋势词"}</button></form>
    <section className="admin-section-block"><div className="admin-section-heading"><div><p className="eyebrow">TERM STATUS</p><h2>全部词条</h2></div><span>{terms.length} 条</span></div><div className="data-table-wrap"><table className="data-table trend-table"><thead><tr><th>趋势词/来源</th><th>关联范围</th><th>质量</th><th>状态</th><th>使用</th><th>操作</th></tr></thead><tbody>{terms.map((item) => <tr key={item.id}><td><strong>{item.term}</strong><span>{item.source}</span></td><td><strong>{item.relatedTags.join("、") || "不限标签"}</strong><span>{item.relatedCategories.join("、") || "不限分类"}</span></td><td><strong>分值 {item.score}</strong><span>可信 {item.confidence} · 风险 {item.risk}</span></td><td><strong>{item.status === "enabled" ? "已启用" : item.status === "pending" ? "待审核" : item.status === "expired" ? "已过期" : "黑名单"}</strong><span>{item.expiresAt ? `至 ${formatShanghaiDateTime(item.expiresAt)}` : "长期"}</span></td><td><strong>{item.useCount} 次</strong><span>{item.lastUsedAt ? formatShanghaiDateTime(item.lastUsedAt) : "未使用"}</span></td><td><div className="table-actions"><button type="button" onClick={() => setDraft({ id: item.id, term: item.term, source: item.source, relatedTags: item.relatedTags.join("，"), relatedCategories: item.relatedCategories.join("，"), score: item.score, confidence: item.confidence, risk: item.risk, status: item.status, expiresAt: item.expiresAt?.slice(0, 16).replace(" ", "T") || "" })}>编辑</button><button type="button" onClick={() => request({ ...item, status: item.status === "enabled" ? "pending" : "enabled" }, "PATCH")}>{item.status === "enabled" ? "停用" : "启用"}</button><button type="button" onClick={() => { if (window.confirm(`删除趋势词“${item.term}”？`)) void request({ id: item.id }, "DELETE"); }}><Trash2 size={15} />删除</button></div></td></tr>)}</tbody></table></div>{terms.length ? null : <p className="empty-note">还没有趋势词，可以人工新增或按站内标签热度更新。</p>}</section>
  </div>;
}

// ===== Events Management =====
type TdeEvent = {
  id: number; title: string; short_intro: string; description: string; coverUrl: string;
  province: string; city: string; district: string; address: string;
  start_date: string; end_date: string; registration_deadline: string;
  categoryTags: string[]; max_participants: number; status: string; organizer: string;
  registeredCount: number; view_count: number;
};
type EventRegistration = {
  id: number; event_id: number; creator_id: number; status: string; message: string;
  created_at: string; brand_name: string; phone: string; slogan: string; logoUrl: string;
};

function EventsView({ showToast, onRefresh }: { showToast: (message: string) => void; onRefresh: () => void }) {
  const [events, setEvents] = useState<TdeEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<TdeEvent | null>(null);
  const [detailEvent, setDetailEvent] = useState<TdeEvent | null>(null);
  const [registrations, setRegistrations] = useState<EventRegistration[]>([]);
  const [form, setForm] = useState({ title: "", short_intro: "", description: "", province: "", city: "", district: "", address: "", start_date: "", end_date: "", registration_deadline: "", category_tags: "", max_participants: 0, status: "draft", organizer: "TDE官方" });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/events", { credentials: "include" });
      const data = await res.json();
      setEvents(data.events || []);
    } catch { showToast("加载活动失败"); }
    setLoading(false);
  }, [showToast]);

  useEffect(() => { void load(); }, [load]);

  const openCreate = () => {
    setEditing(null);
    setForm({ title: "", short_intro: "", description: "", province: "", city: "", district: "", address: "", start_date: "", end_date: "", registration_deadline: "", category_tags: "", max_participants: 0, status: "draft", organizer: "TDE官方" });
    setShowForm(true);
  };

  const openEdit = (e: TdeEvent) => {
    setEditing(e);
    setForm({ title: e.title, short_intro: e.short_intro, description: e.description, province: e.province, city: e.city, district: e.district, address: e.address, start_date: e.start_date, end_date: e.end_date, registration_deadline: e.registration_deadline, category_tags: e.categoryTags.join("、"), max_participants: e.max_participants, status: e.status, organizer: e.organizer });
    setShowForm(true);
  };

  const save = async () => {
    if (!form.title) { showToast("请填写活动标题"); return; }
    try {
      const body = { ...form, category_tags: form.category_tags.split(/[、,，]/).map((s) => s.trim()).filter(Boolean), max_participants: Number(form.max_participants) };
      const url = editing ? `/api/admin/events/${editing.id}` : "/api/admin/events";
      const method = editing ? "PATCH" : "POST";
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify(body) });
      const data = await res.json();
      if (data.error) { showToast(data.error); return; }
      showToast(editing ? "活动已更新" : "活动已创建");
      setShowForm(false);
      void load();
      onRefresh();
    } catch { showToast("保存失败"); }
  };

  const viewDetail = async (e: TdeEvent) => {
    try {
      const res = await fetch(`/api/admin/events/${e.id}`, { credentials: "include" });
      const data = await res.json();
      setDetailEvent(data.event);
      setRegistrations(data.registrations || []);
    } catch { showToast("加载详情失败"); }
  };

  const reviewReg = async (regId: number, action: "approve" | "reject") => {
    if (!detailEvent) return;
    try {
      await fetch(`/api/admin/events/${detailEvent.id}/registrations/${regId}`, { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ action }) });
      showToast(action === "approve" ? "已通过" : "已拒绝");
      void viewDetail(detailEvent);
      void load();
    } catch { showToast("操作失败"); }
  };

  const statusLabel: Record<string, string> = { draft: "草稿", recruiting: "招募中", full: "已满员", ended: "已结束", cancelled: "已取消" };
  const regStatusLabel: Record<string, string> = { pending: "待审核", approved: "已确认", rejected: "已拒绝", cancelled: "已取消" };

  return (
    <div className="admin-stack">
      <section className="admin-section-block">
        <div className="admin-section-heading">
          <div><p className="eyebrow">EVENT MANAGEMENT</p><h2>活动管理</h2><p>创建和管理TDE活动，审核主理人报名。</p></div>
          <button className="button primary" type="button" onClick={openCreate}><Plus size={17} />新建活动</button>
        </div>
        {loading ? <p className="empty-note">加载中...</p> : events.length === 0 ? <p className="empty-note">暂无活动，点击 &quot;新建活动&quot; 创建。</p> : (
          <div className="data-table-wrap">
            <table className="data-table">
              <thead><tr><th>活动名称</th><th>时间</th><th>地点</th><th>报名</th><th>状态</th><th>操作</th></tr></thead>
              <tbody>{events.map((e) => (
                <tr key={e.id}>
                  <td><strong>{e.title}</strong><span>{e.short_intro}</span></td>
                  <td><strong>{e.start_date}</strong><span>至 {e.end_date}</span></td>
                  <td><strong>{e.city}</strong><span>{e.district || ""}</span></td>
                  <td><strong>{e.registeredCount}/{e.max_participants || "∞"}</strong><span>浏览 {e.view_count}</span></td>
                  <td><strong>{statusLabel[e.status] || e.status}</strong></td>
                  <td><div className="table-actions">
                    <button type="button" onClick={() => void viewDetail(e)}>报名</button>
                    <button type="button" onClick={() => openEdit(e)}>编辑</button>
                  </div></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </section>

      {showForm ? (
        <section className="admin-section-block">
          <div className="admin-section-heading"><div><p className="eyebrow">{editing ? "EDIT EVENT" : "NEW EVENT"}</p><h2>{editing ? "编辑活动" : "新建活动"}</h2></div><button type="button" onClick={() => setShowForm(false)}>取消</button></div>
          <div className="form-grid two">
            <label className="field"><span>活动标题 *</span><input value={form.title} onChange={(ev) => setForm({ ...form, title: ev.target.value })} maxLength={100} required /></label>
            <label className="field"><span>主办方</span><input value={form.organizer} onChange={(ev) => setForm({ ...form, organizer: ev.target.value })} /></label>
            <label className="field full"><span>一句话简介</span><input value={form.short_intro} onChange={(ev) => setForm({ ...form, short_intro: ev.target.value })} maxLength={200} /></label>
            <label className="field full"><span>详细介绍</span><textarea value={form.description} onChange={(ev) => setForm({ ...form, description: ev.target.value })} rows={4} /></label>
            <label className="field"><span>省份</span><input value={form.province} onChange={(ev) => setForm({ ...form, province: ev.target.value })} /></label>
            <label className="field"><span>城市</span><input value={form.city} onChange={(ev) => setForm({ ...form, city: ev.target.value })} /></label>
            <label className="field"><span>区/县</span><input value={form.district} onChange={(ev) => setForm({ ...form, district: ev.target.value })} /></label>
            <label className="field"><span>详细地址</span><input value={form.address} onChange={(ev) => setForm({ ...form, address: ev.target.value })} /></label>
            <label className="field"><span>开始日期 *</span><input type="date" value={form.start_date} onChange={(ev) => setForm({ ...form, start_date: ev.target.value })} required /></label>
            <label className="field"><span>结束日期 *</span><input type="date" value={form.end_date} onChange={(ev) => setForm({ ...form, end_date: ev.target.value })} required /></label>
            <label className="field"><span>报名截止</span><input type="date" value={form.registration_deadline} onChange={(ev) => setForm({ ...form, registration_deadline: ev.target.value })} /></label>
            <label className="field"><span>最大参与人数（0=不限）</span><input type="number" min="0" value={form.max_participants} onChange={(ev) => setForm({ ...form, max_participants: Number(ev.target.value) })} /></label>
            <label className="field"><span>招募品类（顿号分隔）</span><input value={form.category_tags} onChange={(ev) => setForm({ ...form, category_tags: ev.target.value })} placeholder="陶瓷、木作、手作" /></label>
            <label className="field"><span>状态</span><select value={form.status} onChange={(ev) => setForm({ ...form, status: ev.target.value })}><option value="draft">草稿</option><option value="recruiting">招募中</option><option value="full">已满员</option><option value="ended">已结束</option><option value="cancelled">已取消</option></select></label>
          </div>
          <button className="button primary" type="button" onClick={() => void save()}>{editing ? "保存修改" : "创建活动"}</button>
        </section>
      ) : null}

      {detailEvent ? (
        <section className="admin-section-block">
          <div className="admin-section-heading"><div><p className="eyebrow">REGISTRATIONS</p><h2>{detailEvent.title} - 报名列表</h2></div><button type="button" onClick={() => setDetailEvent(null)}>关闭</button></div>
          {registrations.length === 0 ? <p className="empty-note">暂无报名。</p> : (
            <div className="data-table-wrap">
              <table className="data-table">
                <thead><tr><th>主理人</th><th>联系方式</th><th>留言</th><th>报名时间</th><th>状态</th><th>操作</th></tr></thead>
                <tbody>{registrations.map((r) => (
                  <tr key={r.id}>
                    <td><strong>{r.brand_name || "未命名"}</strong><span>{r.slogan || ""}</span></td>
                    <td>{r.phone}</td>
                    <td>{r.message || "-"}</td>
                    <td>{r.created_at?.slice(0, 16).replace("T", " ")}</td>
                    <td><strong>{regStatusLabel[r.status] || r.status}</strong></td>
                    <td>{r.status === "pending" ? (
                      <div className="table-actions">
                        <button type="button" onClick={() => void reviewReg(r.id, "approve")}>通过</button>
                        <button type="button" onClick={() => void reviewReg(r.id, "reject")}>拒绝</button>
                      </div>
                    ) : "-"}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}
    </div>
  );
}

/* ===== Venue Tags View ===== */
function VenueTagsView({ showToast }: { showToast: (message: string) => void }) {
  const [tags, setTags] = useState<Array<{ id: number; category: string; name: string; cost: number; sort_order: number; active: number }>>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ category: "venue", name: "", cost: 0, sort_order: 0 });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/venue-tags");
      const data = await res.json();
      setTags(data.tags || []);
    } catch (e) {
      showToast("加载失败");
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => { load(); }, [load]);

  const handleAdd = async () => {
    if (!form.name.trim()) { showToast("请输入标签名称"); return; }
    try {
      const res = await fetch("/api/admin/venue-tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (data.success) {
        showToast("添加成功");
        setForm({ category: "venue", name: "", cost: 0, sort_order: 0 });
        setShowForm(false);
        load();
      } else {
        showToast(data.error || "添加失败");
      }
    } catch (e) {
      showToast("添加失败");
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("确定删除这个标签？")) return;
    try {
      await fetch(`/api/admin/venue-tags/${id}`, { method: "DELETE" });
      showToast("已删除");
      load();
    } catch (e) {
      showToast("删除失败");
    }
  };

  const handleToggleActive = async (tag: any) => {
    try {
      await fetch(`/api/admin/venue-tags/${tag.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: tag.active ? 0 : 1 }),
      });
      load();
    } catch (e) {
      showToast("操作失败");
    }
  };

  const categoryLabels: Record<string, string> = {
    venue: "场地描述",
    footfall: "人流量预估",
    audience: "客群画像",
  };

  const categoryColors: Record<string, string> = {
    venue: QIDENG_COLORS.highlightSoft,
    footfall: QIDENG_COLORS.dangerSoft,
    audience: QIDENG_COLORS.infoSoft,
  };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <div>
          <p className="eyebrow">VENUE MANAGEMENT</p>
          <h2>场地方标签库</h2>
          <p>管理主理人意愿筛选的标签，包括场地描述、人流量预估、客群画像。</p>
        </div>
        <button className="btn primary" onClick={() => setShowForm(!showForm)}>
          <Plus size={16} /> {showForm ? "取消" : "新增标签"}
        </button>
      </div>

      {showForm && (
        <div style={{ background: QIDENG_COLORS.surface, border: `2px solid ${QIDENG_COLORS.ink}`, borderRadius: 12, padding: 20, marginBottom: 20 }}>
          <h3 style={{ marginBottom: 16 }}>新增标签</h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 4 }}>分类</label>
              <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}
                style={{ width: "100%", padding: "8px 12px", border: `2px solid ${QIDENG_COLORS.ink}`, borderRadius: 8, fontSize: 14 }}>
                <option value="venue">场地描述</option>
                <option value="footfall">人流量预估</option>
                <option value="audience">客群画像</option>
              </select>
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 4 }}>标签名称</label>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="如：室外无遮挡"
                style={{ width: "100%", padding: "8px 12px", border: `2px solid ${QIDENG_COLORS.ink}`, borderRadius: 8, fontSize: 14 }} />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 4 }}>邀约成本</label>
              <input type="number" value={form.cost} onChange={(e) => setForm({ ...form, cost: Number(e.target.value) })}
                style={{ width: "100%", padding: "8px 12px", border: `2px solid ${QIDENG_COLORS.ink}`, borderRadius: 8, fontSize: 14 }} />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 4 }}>排序</label>
              <input type="number" value={form.sort_order} onChange={(e) => setForm({ ...form, sort_order: Number(e.target.value) })}
                style={{ width: "100%", padding: "8px 12px", border: `2px solid ${QIDENG_COLORS.ink}`, borderRadius: 8, fontSize: 14 }} />
            </div>
          </div>
          <div style={{ marginTop: 16 }}>
            <button className="btn primary" onClick={handleAdd}>确认添加</button>
          </div>
        </div>
      )}

      {loading ? (
        <p>加载中...</p>
      ) : (
        ["venue", "footfall", "audience"].map((cat) => (
          <div key={cat} style={{ marginBottom: 24 }}>
            <h3 style={{ marginBottom: 12, fontSize: 16 }}>{categoryLabels[cat]}</h3>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
              {tags.filter((t) => t.category === cat).map((tag) => (
                <div key={tag.id} style={{
                  display: "flex", alignItems: "center", gap: 8,
                  padding: "8px 14px", borderRadius: 999,
                  background: tag.active ? categoryColors[cat] : QIDENG_COLORS.surfaceSoft,
                  border: `2px solid ${QIDENG_COLORS.ink}`,
                  opacity: tag.active ? 1 : 0.5,
                  textDecoration: tag.active ? "none" : "line-through",
                }}>
                  <span style={{ fontWeight: 600, fontSize: 14 }}>{tag.name}</span>
                  <span style={{ fontSize: 11, color: QIDENG_COLORS.muted }}>−{tag.cost}</span>
                  <button onClick={() => handleToggleActive(tag)}
                    style={{ fontSize: 11, cursor: "pointer", background: "none", border: "none", color: QIDENG_COLORS.info }}>
                    {tag.active ? "禁用" : "启用"}
                  </button>
                  <button onClick={() => handleDelete(tag.id)}
                    style={{ fontSize: 11, cursor: "pointer", background: "none", border: "none", color: QIDENG_COLORS.danger }}>
                    删除
                  </button>
                </div>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
