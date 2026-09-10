"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Plus,
  UserCog,
  Phone,
  Lock,
  Building2,
  Briefcase,
  StickyNote,
  CalendarClock,
  Pencil,
  KeyRound,
  Clock,
  Ban,
  CheckCircle2,
  MessageSquare,
  Save,
  X,
  LoaderCircle,
  ChevronDown,
  Image,
} from "lucide-react";
import type { VisualizationUser, VisualizationAccessEvent, CreatorProfile } from "../../lib/types";
import { CustomSelect } from "./CustomSelect";
import { QIDENG_COLORS } from "../design-system-values";

type Tab = "users" | "contact" | "template";

export function VizManagement({ showToast, creators }: { showToast: (message: string) => void; creators: CreatorProfile[] }) {
  const [tab, setTab] = useState<Tab>("users");
  const [users, setUsers] = useState<VisualizationUser[]>([]);
  const [now] = useState(() => Date.now());
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editingUser, setEditingUser] = useState<VisualizationUser | null>(null);
  const [pwdUser, setPwdUser] = useState<VisualizationUser | null>(null);
  const [extendUser, setExtendUser] = useState<VisualizationUser | null>(null);
  const [detailUser, setDetailUser] = useState<VisualizationUser | null>(null);
  const [events, setEvents] = useState<VisualizationAccessEvent[]>([]);

  // 联络文字段
  const [contactText, setContactText] = useState("");
  const [contactLoading, setContactLoading] = useState(false);

  // 模板内容管理
  const [templateConfig, setTemplateConfig] = useState({
    brandName: "TDECOCOC",
    brandSubtitle: "用户档案",
    footerText: "TDE原创者社区",
    qrCodeImageUrl: null as string | null,
    autoYear: true,
  });
  const [templateLoading, setTemplateLoading] = useState(false);

  const loadUsers = () => {
    fetch("/api/admin/viz/users")
      .then((res) => res.json())
      .then((data) => setUsers(data.users || []))
      .catch(() => showToast("加载可视化用户失败"))
      .finally(() => setLoading(false));
  };

  // 从运营台用户库提取省市选项
  const provinceOptions = useMemo(() => {
    const provinces = Array.from(new Set(creators.map((c) => c.province).filter(Boolean)));
    return [{ value: "", label: "不限制（全部城市）" }, ...provinces.map((p) => ({ value: p, label: p }))];
  }, [creators]);

  const getCityOptions = (province: string) => {
    if (!province) return [{ value: "", label: "请先选择省份" }];
    const cities = Array.from(new Set(creators.filter((c) => c.province === province).map((c) => c.city).filter(Boolean)));
    return [{ value: "", label: "不限制（全省）" }, ...cities.map((c) => ({ value: c, label: c }))];
  };

  useEffect(() => {
    loadUsers();
    fetch("/api/admin/viz/contact-text")
      .then((res) => res.json())
      .then((data) => setContactText(data.text || ""))
      .catch(() => {});
    fetch("/api/admin/viz/template-config")
      .then((res) => res.json())
      .then((data) => {
        if (data.config) {
          setTemplateConfig({
            brandName: data.config.brandName,
            brandSubtitle: data.config.brandSubtitle,
            footerText: data.config.footerText,
            qrCodeImageUrl: data.config.qrCodeImageUrl,
            autoYear: data.config.autoYear,
          });
        }
      })
      .catch(() => {});
  }, []);

  const daysRemaining = (expiresAt: number | null) => {
    if (!expiresAt) return -1;
    const diff = expiresAt - now;
    if (diff <= 0) return 0;
    return Math.ceil(diff / (24 * 60 * 60 * 1000));
  };

  const formatDate = (ts: number | null) => {
    if (!ts) return "永久";
    return new Date(ts).toLocaleDateString("zh-CN");
  };

  const handleSaveContact = async () => {
    setContactLoading(true);
    try {
      const res = await fetch("/api/admin/viz/contact-text", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: contactText }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "保存失败");
      showToast("联络文字段已保存");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "保存失败");
    } finally {
      setContactLoading(false);
    }
  };

  const handleSaveTemplate = async () => {
    setTemplateLoading(true);
    try {
      const res = await fetch("/api/admin/viz/template-config", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(templateConfig),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "保存失败");
      showToast("模板内容已保存");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "保存失败");
    } finally {
      setTemplateLoading(false);
    }
  };

  const handleQrCodeUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/admin/viz/qr-code", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "上传失败");
      setTemplateConfig((prev) => ({ ...prev, qrCodeImageUrl: data.url }));
      showToast("二维码已上传");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "上传失败");
    }
  };

  const handleToggleStatus = async (user: VisualizationUser) => {
    try {
      const res = await fetch("/api/admin/viz/users", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "update",
          id: user.id,
          status: user.status === "active" ? "suspended" : "active",
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "操作失败");
      showToast(user.status === "active" ? "已停用" : "已启用");
      loadUsers();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "操作失败");
    }
  };

  const showDetail = async (user: VisualizationUser) => {
    setDetailUser(user);
    try {
      const res = await fetch("/api/admin/viz/users", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "events", id: user.id }),
      });
      const data = await res.json();
      setEvents(data.events || []);
    } catch {
      setEvents([]);
    }
  };

  return (
    <div className="admin-stack">
      <div className="admin-section-heading">
        <div>
          <p className="eyebrow">VISUALIZATION MANAGEMENT</p>
          <h2>可视化管理</h2>
          <p>管理可视化系统用户、使用有效期和联络TDE文字段。</p>
        </div>
      </div>

      {/* Tab 切换 */}
      <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
        <button
          type="button"
          onClick={() => setTab("users")}
          style={{
            padding: "10px 20px",
            border: "none",
            borderRadius: 8,
            background: tab === "users" ? QIDENG_COLORS.accentPressed : QIDENG_COLORS.surface,
            color: tab === "users" ? QIDENG_COLORS.onAccent : QIDENG_COLORS.text,
            cursor: "pointer",
            fontSize: 14,
            fontWeight: 500,
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <UserCog size={16} /> 可视化用户管理
        </button>
        <button
          type="button"
          onClick={() => setTab("contact")}
          style={{
            padding: "10px 20px",
            border: "none",
            borderRadius: 8,
            background: tab === "contact" ? QIDENG_COLORS.accentPressed : QIDENG_COLORS.surface,
            color: tab === "contact" ? QIDENG_COLORS.onAccent : QIDENG_COLORS.text,
            cursor: "pointer",
            fontSize: 14,
            fontWeight: 500,
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <MessageSquare size={16} /> 联络TDE文字段
        </button>
        <button
          type="button"
          onClick={() => setTab("template")}
          style={{
            padding: "10px 20px",
            border: "none",
            borderRadius: 8,
            background: tab === "template" ? QIDENG_COLORS.accentPressed : QIDENG_COLORS.surface,
            color: tab === "template" ? QIDENG_COLORS.onAccent : QIDENG_COLORS.text,
            cursor: "pointer",
            fontSize: 14,
            fontWeight: 500,
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <Image size={16} /> 模板内容管理
        </button>
      </div>

      {/* 用户管理 Tab */}
      {tab === "users" && (
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <p style={{ margin: 0, fontSize: 14, color: QIDENG_COLORS.muted }}>
              共 <strong style={{ color: QIDENG_COLORS.ink }}>{users.length}</strong> 位可视化用户
            </p>
            <button
              type="button"
              onClick={() => setShowCreate(true)}
              style={{
                padding: "10px 20px",
                border: "none",
                borderRadius: 8,
                background: QIDENG_COLORS.accentPressed,
                color: QIDENG_COLORS.onAccent,
                cursor: "pointer",
                fontSize: 14,
                fontWeight: 500,
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <Plus size={16} /> 新建可视化用户
            </button>
          </div>

          {loading ? (
            <div style={{ textAlign: "center", padding: 40, color: QIDENG_COLORS.muted }}>
              <LoaderCircle className="spin" size={24} />
            </div>
          ) : users.length === 0 ? (
            <div style={{ textAlign: "center", padding: 60, color: QIDENG_COLORS.muted, background: QIDENG_COLORS.surface, borderRadius: 10 }}>
              <UserCog size={40} style={{ marginBottom: 12, opacity: 0.3 }} />
              <p style={{ margin: 0 }}>暂无可视化用户，点击“新建可视化用户”添加</p>
            </div>
          ) : (
            <div style={{ background: QIDENG_COLORS.surface, borderRadius: 10, overflow: "hidden", border: `1px solid ${QIDENG_COLORS.line}` }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ background: QIDENG_COLORS.surface, textAlign: "left" }}>
                    <th style={{ padding: "12px 14px", fontWeight: 600, color: QIDENG_COLORS.ink }}>姓名</th>
                    <th style={{ padding: "12px 14px", fontWeight: 600, color: QIDENG_COLORS.ink }}>手机号</th>
                    <th style={{ padding: "12px 14px", fontWeight: 600, color: QIDENG_COLORS.ink }}>单位/职务</th>
                    <th style={{ padding: "12px 14px", fontWeight: 600, color: QIDENG_COLORS.ink }}>权限模式</th>
                    <th style={{ padding: "12px 14px", fontWeight: 600, color: QIDENG_COLORS.ink }}>可访问城市</th>
                    <th style={{ padding: "12px 14px", fontWeight: 600, color: QIDENG_COLORS.ink }}>有效期</th>
                    <th style={{ padding: "12px 14px", fontWeight: 600, color: QIDENG_COLORS.ink }}>状态</th>
                    <th style={{ padding: "12px 14px", fontWeight: 600, color: QIDENG_COLORS.ink }}>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => {
                    const days = daysRemaining(user.expiresAt);
                    return (
                      <tr key={user.id} style={{ borderTop: `1px solid ${QIDENG_COLORS.line}` }}>
                        <td style={{ padding: "12px 14px", fontWeight: 500, color: QIDENG_COLORS.ink }}>{user.name}</td>
                        <td style={{ padding: "12px 14px", color: QIDENG_COLORS.text }}>{user.phone}</td>
                        <td style={{ padding: "12px 14px", color: QIDENG_COLORS.text, fontSize: 12 }}>
                          {user.unit || "-"}{user.position ? ` / ${user.position}` : ""}
                        </td>
                        <td style={{ padding: "12px 14px", fontSize: 12 }}>
                          <span style={{
                            padding: "3px 10px",
                            borderRadius: 4,
                            background: user.accessScope === "all" ? QIDENG_COLORS.successSoft : user.accessScope === "province" ? QIDENG_COLORS.infoSoft : QIDENG_COLORS.warningSoft,
                            color: user.accessScope === "all" ? QIDENG_COLORS.success : user.accessScope === "province" ? QIDENG_COLORS.info : QIDENG_COLORS.warning,
                            fontWeight: 500,
                          }}>
                            {user.accessScope === "all" ? "全部省市" : user.accessScope === "province" ? "指定省份" : "指定城市"}
                          </span>
                        </td>
                        <td style={{ padding: "12px 14px", color: QIDENG_COLORS.text, fontSize: 12 }}>
                          {user.accessScope === "all" ? "全部城市" : user.accessScope === "province" ? user.province : `${user.province} ${user.city}`}
                        </td>
                        <td style={{ padding: "12px 14px", fontSize: 12 }}>
                          <div style={{ color: QIDENG_COLORS.text }}>{formatDate(user.expiresAt)}</div>
                          {days >= 0 && (
                            <div style={{ color: days === 0 ? QIDENG_COLORS.danger : days <= 7 ? QIDENG_COLORS.warning : QIDENG_COLORS.muted }}>
                              {days === 0 ? "已过期" : `剩余${days}天`}
                            </div>
                          )}
                        </td>
                        <td style={{ padding: "12px 14px" }}>
                          <span
                            style={{
                              padding: "3px 10px",
                              borderRadius: 12,
                              fontSize: 11,
                              fontWeight: 500,
                              background: user.status === "active" ? QIDENG_COLORS.successSoft : QIDENG_COLORS.dangerSoft,
                              color: user.status === "active" ? QIDENG_COLORS.success : QIDENG_COLORS.danger,
                            }}
                          >
                            {user.status === "active" ? "正常" : "已停用"}
                          </span>
                        </td>
                        <td style={{ padding: "12px 14px" }}>
                          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                            <button type="button" onClick={() => showDetail(user)} style={{ padding: "4px 8px", border: "none", background: "none", cursor: "pointer", fontSize: 12, color: QIDENG_COLORS.muted, textDecoration: "underline" }}>详情</button>
                            <button type="button" onClick={() => setEditingUser(user)} style={{ padding: "4px 8px", border: "none", background: "none", cursor: "pointer", fontSize: 12, color: QIDENG_COLORS.muted, textDecoration: "underline" }}>编辑</button>
                            <button type="button" onClick={() => setPwdUser(user)} style={{ padding: "4px 8px", border: "none", background: "none", cursor: "pointer", fontSize: 12, color: QIDENG_COLORS.muted, textDecoration: "underline" }}>改密码</button>
                            <button type="button" onClick={() => setExtendUser(user)} style={{ padding: "4px 8px", border: "none", background: "none", cursor: "pointer", fontSize: 12, color: QIDENG_COLORS.muted, textDecoration: "underline" }}>续时</button>
                            <button type="button" onClick={() => handleToggleStatus(user)} style={{ padding: "4px 8px", border: "none", background: "none", cursor: "pointer", fontSize: 12, color: user.status === "active" ? QIDENG_COLORS.danger : QIDENG_COLORS.success, textDecoration: "underline" }}>
                              {user.status === "active" ? "停用" : "启用"}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* 联络文字段 Tab */}
      {tab === "contact" && (
        <div style={{ background: QIDENG_COLORS.surface, borderRadius: 10, padding: 24 }}>
          <h3 style={{ margin: "0 0 12px", fontSize: 16, color: QIDENG_COLORS.ink }}>联络TDE文字段</h3>
          <p style={{ margin: "0 0 16px", fontSize: 13, color: QIDENG_COLORS.muted }}>
            可视化系统首页点击“联络TDE”时显示的文字内容，支持换行。
          </p>
          <textarea
            value={contactText}
            onChange={(e) => setContactText(e.target.value)}
            rows={8}
            style={{
              width: "100%",
              padding: 12,
              border: `1px solid ${QIDENG_COLORS.line}`,
              borderRadius: 8,
              fontSize: 14,
              fontFamily: "inherit",
              resize: "vertical",
              boxSizing: "border-box",
              lineHeight: 1.7,
            }}
            placeholder="请输入联络TDE的文字内容，例如：&#10;电话：400-000-0000&#10;微信：qideng2026&#10;邮箱：contact@qideng.com"
          />
          <div style={{ marginTop: 16, display: "flex", gap: 10 }}>
            <button
              type="button"
              onClick={handleSaveContact}
              disabled={contactLoading}
              style={{
                padding: "10px 24px",
                border: "none",
                borderRadius: 8,
                background: QIDENG_COLORS.accentPressed,
                color: QIDENG_COLORS.onAccent,
                cursor: contactLoading ? "wait" : "pointer",
                fontSize: 14,
                fontWeight: 500,
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              {contactLoading ? <LoaderCircle className="spin" size={16} /> : <Save size={16} />}
              保存
            </button>
          </div>
        </div>
      )}

      {/* 模板内容管理 Tab */}
      {tab === "template" && (
        <div style={{ background: QIDENG_COLORS.surface, borderRadius: 10, padding: 24 }}>
          <h3 style={{ margin: "0 0 12px", fontSize: 16, color: QIDENG_COLORS.ink }}>模板内容管理</h3>
          <p style={{ margin: "0 0 20px", fontSize: 13, color: QIDENG_COLORS.muted }}>
            配置可视化系统生成的 PPT 模板图片上的文字和二维码，修改后即时生效。
          </p>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 20 }}>
            <div>
              <label style={{ display: "block", fontSize: 13, color: QIDENG_COLORS.muted, marginBottom: 6 }}>品牌名称（顶部左侧）</label>
              <input
                value={templateConfig.brandName}
                onChange={(e) => setTemplateConfig({ ...templateConfig, brandName: e.target.value })}
                style={{ width: "100%", padding: "10px 12px", border: `1px solid ${QIDENG_COLORS.line}`, borderRadius: 8, fontSize: 14, boxSizing: "border-box" }}
                placeholder="如：TDECOCOC"
              />
            </div>
            <div>
              <label style={{ display: "block", fontSize: 13, color: QIDENG_COLORS.muted, marginBottom: 6 }}>副标题（顶部右侧）</label>
              <input
                value={templateConfig.brandSubtitle}
                onChange={(e) => setTemplateConfig({ ...templateConfig, brandSubtitle: e.target.value })}
                style={{ width: "100%", padding: "10px 12px", border: `1px solid ${QIDENG_COLORS.line}`, borderRadius: 8, fontSize: 14, boxSizing: "border-box" }}
                placeholder="如：用户档案"
              />
            </div>
          </div>

          <div style={{ marginBottom: 20 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: QIDENG_COLORS.text, cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={templateConfig.autoYear}
                onChange={(e) => setTemplateConfig({ ...templateConfig, autoYear: e.target.checked })}
                style={{ width: 16, height: 16 }}
              />
              副标题后自动追加年份（如“用户档案 · 2026”），每年自动更新
            </label>
          </div>

          <div style={{ marginBottom: 20 }}>
            <label style={{ display: "block", fontSize: 13, color: QIDENG_COLORS.muted, marginBottom: 6 }}>底部文字（底部左侧）</label>
            <input
              value={templateConfig.footerText}
              onChange={(e) => setTemplateConfig({ ...templateConfig, footerText: e.target.value })}
              style={{ width: "100%", padding: "10px 12px", border: `1px solid ${QIDENG_COLORS.line}`, borderRadius: 8, fontSize: 14, boxSizing: "border-box" }}
              placeholder="如：TDE原创者社区"
            />
          </div>

          <div style={{ marginBottom: 20 }}>
            <label style={{ display: "block", fontSize: 13, color: QIDENG_COLORS.muted, marginBottom: 6 }}>小程序二维码（底部右侧）</label>
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <div style={{ width: 80, height: 80, border: `1px dashed ${QIDENG_COLORS.line}`, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
                {templateConfig.qrCodeImageUrl ? (
                  <img src={templateConfig.qrCodeImageUrl} alt="二维码" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
                ) : (
                  <span style={{ fontSize: 11, color: QIDENG_COLORS.faint }}>未上传</span>
                )}
              </div>
              <div>
                <label style={{ display: "inline-block", padding: "8px 16px", border: `1px solid ${QIDENG_COLORS.line}`, borderRadius: 8, background: QIDENG_COLORS.surface, cursor: "pointer", fontSize: 13, color: QIDENG_COLORS.text }}>
                  上传二维码
                  <input type="file" accept="image/*" onChange={handleQrCodeUpload} style={{ display: "none" }} />
                </label>
                {templateConfig.qrCodeImageUrl && (
                  <button
                    type="button"
                    onClick={() => setTemplateConfig({ ...templateConfig, qrCodeImageUrl: null })}
                    style={{ marginLeft: 10, padding: "8px 16px", border: `1px solid ${QIDENG_COLORS.dangerSoft}`, borderRadius: 8, background: QIDENG_COLORS.dangerSoft, color: QIDENG_COLORS.danger, cursor: "pointer", fontSize: 13 }}
                  >
                    移除
                  </button>
                )}
              </div>
            </div>
          </div>

          <div style={{ marginTop: 24, display: "flex", gap: 10 }}>
            <button
              type="button"
              onClick={handleSaveTemplate}
              disabled={templateLoading}
              style={{
                padding: "10px 24px",
                border: "none",
                borderRadius: 8,
                background: QIDENG_COLORS.accentPressed,
                color: QIDENG_COLORS.onAccent,
                cursor: templateLoading ? "wait" : "pointer",
                fontSize: 14,
                fontWeight: 500,
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              {templateLoading ? <LoaderCircle className="spin" size={16} /> : <Save size={16} />}
              保存模板内容
            </button>
          </div>
        </div>
      )}

      {/* 新建用户弹窗 */}
      {showCreate && <CreateUserDialog onClose={() => setShowCreate(false)} onSuccess={() => { loadUsers(); setShowCreate(false); }} showToast={showToast} provinceOptions={provinceOptions} getCityOptions={getCityOptions} />}

      {/* 编辑用户弹窗 */}
      {editingUser && <EditUserDialog user={editingUser} onClose={() => setEditingUser(null)} onSuccess={() => { loadUsers(); setEditingUser(null); }} showToast={showToast} provinceOptions={provinceOptions} getCityOptions={getCityOptions} />}

      {/* 改密码弹窗 */}
      {pwdUser && <PasswordDialog user={pwdUser} onClose={() => setPwdUser(null)} onSuccess={() => { setPwdUser(null); showToast("密码已修改"); }} showToast={showToast} />}

      {/* 续时弹窗 */}
      {extendUser && <ExtendDialog user={extendUser} onClose={() => setExtendUser(null)} onSuccess={() => { loadUsers(); setExtendUser(null); }} showToast={showToast} />}

      {/* 详情弹窗 */}
      {detailUser && <DetailDialog user={detailUser} events={events} onClose={() => setDetailUser(null)} />}
    </div>
  );
}

// ========== 新建用户弹窗 ==========
function CreateUserDialog({ onClose, onSuccess, showToast, provinceOptions, getCityOptions }: { onClose: () => void; onSuccess: () => void; showToast: (msg: string) => void; provinceOptions: { value: string; label: string }[]; getCityOptions: (province: string) => { value: string; label: string }[] }) {
  const [form, setForm] = useState({
    name: "",
    phone: "",
    password: "",
    accessScope: "all" as "all" | "province" | "city",
    province: "",
    city: "",
    unit: "",
    position: "",
    note: "",
    expiresDays: "365",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!form.name.trim()) return setError("请输入姓名");
    if (!/^1\d{10}$/.test(form.phone)) return setError("请输入正确的手机号");
    if (form.password.length < 6) return setError("密码至少6位");

    setLoading(true);
    try {
      const expiresAt = form.expiresDays ? Date.now() + Number(form.expiresDays) * 24 * 60 * 60 * 1000 : null;
      const res = await fetch("/api/admin/viz/users", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "create", ...form, expiresAt }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "创建失败");
      showToast("可视化用户创建成功");
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "创建失败");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="dialog-backdrop" onMouseDown={onClose}>
      <div className="admin-editor" style={{ maxWidth: 520 }} onMouseDown={(e) => e.stopPropagation()}>
        <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <p className="eyebrow">NEW USER</p>
            <h2>新建可视化用户</h2>
          </div>
          <button type="button" onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer" }}><X size={20} /></button>
        </header>
        <form onSubmit={handleSubmit}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <div>
              <label style={{ display: "block", fontSize: 12, color: QIDENG_COLORS.muted, marginBottom: 4 }}>姓名 *</label>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} style={{ width: "100%", padding: "8px 10px", border: `1px solid ${QIDENG_COLORS.line}`, borderRadius: 6, fontSize: 13, boxSizing: "border-box" }} required />
            </div>
            <div>
              <label style={{ display: "block", fontSize: 12, color: QIDENG_COLORS.muted, marginBottom: 4 }}>手机号 *</label>
              <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value.replace(/\D/g, "").slice(0, 11) })} style={{ width: "100%", padding: "8px 10px", border: `1px solid ${QIDENG_COLORS.line}`, borderRadius: 6, fontSize: 13, boxSizing: "border-box" }} required />
            </div>
            <div>
              <label style={{ display: "block", fontSize: 12, color: QIDENG_COLORS.muted, marginBottom: 4 }}>密码 *（至少6位）</label>
              <input type="text" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} style={{ width: "100%", padding: "8px 10px", border: `1px solid ${QIDENG_COLORS.line}`, borderRadius: 6, fontSize: 13, boxSizing: "border-box" }} required />
            </div>
            <div>
              <label style={{ display: "block", fontSize: 12, color: QIDENG_COLORS.muted, marginBottom: 4 }}>有效期（天，留空=永久）</label>
              <input type="number" value={form.expiresDays} onChange={(e) => setForm({ ...form, expiresDays: e.target.value })} placeholder="365" style={{ width: "100%", padding: "8px 10px", border: `1px solid ${QIDENG_COLORS.line}`, borderRadius: 6, fontSize: 13, boxSizing: "border-box" }} />
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={{ display: "block", fontSize: 12, color: QIDENG_COLORS.muted, marginBottom: 4 }}>城市权限模式</label>
              <CustomSelect
                value={form.accessScope}
                onChange={(val) => setForm({ ...form, accessScope: val as "all" | "province" | "city", province: "", city: "" })}
                options={[
                  { value: "all", label: "全部省市（用户可自由筛选）" },
                  { value: "province", label: "指定省份（仅该省份下城市可选）" },
                  { value: "city", label: "指定城市（仅该城市，不可修改）" },
                ]}
                placeholder="选择权限模式"
              />
            </div>
            {form.accessScope !== "all" && (
              <div>
                <label style={{ display: "block", fontSize: 12, color: QIDENG_COLORS.muted, marginBottom: 4 }}>省份{form.accessScope === "province" ? " *" : " *"}</label>
                <CustomSelect
                  value={form.province}
                  onChange={(val) => setForm({ ...form, province: val, city: "" })}
                  options={provinceOptions.filter((o) => o.value !== "")}
                  placeholder="请选择省份"
                />
              </div>
            )}
            {form.accessScope === "city" && (
              <div>
                <label style={{ display: "block", fontSize: 12, color: QIDENG_COLORS.muted, marginBottom: 4 }}>城市 *</label>
                <CustomSelect
                  value={form.city}
                  onChange={(val) => setForm({ ...form, city: val })}
                  options={getCityOptions(form.province).filter((o) => o.value !== "")}
                  placeholder="请选择城市"
                  disabled={!form.province}
                />
              </div>
            )}
            <div>
              <label style={{ display: "block", fontSize: 12, color: QIDENG_COLORS.muted, marginBottom: 4 }}>单位</label>
              <input value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} style={{ width: "100%", padding: "8px 10px", border: `1px solid ${QIDENG_COLORS.line}`, borderRadius: 6, fontSize: 13, boxSizing: "border-box" }} />
            </div>
            <div>
              <label style={{ display: "block", fontSize: 12, color: QIDENG_COLORS.muted, marginBottom: 4 }}>职务</label>
              <input value={form.position} onChange={(e) => setForm({ ...form, position: e.target.value })} style={{ width: "100%", padding: "8px 10px", border: `1px solid ${QIDENG_COLORS.line}`, borderRadius: 6, fontSize: 13, boxSizing: "border-box" }} />
            </div>
          </div>
          <div style={{ marginTop: 14 }}>
            <label style={{ display: "block", fontSize: 12, color: QIDENG_COLORS.muted, marginBottom: 4 }}>备注</label>
            <textarea value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} rows={2} style={{ width: "100%", padding: "8px 10px", border: `1px solid ${QIDENG_COLORS.line}`, borderRadius: 6, fontSize: 13, boxSizing: "border-box", resize: "vertical" }} />
          </div>
          {error && <p style={{ color: QIDENG_COLORS.danger, fontSize: 13, margin: "12px 0 0" }}>{error}</p>}
          <footer style={{ marginTop: 20, display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <button type="button" onClick={onClose} className="button secondary">取消</button>
            <button type="submit" className="button primary" disabled={loading}>
              {loading ? <LoaderCircle className="spin" size={16} /> : null}
              创建用户
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
}

// ========== 编辑用户弹窗 ==========
function EditUserDialog({ user, onClose, onSuccess, showToast, provinceOptions, getCityOptions }: { user: VisualizationUser; onClose: () => void; onSuccess: () => void; showToast: (msg: string) => void; provinceOptions: { value: string; label: string }[]; getCityOptions: (province: string) => { value: string; label: string }[] }) {
  const [form, setForm] = useState({
    name: user.name,
    accessScope: user.accessScope,
    province: user.province,
    city: user.city,
    unit: user.unit,
    position: user.position,
    note: user.note,
  });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch("/api/admin/viz/users", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "update", id: user.id, ...form }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "保存失败");
      showToast("用户信息已更新");
      onSuccess();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "保存失败");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="dialog-backdrop" onMouseDown={onClose}>
      <div className="admin-editor" style={{ maxWidth: 520 }} onMouseDown={(e) => e.stopPropagation()}>
        <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <p className="eyebrow">EDIT USER</p>
            <h2>编辑可视化用户</h2>
          </div>
          <button type="button" onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer" }}><X size={20} /></button>
        </header>
        <form onSubmit={handleSubmit}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <div>
              <label style={{ display: "block", fontSize: 12, color: QIDENG_COLORS.muted, marginBottom: 4 }}>姓名</label>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} style={{ width: "100%", padding: "8px 10px", border: `1px solid ${QIDENG_COLORS.line}`, borderRadius: 6, fontSize: 13, boxSizing: "border-box" }} required />
            </div>
            <div>
              <label style={{ display: "block", fontSize: 12, color: QIDENG_COLORS.muted, marginBottom: 4 }}>手机号（不可修改）</label>
              <input value={user.phone} disabled style={{ width: "100%", padding: "8px 10px", border: `1px solid ${QIDENG_COLORS.line}`, borderRadius: 6, fontSize: 13, boxSizing: "border-box", background: QIDENG_COLORS.surface, color: QIDENG_COLORS.muted }} />
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={{ display: "block", fontSize: 12, color: QIDENG_COLORS.muted, marginBottom: 4 }}>城市权限模式</label>
              <CustomSelect
                value={form.accessScope}
                onChange={(val) => setForm({ ...form, accessScope: val as "all" | "province" | "city", province: val === "all" ? "" : form.province, city: val !== "city" ? "" : form.city })}
                options={[
                  { value: "all", label: "全部省市（用户可自由筛选）" },
                  { value: "province", label: "指定省份（仅该省份下城市可选）" },
                  { value: "city", label: "指定城市（仅该城市，不可修改）" },
                ]}
                placeholder="选择权限模式"
              />
            </div>
            {form.accessScope !== "all" && (
              <div>
                <label style={{ display: "block", fontSize: 12, color: QIDENG_COLORS.muted, marginBottom: 4 }}>省份</label>
                <CustomSelect
                  value={form.province}
                  onChange={(val) => setForm({ ...form, province: val, city: "" })}
                  options={provinceOptions.filter((o) => o.value !== "")}
                  placeholder="请选择省份"
                />
              </div>
            )}
            {form.accessScope === "city" && (
              <div>
                <label style={{ display: "block", fontSize: 12, color: QIDENG_COLORS.muted, marginBottom: 4 }}>城市</label>
                <CustomSelect
                  value={form.city}
                  onChange={(val) => setForm({ ...form, city: val })}
                  options={getCityOptions(form.province).filter((o) => o.value !== "")}
                  placeholder="请选择城市"
                  disabled={!form.province}
                />
              </div>
            )}
            <div>
              <label style={{ display: "block", fontSize: 12, color: QIDENG_COLORS.muted, marginBottom: 4 }}>单位</label>
              <input value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} style={{ width: "100%", padding: "8px 10px", border: `1px solid ${QIDENG_COLORS.line}`, borderRadius: 6, fontSize: 13, boxSizing: "border-box" }} />
            </div>
            <div>
              <label style={{ display: "block", fontSize: 12, color: QIDENG_COLORS.muted, marginBottom: 4 }}>职务</label>
              <input value={form.position} onChange={(e) => setForm({ ...form, position: e.target.value })} style={{ width: "100%", padding: "8px 10px", border: `1px solid ${QIDENG_COLORS.line}`, borderRadius: 6, fontSize: 13, boxSizing: "border-box" }} />
            </div>
          </div>
          <div style={{ marginTop: 14 }}>
            <label style={{ display: "block", fontSize: 12, color: QIDENG_COLORS.muted, marginBottom: 4 }}>备注</label>
            <textarea value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} rows={2} style={{ width: "100%", padding: "8px 10px", border: `1px solid ${QIDENG_COLORS.line}`, borderRadius: 6, fontSize: 13, boxSizing: "border-box", resize: "vertical" }} />
          </div>
          <footer style={{ marginTop: 20, display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <button type="button" onClick={onClose} className="button secondary">取消</button>
            <button type="submit" className="button primary" disabled={loading}>
              {loading ? <LoaderCircle className="spin" size={16} /> : null}
              保存
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
}

// ========== 改密码弹窗 ==========
function PasswordDialog({ user, onClose, onSuccess, showToast }: { user: VisualizationUser; onClose: () => void; onSuccess: () => void; showToast: (msg: string) => void }) {
  const [newPassword, setNewPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (newPassword.length < 6) return setError("新密码至少6位");
    setLoading(true);
    try {
      const res = await fetch("/api/admin/viz/users", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "setPassword", id: user.id, newPassword }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "修改失败");
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "修改失败");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="dialog-backdrop" onMouseDown={onClose}>
      <div className="admin-editor" style={{ maxWidth: 400 }} onMouseDown={(e) => e.stopPropagation()}>
        <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <p className="eyebrow">RESET PASSWORD</p>
            <h2>重置密码</h2>
          </div>
          <button type="button" onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer" }}><X size={20} /></button>
        </header>
        <p style={{ fontSize: 13, color: QIDENG_COLORS.muted, margin: "0 0 16px" }}>
          为用户 <strong style={{ color: QIDENG_COLORS.ink }}>{user.name}</strong>（{user.phone}）设置新密码。
        </p>
        <form onSubmit={handleSubmit}>
          <label style={{ display: "block", fontSize: 12, color: QIDENG_COLORS.muted, marginBottom: 4 }}>新密码（至少6位）</label>
          <input type="text" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} style={{ width: "100%", padding: "10px", border: `1px solid ${QIDENG_COLORS.line}`, borderRadius: 6, fontSize: 14, boxSizing: "border-box" }} required autoFocus />
          {error && <p style={{ color: QIDENG_COLORS.danger, fontSize: 13, margin: "12px 0 0" }}>{error}</p>}
          <footer style={{ marginTop: 20, display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <button type="button" onClick={onClose} className="button secondary">取消</button>
            <button type="submit" className="button primary" disabled={loading}>
              {loading ? <LoaderCircle className="spin" size={16} /> : null}
              确认重置
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
}

// ========== 续时弹窗 ==========
function ExtendDialog({ user, onClose, onSuccess, showToast }: { user: VisualizationUser; onClose: () => void; onSuccess: () => void; showToast: (msg: string) => void }) {
  const [days, setDays] = useState("30");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [now] = useState(() => Date.now());

  const currentExpiry = user.expiresAt ? new Date(user.expiresAt).toLocaleDateString("zh-CN") : "永久";
  const newExpiry = days ? new Date((user.expiresAt && user.expiresAt > now ? user.expiresAt : now) + Number(days) * 24 * 60 * 60 * 1000).toLocaleDateString("zh-CN") : "";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    const d = Number(days);
    if (!d || d <= 0) return setError("请输入有效的续时天数");
    setLoading(true);
    try {
      const res = await fetch("/api/admin/viz/users", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "extend", id: user.id, days: d, note }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "续时失败");
      showToast(`已为 ${user.name} 续时 ${d} 天`);
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "续时失败");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="dialog-backdrop" onMouseDown={onClose}>
      <div className="admin-editor" style={{ maxWidth: 420 }} onMouseDown={(e) => e.stopPropagation()}>
        <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <p className="eyebrow">EXTEND ACCESS</p>
            <h2>续时</h2>
          </div>
          <button type="button" onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer" }}><X size={20} /></button>
        </header>
        <div style={{ background: QIDENG_COLORS.surface, borderRadius: 8, padding: 14, marginBottom: 16, fontSize: 13 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
            <span style={{ color: QIDENG_COLORS.muted }}>用户</span>
            <span style={{ color: QIDENG_COLORS.ink, fontWeight: 500 }}>{user.name}（{user.phone}）</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ color: QIDENG_COLORS.muted }}>当前有效期至</span>
            <span style={{ color: QIDENG_COLORS.ink }}>{currentExpiry}</span>
          </div>
        </div>
        <form onSubmit={handleSubmit}>
          <label style={{ display: "block", fontSize: 12, color: QIDENG_COLORS.muted, marginBottom: 4 }}>续时天数</label>
          <input type="number" value={days} onChange={(e) => setDays(e.target.value)} min="1" style={{ width: "100%", padding: "10px", border: `1px solid ${QIDENG_COLORS.line}`, borderRadius: 6, fontSize: 14, boxSizing: "border-box" }} required />
          {newExpiry && (
            <p style={{ fontSize: 12, color: QIDENG_COLORS.success, margin: "8px 0 0" }}>
              续时后有效期至：{newExpiry}
            </p>
          )}
          <div style={{ marginTop: 14 }}>
            <label style={{ display: "block", fontSize: 12, color: QIDENG_COLORS.muted, marginBottom: 4 }}>备注（选填）</label>
            <input value={note} onChange={(e) => setNote(e.target.value)} style={{ width: "100%", padding: "10px", border: `1px solid ${QIDENG_COLORS.line}`, borderRadius: 6, fontSize: 13, boxSizing: "border-box" }} placeholder="如：客户续费" />
          </div>
          {error && <p style={{ color: QIDENG_COLORS.danger, fontSize: 13, margin: "12px 0 0" }}>{error}</p>}
          <footer style={{ marginTop: 20, display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <button type="button" onClick={onClose} className="button secondary">取消</button>
            <button type="submit" className="button primary" disabled={loading}>
              {loading ? <LoaderCircle className="spin" size={16} /> : null}
              确认续时
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
}

// ========== 详情弹窗 ==========
function DetailDialog({ user, events, onClose }: { user: VisualizationUser; events: VisualizationAccessEvent[]; onClose: () => void }) {
  return (
    <div className="dialog-backdrop" onMouseDown={onClose}>
      <div className="admin-editor" style={{ maxWidth: 560 }} onMouseDown={(e) => e.stopPropagation()}>
        <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <p className="eyebrow">USER DETAIL</p>
            <h2>用户详情</h2>
          </div>
          <button type="button" onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer" }}><X size={20} /></button>
        </header>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, fontSize: 13, marginBottom: 20 }}>
          <div><span style={{ color: QIDENG_COLORS.muted }}>姓名：</span>{user.name}</div>
          <div><span style={{ color: QIDENG_COLORS.muted }}>手机号：</span>{user.phone}</div>
          <div><span style={{ color: QIDENG_COLORS.muted }}>单位：</span>{user.unit || "-"}</div>
          <div><span style={{ color: QIDENG_COLORS.muted }}>职务：</span>{user.position || "-"}</div>
          <div><span style={{ color: QIDENG_COLORS.muted }}>可访问城市：</span>{user.city ? `${user.province} ${user.city}` : "全部"}</div>
          <div><span style={{ color: QIDENG_COLORS.muted }}>状态：</span>{user.status === "active" ? "正常" : "已停用"}</div>
          <div style={{ gridColumn: "1 / -1" }}><span style={{ color: QIDENG_COLORS.muted }}>备注：</span>{user.note || "-"}</div>
        </div>
        <h3 style={{ fontSize: 14, margin: "0 0 10px", color: QIDENG_COLORS.ink }}>操作记录</h3>
        {events.length === 0 ? (
          <p style={{ fontSize: 13, color: QIDENG_COLORS.muted, margin: 0 }}>暂无操作记录</p>
        ) : (
          <div style={{ maxHeight: 200, overflowY: "auto" }}>
            {events.map((evt) => (
              <div key={evt.id} style={{ padding: "8px 0", borderBottom: `1px solid ${QIDENG_COLORS.line}`, fontSize: 12, display: "flex", justifyContent: "space-between" }}>
                <span>
                  {evt.action === "open" ? "开通" : evt.action === "extend" ? "续时" : evt.action === "restore" ? "恢复" : "关闭"}
                  {evt.daysDelta > 0 ? ` +${evt.daysDelta}天` : ""}
                  {evt.note ? `（${evt.note}）` : ""}
                </span>
                <span style={{ color: QIDENG_COLORS.muted }}>{new Date(evt.createdAt).toLocaleString("zh-CN")}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
