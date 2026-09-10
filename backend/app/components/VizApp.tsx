"use client";

import { useEffect, useMemo, useState, type Dispatch, type FormEvent, type SetStateAction } from "react";
import {
  LogIn,
  LogOut,
  User,
  Search,
  Download,
  X,
  Phone,
  Lock,
  Calendar,
  Tag,
  ChevronDown,
  Check,
  LoaderCircle,
  MessageSquare,
  Clock,
  FileText,
} from "lucide-react";
import { cooperationTypes } from "../../lib/catalog";
import { saveBlobWithPicker } from "../../lib/download";
import { CustomSelect } from "./CustomSelect";
import { VizImageView } from "./VizImageView";
import { QIDENG_COLORS } from "../design-system-values";

type VizUser = {
  id: number;
  name: string;
  phone: string;
  accessScope: "all" | "province" | "city";
  province: string;
  city: string;
  unit: string;
  position: string;
  status: "active" | "suspended";
  expiresAt: number | null;
};

type CreatorCard = {
  id: number;
  userName: string;
  brandName: string;
  intro: string;
  boothDescription: string;
  province: string;
  city: string;
  district: string;
  logoUrl: string | null;
  workUrls: string[];
  tags: { id: number; label: string; category: string }[];
  opportunityTypes: string[];
  busyPeriods: { startDate: string; endDate: string }[];
  noBookings: number;
};

type Page = "home" | "login" | "dashboard" | "account";

export function VizApp({ preview = false }: { preview?: boolean }) {
  const [page, setPage] = useState<Page>("home");
  const [user, setUser] = useState<VizUser | null>(null);
  const [now] = useState(() => Date.now());
  const [loading, setLoading] = useState(true);
  const [contactText, setContactText] = useState("");
  const [showContact, setShowContact] = useState(false);

  // 登录表单
  const [loginPhone, setLoginPhone] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);

  // 仪表盘
  const [creators, setCreators] = useState<CreatorCard[]>([]);
  const [viewMode, setViewMode] = useState<"card" | "image">("card");
  const [searching, setSearching] = useState(false);
  const [filters, setFilters] = useState({
    province: "",
    city: "",
    startDate: "",
    endDate: "",
    opportunityType: "",
    tagIds: [] as number[],
  });
  const [tagPanel, setTagPanel] = useState(false);
  const [allTags, setAllTags] = useState<{ id: number; label: string; category: string }[]>([]);

  // 个人中心
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pwdError, setPwdError] = useState("");
  const [pwdSuccess, setPwdSuccess] = useState(false);

  // 检查登录状态
  useEffect(() => {
    fetch("/api/viz/auth", { method: "GET" })
      .then((res) => res.json())
      .then((data) => {
        if (data.user) {
          setUser(data.user);
          setPage("dashboard");
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));

    // 获取联络文字段
    fetch("/api/viz/contact-text")
      .then((res) => res.json())
      .then((data) => setContactText(data.text || ""))
      .catch(() => {});
  }, []);

  // 获取标签列表
  useEffect(() => {
    if (page !== "dashboard" || !user) return;
    fetch("/api/viz/tags", { method: "GET" })
      .then((res) => res.json())
      .then((data) => {
        if (data.tags) setAllTags(data.tags);
      })
      .catch(() => {});
  }, [page, user]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError("");
    setLoginLoading(true);
    try {
      const res = await fetch("/api/viz/auth", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "login", phone: loginPhone, password: loginPassword }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "登录失败");
      setUser(data.user);
      setPage("dashboard");
      setLoginPhone("");
      setLoginPassword("");
    } catch (err) {
      setLoginError(err instanceof Error ? err.message : "登录失败");
    } finally {
      setLoginLoading(false);
    }
  };

  const handleLogout = async () => {
    await fetch("/api/viz/auth", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "logout" }),
    });
    setUser(null);
    setPage("home");
  };

  // 用户登录后，根据权限模式默认填充省份城市
  useEffect(() => {
    if (user?.accessScope === "city" && user.city) {
      setFilters((prev) => ({ ...prev, province: user.province, city: user.city }));
    } else if (user?.accessScope === "province" && user.province) {
      setFilters((prev) => ({ ...prev, province: user.province, city: "" }));
    }
  }, [user]);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    setSearching(true);
    try {
      const res = await fetch("/api/viz/creators", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(filters),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "搜索失败");
      setCreators(data.creators || []);
    } catch (err) {
      alert(err instanceof Error ? err.message : "搜索失败");
    } finally {
      setSearching(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwdError("");
    setPwdSuccess(false);
    if (newPassword !== confirmPassword) {
      setPwdError("两次输入的新密码不一致");
      return;
    }
    if (newPassword.length < 6) {
      setPwdError("新密码至少6位");
      return;
    }
    try {
      const res = await fetch("/api/viz/auth", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "change-password", oldPassword, newPassword }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "修改失败");
      setPwdSuccess(true);
      setOldPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      setPwdError(err instanceof Error ? err.message : "修改失败");
    }
  };

  const daysRemaining = useMemo(() => {
    if (!user?.expiresAt) return -1;
    const diff = user.expiresAt - now;
    if (diff <= 0) return 0;
    return Math.ceil(diff / (24 * 60 * 60 * 1000));
  }, [now, user]);

  const toggleTag = (id: number) => {
    setFilters((prev) => ({
      ...prev,
      tagIds: prev.tagIds.includes(id)
        ? prev.tagIds.filter((t) => t !== id)
        : [...prev.tagIds, id],
    }));
  };

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: QIDENG_COLORS.surface }}>
        <LoaderCircle className="spin" size={32} style={{ color: QIDENG_COLORS.accentPressed }} />
      </div>
    );
  }

  if (preview) {
    return (
      <VizPreviewSurface
        page={page}
        user={user}
        contactText={contactText}
        showContact={showContact}
        setShowContact={setShowContact}
        setPage={setPage}
        loginPhone={loginPhone}
        setLoginPhone={setLoginPhone}
        loginPassword={loginPassword}
        setLoginPassword={setLoginPassword}
        loginError={loginError}
        loginLoading={loginLoading}
        handleLogin={handleLogin}
        handleLogout={handleLogout}
        creators={creators}
        viewMode={viewMode}
        setViewMode={setViewMode}
        searching={searching}
        filters={filters}
        setFilters={setFilters}
        tagPanel={tagPanel}
        setTagPanel={setTagPanel}
        allTags={allTags}
        toggleTag={toggleTag}
        handleSearch={handleSearch}
        oldPassword={oldPassword}
        setOldPassword={setOldPassword}
        newPassword={newPassword}
        setNewPassword={setNewPassword}
        confirmPassword={confirmPassword}
        setConfirmPassword={setConfirmPassword}
        pwdError={pwdError}
        pwdSuccess={pwdSuccess}
        handleChangePassword={handleChangePassword}
        daysRemaining={daysRemaining}
      />
    );
  }

  // ========== 首页 ==========
  if (page === "home") {
    return (
      <div style={{ minHeight: "100vh", background: QIDENG_COLORS.surface, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 20, fontFamily: '"PingFang SC", sans-serif' }}>
        <div style={{ textAlign: "center", marginBottom: 48 }}>
          <h1 style={{ fontSize: 48, fontWeight: 700, color: QIDENG_COLORS.accentPressed, letterSpacing: 8, margin: "0 0 12px" }}>TDE</h1>
          <p style={{ fontSize: 14, color: QIDENG_COLORS.muted, letterSpacing: 4, margin: 0 }}>COCOC · 原创者社区</p>
        </div>
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", justifyContent: "center" }}>
          <button
            type="button"
            onClick={() => setPage("login")}
            style={{
              padding: "14px 40px",
              border: "none",
              borderRadius: 10,
              background: QIDENG_COLORS.accentPressed,
              color: QIDENG_COLORS.onAccent,
              fontSize: 16,
              fontWeight: 600,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <LogIn size={18} />
            登录
          </button>
          <button
            type="button"
            onClick={() => setShowContact(true)}
            style={{
              padding: "14px 40px",
              border: `1px solid ${QIDENG_COLORS.line}`,
              borderRadius: 10,
              background: QIDENG_COLORS.surface,
              color: QIDENG_COLORS.ink,
              fontSize: 16,
              fontWeight: 600,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <MessageSquare size={18} />
            联络TDE
          </button>
        </div>

        {showContact && (
          <div
            style={{
              position: "fixed",
              inset: 0,
              background: QIDENG_COLORS.scrimStrong,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 1000,
              padding: 20,
            }}
            onClick={() => setShowContact(false)}
          >
            <div
              style={{
                background: QIDENG_COLORS.surface,
                borderRadius: 16,
                padding: "32px 28px",
                maxWidth: 480,
                width: "100%",
                position: "relative",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                onClick={() => setShowContact(false)}
                style={{ position: "absolute", top: 16, right: 16, background: "none", border: "none", cursor: "pointer" }}
              >
                <X size={20} />
              </button>
              <h3 style={{ margin: "0 0 16px", fontSize: 20, color: QIDENG_COLORS.ink }}>联络TDE</h3>
              <p style={{ margin: 0, fontSize: 14, color: QIDENG_COLORS.text, lineHeight: 1.8, whiteSpace: "pre-wrap" }}>
                {contactText || "请联系TDE运营团队"}
              </p>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ========== 登录页 ==========
  if (page === "login") {
    return (
      <div style={{ minHeight: "100vh", background: QIDENG_COLORS.surface, display: "flex", alignItems: "center", justifyContent: "center", padding: 20, fontFamily: '"PingFang SC", sans-serif' }}>
        <div style={{ maxWidth: 400, width: "100%", background: QIDENG_COLORS.surface, borderRadius: 16, padding: "36px 28px", boxShadow: `0 4px 24px ${QIDENG_COLORS.shadowSoft}` }}>
          <div style={{ textAlign: "center", marginBottom: 28 }}>
            <h2 style={{ fontSize: 28, fontWeight: 700, color: QIDENG_COLORS.accentPressed, letterSpacing: 4, margin: "0 0 8px" }}>TDE</h2>
            <p style={{ fontSize: 12, color: QIDENG_COLORS.muted, letterSpacing: 2, margin: 0 }}>可视化用户登录</p>
          </div>
          <form onSubmit={handleLogin}>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: "block", fontSize: 13, color: QIDENG_COLORS.muted, marginBottom: 6 }}>手机号</label>
              <div style={{ position: "relative" }}>
                <Phone size={16} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: QIDENG_COLORS.faint }} />
                <input
                  type="tel"
                  value={loginPhone}
                  onChange={(e) => setLoginPhone(e.target.value.replace(/\D/g, "").slice(0, 11))}
                  placeholder="请输入手机号"
                  style={{ width: "100%", padding: "12px 12px 12px 40px", border: `1px solid ${QIDENG_COLORS.line}`, borderRadius: 8, fontSize: 14, boxSizing: "border-box" }}
                  required
                />
              </div>
            </div>
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: "block", fontSize: 13, color: QIDENG_COLORS.muted, marginBottom: 6 }}>密码</label>
              <div style={{ position: "relative" }}>
                <Lock size={16} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: QIDENG_COLORS.faint }} />
                <input
                  type="password"
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  placeholder="请输入密码"
                  style={{ width: "100%", padding: "12px 12px 12px 40px", border: `1px solid ${QIDENG_COLORS.line}`, borderRadius: 8, fontSize: 14, boxSizing: "border-box" }}
                  required
                />
              </div>
            </div>
            {loginError && (
              <p style={{ color: QIDENG_COLORS.danger, fontSize: 13, margin: "0 0 16px" }}>{loginError}</p>
            )}
            <button
              type="submit"
              disabled={loginLoading}
              style={{
                width: "100%",
                padding: "14px",
                border: "none",
                borderRadius: 8,
                background: QIDENG_COLORS.accentPressed,
                color: QIDENG_COLORS.onAccent,
                fontSize: 16,
                fontWeight: 600,
                cursor: loginLoading ? "wait" : "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
              }}
            >
              {loginLoading ? <LoaderCircle className="spin" size={18} /> : null}
              {loginLoading ? "登录中…" : "登录"}
            </button>
          </form>
          <button
            type="button"
            onClick={() => setPage("home")}
            style={{ width: "100%", marginTop: 12, padding: "10px", background: "none", border: "none", color: QIDENG_COLORS.muted, fontSize: 13, cursor: "pointer" }}
          >
            返回首页
          </button>
        </div>
      </div>
    );
  }

  // ========== 个人中心 ==========
  if (page === "account") {
    return (
      <div style={{ minHeight: "100vh", background: QIDENG_COLORS.surface, fontFamily: '"PingFang SC", sans-serif' }}>
        <header style={{ background: QIDENG_COLORS.surface, borderBottom: `1px solid ${QIDENG_COLORS.line}`, padding: "16px 24px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <span style={{ fontSize: 20, fontWeight: 700, color: QIDENG_COLORS.accentPressed, letterSpacing: 2 }}>TDE</span>
            <span style={{ fontSize: 12, color: QIDENG_COLORS.faint }}>可视化系统</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button type="button" onClick={() => setPage("dashboard")} style={{ padding: "8px 16px", border: `1px solid ${QIDENG_COLORS.line}`, borderRadius: 6, background: QIDENG_COLORS.surface, cursor: "pointer", fontSize: 14 }}>
              返回筛选
            </button>
          <button type="button" onClick={handleLogout} style={{ padding: "8px 16px", border: "none", borderRadius: 6, background: QIDENG_COLORS.accentPressed, color: QIDENG_COLORS.onAccent, cursor: "pointer", fontSize: 14, display: "flex", alignItems: "center", gap: 6 }}>
              <LogOut size={14} /> 退出
            </button>
          </div>
        </header>

        <main style={{ maxWidth: 600, margin: "32px auto", padding: "0 20px" }}>
          <div style={{ background: QIDENG_COLORS.surface, borderRadius: 12, padding: "28px 24px", marginBottom: 20 }}>
            <h3 style={{ margin: "0 0 20px", fontSize: 18, color: QIDENG_COLORS.ink }}>账号信息</h3>
            <div style={{ display: "grid", gap: 12, fontSize: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: QIDENG_COLORS.muted }}>登录账号</span>
                <span style={{ color: QIDENG_COLORS.ink, fontWeight: 500 }}>{user?.phone}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: QIDENG_COLORS.muted }}>权限模式</span>
                <span style={{ color: QIDENG_COLORS.ink, fontWeight: 500 }}>
                  {user?.accessScope === "all" ? "全部省市" : user?.accessScope === "province" ? "指定省份" : "指定城市"}
                </span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: QIDENG_COLORS.muted }}>可访问范围</span>
                <span style={{ color: QIDENG_COLORS.ink, fontWeight: 500 }}>
                  {user?.accessScope === "all" ? "全部城市" : user?.accessScope === "province" ? user.province : `${user?.province} ${user?.city}`}
                </span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ color: QIDENG_COLORS.muted, display: "flex", alignItems: "center", gap: 4 }}>
                  <Clock size={14} /> 使用有效期
                </span>
                <span style={{ color: daysRemaining === 0 ? QIDENG_COLORS.danger : daysRemaining <= 7 ? QIDENG_COLORS.warning : QIDENG_COLORS.success, fontWeight: 600 }}>
                  {daysRemaining === -1 ? "永久有效" : daysRemaining === 0 ? "已过期" : `剩余 ${daysRemaining} 天`}
                </span>
              </div>
            </div>
            {daysRemaining <= 7 && daysRemaining > 0 && (
              <p style={{ marginTop: 16, padding: "10px 14px", background: QIDENG_COLORS.warningSoft, borderRadius: 6, fontSize: 13, color: QIDENG_COLORS.warning, margin: "16px 0 0" }}>
                账号即将到期，请联系TDE续时。
              </p>
            )}
          </div>

          <div style={{ background: QIDENG_COLORS.surface, borderRadius: 12, padding: "28px 24px" }}>
            <h3 style={{ margin: "0 0 20px", fontSize: 18, color: QIDENG_COLORS.ink }}>修改密码</h3>
            <form onSubmit={handleChangePassword}>
              <div style={{ marginBottom: 14 }}>
                <label style={{ display: "block", fontSize: 13, color: QIDENG_COLORS.muted, marginBottom: 6 }}>原密码</label>
                <input
                  type="password"
                  value={oldPassword}
                  onChange={(e) => setOldPassword(e.target.value)}
                  style={{ width: "100%", padding: "10px 12px", border: `1px solid ${QIDENG_COLORS.line}`, borderRadius: 6, fontSize: 14, boxSizing: "border-box" }}
                  required
                />
              </div>
              <div style={{ marginBottom: 14 }}>
                <label style={{ display: "block", fontSize: 13, color: QIDENG_COLORS.muted, marginBottom: 6 }}>新密码（至少6位）</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  style={{ width: "100%", padding: "10px 12px", border: `1px solid ${QIDENG_COLORS.line}`, borderRadius: 6, fontSize: 14, boxSizing: "border-box" }}
                  required
                />
              </div>
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: "block", fontSize: 13, color: QIDENG_COLORS.muted, marginBottom: 6 }}>确认新密码</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  style={{ width: "100%", padding: "10px 12px", border: `1px solid ${QIDENG_COLORS.line}`, borderRadius: 6, fontSize: 14, boxSizing: "border-box" }}
                  required
                />
              </div>
              {pwdError && <p style={{ color: QIDENG_COLORS.danger, fontSize: 13, margin: "0 0 12px" }}>{pwdError}</p>}
              {pwdSuccess && <p style={{ color: QIDENG_COLORS.success, fontSize: 13, margin: "0 0 12px" }}>密码修改成功！</p>}
              <button
                type="submit"
                style={{ width: "100%", padding: "12px", border: "none", borderRadius: 6, background: QIDENG_COLORS.accentPressed, color: QIDENG_COLORS.onAccent, fontSize: 15, fontWeight: 600, cursor: "pointer" }}
              >
                确认修改
              </button>
            </form>
          </div>
        </main>
      </div>
    );
  }

  // ========== 仪表盘（筛选+浏览） ==========
  return (
    <div style={{ minHeight: "100vh", background: QIDENG_COLORS.surface, fontFamily: '"PingFang SC", sans-serif' }}>
      <header style={{ background: QIDENG_COLORS.surface, borderBottom: `1px solid ${QIDENG_COLORS.line}`, padding: "16px 24px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <span style={{ fontSize: 20, fontWeight: 700, color: QIDENG_COLORS.accentPressed, letterSpacing: 2 }}>TDECOCOC</span>
          <span style={{ fontSize: 12, color: QIDENG_COLORS.faint }}>创作者可视化系统</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 13, color: QIDENG_COLORS.muted }}>{user?.phone}</span>
          <button type="button" onClick={() => setPage("account")} style={{ padding: "8px 14px", border: `1px solid ${QIDENG_COLORS.line}`, borderRadius: 6, background: QIDENG_COLORS.surface, cursor: "pointer", fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}>
            <User size={14} /> 个人中心
          </button>
          <button type="button" onClick={handleLogout} style={{ padding: "8px 14px", border: "none", borderRadius: 6, background: QIDENG_COLORS.accentPressed, color: QIDENG_COLORS.onAccent, cursor: "pointer", fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}>
            <LogOut size={14} /> 退出
          </button>
        </div>
      </header>

      <main style={{ maxWidth: 1200, margin: "0 auto", padding: "24px 20px" }}>
        {/* 筛选区 */}
        <form onSubmit={handleSearch} style={{ background: QIDENG_COLORS.surface, borderRadius: 12, padding: "20px", marginBottom: 20 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14, marginBottom: 14 }}>
            <div>
              <label style={{ display: "block", fontSize: 12, color: QIDENG_COLORS.muted, marginBottom: 4 }}>
                省份{user?.accessScope === "province" ? "（已按账号权限锁定）" : user?.accessScope === "city" ? "（已按账号权限锁定）" : ""}
              </label>
              {user?.accessScope === "all" ? (
                <CustomSelect
                  value={filters.province}
                  onChange={(val) => setFilters({ ...filters, province: val, city: "" })}
                  options={[{ value: "", label: "全部省份" }, ...Array.from(new Set(creators.map((c) => c.province).filter(Boolean))).map((p) => ({ value: p, label: p }))]}
                  placeholder="全部省份"
                />
              ) : (
                <CustomSelect
                  value={filters.province}
                  onChange={() => {}}
                  options={[{ value: filters.province, label: filters.province || "全部省份" }]}
                  placeholder="全部省份"
                  disabled={true}
                />
              )}
            </div>
            <div>
              <label style={{ display: "block", fontSize: 12, color: QIDENG_COLORS.muted, marginBottom: 4 }}>
                城市{user?.accessScope === "city" ? "（已按账号权限锁定）" : ""}
              </label>
              {user?.accessScope === "city" ? (
                <CustomSelect
                  value={filters.city}
                  onChange={() => {}}
                  options={[{ value: filters.city, label: filters.city || "全部城市" }]}
                  placeholder="全部城市"
                  disabled={true}
                />
              ) : (
                <CustomSelect
                  value={filters.city}
                  onChange={(val) => setFilters({ ...filters, city: val })}
                  options={[{ value: "", label: "全部城市" }, ...Array.from(new Set(creators.filter((c) => !filters.province || c.province === filters.province).map((c) => c.city).filter(Boolean))).map((c) => ({ value: c, label: c }))]}
                  placeholder="全部城市"
                />
              )}
            </div>
            <div>
              <label style={{ display: "block", fontSize: 12, color: QIDENG_COLORS.muted, marginBottom: 4 }}>明确空档开始</label>
              <input
                type="date"
                value={filters.startDate}
                onChange={(e) => setFilters({ ...filters, startDate: e.target.value })}
                style={{ width: "100%", padding: "10px", border: `1px solid ${QIDENG_COLORS.line}`, borderRadius: 6, fontSize: 13, boxSizing: "border-box" }}
              />
            </div>
            <div>
              <label style={{ display: "block", fontSize: 12, color: QIDENG_COLORS.muted, marginBottom: 4 }}>明确空档结束</label>
              <input
                type="date"
                value={filters.endDate}
                min={filters.startDate}
                onChange={(e) => setFilters({ ...filters, endDate: e.target.value })}
                style={{ width: "100%", padding: "10px", border: `1px solid ${QIDENG_COLORS.line}`, borderRadius: 6, fontSize: 13, boxSizing: "border-box" }}
              />
            </div>
            <div>
              <label style={{ display: "block", fontSize: 12, color: QIDENG_COLORS.muted, marginBottom: 4 }}>合作意向</label>
              <CustomSelect
                value={filters.opportunityType}
                onChange={(val) => setFilters({ ...filters, opportunityType: val })}
                options={[{ value: "", label: "全部合作意向" }, ...cooperationTypes.map((c) => ({ value: c, label: c }))]}
                placeholder="全部合作意向"
              />
            </div>
          </div>

          <div style={{ marginBottom: 14 }}>
            <button
              type="button"
              onClick={() => setTagPanel(!tagPanel)}
              style={{
                padding: "10px 14px",
                border: `1px solid ${QIDENG_COLORS.line}`,
                borderRadius: 6,
                background: QIDENG_COLORS.surface,
                cursor: "pointer",
                fontSize: 13,
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <Tag size={14} />
              标签筛选{filters.tagIds.length > 0 ? `（已选 ${filters.tagIds.length} 个）` : ""}
              <ChevronDown size={14} style={{ transform: tagPanel ? "rotate(180deg)" : "", transition: "transform 0.15s" }} />
            </button>
            {tagPanel && (
              <div style={{ marginTop: 10, padding: 14, background: QIDENG_COLORS.surface, borderRadius: 6, display: "flex", flexWrap: "wrap", gap: 8 }}>
                {allTags.map((tag) => (
                  <button
                    key={tag.id}
                    type="button"
                    onClick={() => toggleTag(tag.id)}
                    style={{
                      padding: "6px 12px",
                      border: `1px solid ${filters.tagIds.includes(tag.id) ? QIDENG_COLORS.accentPressed : QIDENG_COLORS.line}`,
                      borderRadius: 20,
                      background: filters.tagIds.includes(tag.id) ? QIDENG_COLORS.accentPressed : QIDENG_COLORS.surface,
                      color: filters.tagIds.includes(tag.id) ? QIDENG_COLORS.onAccent : QIDENG_COLORS.text,
                      cursor: "pointer",
                      fontSize: 12,
                    }}
                  >
                    {tag.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div style={{ display: "flex", gap: 10 }}>
            <button
              type="submit"
              disabled={searching}
              style={{
                padding: "10px 28px",
                border: "none",
                borderRadius: 6,
                background: QIDENG_COLORS.accentPressed,
                color: QIDENG_COLORS.onAccent,
                fontSize: 14,
                fontWeight: 600,
                cursor: searching ? "wait" : "pointer",
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              {searching ? <LoaderCircle className="spin" size={16} /> : <Search size={16} />}
              {searching ? "搜索中…" : "开始搜索"}
            </button>
            <button
              type="button"
              onClick={() => {
                setFilters({
                  province: user?.accessScope === "all" ? "" : user?.province || "",
                  city: user?.accessScope === "city" ? user?.city || "" : "",
                  startDate: "",
                  endDate: "",
                  opportunityType: "",
                  tagIds: [],
                });
                setCreators([]);
              }}
              style={{ padding: "10px 20px", border: `1px solid ${QIDENG_COLORS.line}`, borderRadius: 6, background: QIDENG_COLORS.surface, cursor: "pointer", fontSize: 14 }}
            >
              清空
            </button>
          </div>
        </form>

        {/* 结果区 */}
        {creators.length > 0 ? (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <p style={{ margin: 0, fontSize: 14, color: QIDENG_COLORS.muted }}>共找到 <strong style={{ color: QIDENG_COLORS.ink }}>{creators.length}</strong> 位原创者</p>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  type="button"
                  onClick={() => setViewMode("card")}
                  style={{
                    padding: "6px 14px",
                    border: `1px solid ${viewMode === "card" ? QIDENG_COLORS.accentPressed : QIDENG_COLORS.line}`,
                    borderRadius: 6,
                    background: viewMode === "card" ? QIDENG_COLORS.accentPressed : QIDENG_COLORS.surface,
                    color: viewMode === "card" ? QIDENG_COLORS.onAccent : QIDENG_COLORS.text,
                    cursor: "pointer",
                    fontSize: 13,
                    fontWeight: viewMode === "card" ? 600 : 400,
                  }}
                >
                  卡片视图
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode("image")}
                  style={{
                    padding: "6px 14px",
                    border: `1px solid ${viewMode === "image" ? QIDENG_COLORS.accentPressed : QIDENG_COLORS.line}`,
                    borderRadius: 6,
                    background: viewMode === "image" ? QIDENG_COLORS.accentPressed : QIDENG_COLORS.surface,
                    color: viewMode === "image" ? QIDENG_COLORS.onAccent : QIDENG_COLORS.text,
                    cursor: "pointer",
                    fontSize: 13,
                    fontWeight: viewMode === "image" ? 600 : 400,
                  }}
                >
                  图片视图
                </button>
              </div>
            </div>

            {viewMode === "card" ? (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 }}>
              {creators.map((creator) => (
                <div key={creator.id} style={{ background: QIDENG_COLORS.surface, borderRadius: 10, overflow: "hidden", border: `1px solid ${QIDENG_COLORS.line}` }}>
                  <div style={{ padding: 16, background: QIDENG_COLORS.paper, minHeight: 120, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    {creator.logoUrl ? (
                      <img src={creator.logoUrl} alt={creator.brandName} style={{ maxWidth: 80, maxHeight: 80, objectFit: "contain" }} />
                    ) : (
                      <span style={{ fontSize: 32, fontWeight: 700, color: QIDENG_COLORS.accentPressed, opacity: 0.3 }}>{(creator.brandName || creator.userName || "?").charAt(0)}</span>
                    )}
                  </div>
                  <div style={{ padding: 14 }}>
                    <h4 style={{ margin: "0 0 6px", fontSize: 15, color: QIDENG_COLORS.ink, fontWeight: 600 }}>{creator.brandName || creator.userName || "未命名"}</h4>
                    <p style={{ margin: "0 0 8px", fontSize: 12, color: QIDENG_COLORS.muted }}>{creator.province} {creator.city}</p>
                    {creator.intro && <p style={{ margin: "0 0 8px", fontSize: 12, color: QIDENG_COLORS.text, lineHeight: 1.6, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{creator.intro}</p>}
                    {creator.tags.length > 0 && (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 8 }}>
                        {creator.tags.slice(0, 4).map((tag) => (
                          <span key={tag.id} style={{ padding: "2px 8px", background: QIDENG_COLORS.surfaceSoft, borderRadius: 10, fontSize: 11, color: QIDENG_COLORS.text }}>{tag.label}</span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
            ) : (
              <div style={{ background: QIDENG_COLORS.surface, borderRadius: 10, border: `1px solid ${QIDENG_COLORS.line}`, minHeight: "60vh", display: "flex", flexDirection: "column" }}>
                <VizImageView
                  creators={creators.map((c) => ({
                    ...c,
                    id: c.id,
                    userName: c.userName,
                    brandName: c.brandName,
                    intro: c.intro,
                    boothDescription: "",
                    province: c.province,
                    city: c.city,
                    district: "",
                    logoUrl: c.logoUrl,
                    workUrls: c.workUrls,
                    tags: c.tags,
                    opportunityTypes: [],
                    busyPeriods: [],
                    noBookings: [],
                  }))}
                  onSwitchToCard={() => setViewMode("card")}
                />
              </div>
            )}
          </div>
        ) : (
          <div style={{ textAlign: "center", padding: "60px 20px", color: QIDENG_COLORS.muted }}>
            <Search size={40} style={{ marginBottom: 12, opacity: 0.3 }} />
            <p style={{ margin: 0, fontSize: 14 }}>设置筛选条件后点击“开始搜索”</p>
          </div>
        )}
      </main>
    </div>
  );
}

type VizFilters = {
  province: string;
  city: string;
  startDate: string;
  endDate: string;
  opportunityType: string;
  tagIds: number[];
};

type VizPreviewSurfaceProps = {
  page: Page;
  user: VizUser | null;
  contactText: string;
  showContact: boolean;
  setShowContact: Dispatch<SetStateAction<boolean>>;
  setPage: Dispatch<SetStateAction<Page>>;
  loginPhone: string;
  setLoginPhone: Dispatch<SetStateAction<string>>;
  loginPassword: string;
  setLoginPassword: Dispatch<SetStateAction<string>>;
  loginError: string;
  loginLoading: boolean;
  handleLogin: (e: FormEvent<HTMLFormElement>) => Promise<void>;
  handleLogout: () => Promise<void>;
  creators: CreatorCard[];
  viewMode: "card" | "image";
  setViewMode: Dispatch<SetStateAction<"card" | "image">>;
  searching: boolean;
  filters: VizFilters;
  setFilters: Dispatch<SetStateAction<VizFilters>>;
  tagPanel: boolean;
  setTagPanel: Dispatch<SetStateAction<boolean>>;
  allTags: { id: number; label: string; category: string }[];
  toggleTag: (id: number) => void;
  handleSearch: (e: FormEvent<HTMLFormElement>) => Promise<void>;
  oldPassword: string;
  setOldPassword: Dispatch<SetStateAction<string>>;
  newPassword: string;
  setNewPassword: Dispatch<SetStateAction<string>>;
  confirmPassword: string;
  setConfirmPassword: Dispatch<SetStateAction<string>>;
  pwdError: string;
  pwdSuccess: boolean;
  handleChangePassword: (e: FormEvent<HTMLFormElement>) => Promise<void>;
  daysRemaining: number;
};

function VizBrand({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`viz-v2-brand${compact ? " is-compact" : ""}`}>
      <span className="viz-v2-brand-badge">TDE</span>
      <span className="viz-v2-brand-copy">
        <strong>TheDesignExpo</strong>
        <small>THEDESIGNEXPO</small>
      </span>
    </div>
  );
}

function VizV2Header({
  user,
  onContact,
  onAccount,
  onLogout,
  accountActionLabel = "个人中心",
}: {
  user?: VizUser | null;
  onContact?: () => void;
  onAccount?: () => void;
  onLogout?: () => void;
  accountActionLabel?: string;
}) {
  return (
    <header className="viz-v2-header">
      <VizBrand />
      <div className="viz-v2-header-actions">
        {onContact && (
          <button type="button" className="viz-v2-button viz-v2-button-ghost" aria-label="联络TDE" onClick={onContact}>
            <MessageSquare size={16} />
            联络TDE
          </button>
        )}
        {user && <span className="viz-v2-user-phone">{user.phone}</span>}
        {onAccount && (
          <button type="button" className="viz-v2-button viz-v2-button-secondary" aria-label={accountActionLabel} onClick={onAccount}>
            <User size={16} />
            {accountActionLabel}
          </button>
        )}
        {onLogout && (
          <button type="button" className="viz-v2-button viz-v2-button-dark" aria-label="退出登录" onClick={onLogout}>
            <LogOut size={16} />
            退出
          </button>
        )}
      </div>
    </header>
  );
}

function VizContactDialog({ text, onClose }: { text: string; onClose: () => void }) {
  return (
    <div className="viz-v2-dialog-backdrop" role="presentation" onClick={onClose}>
      <section className="viz-v2-dialog" role="dialog" aria-modal="true" aria-labelledby="viz-contact-title" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="viz-v2-icon-button viz-v2-dialog-close" aria-label="关闭联络信息" onClick={onClose}>
          <X size={18} />
        </button>
        <p className="viz-v2-kicker">CONTACT TDE</p>
        <h2 id="viz-contact-title">联络TDE</h2>
        <p className="viz-v2-dialog-copy">{text || "请联系TDE运营团队"}</p>
      </section>
    </div>
  );
}

function VizPreviewSurface({
  page,
  user,
  contactText,
  showContact,
  setShowContact,
  setPage,
  loginPhone,
  setLoginPhone,
  loginPassword,
  setLoginPassword,
  loginError,
  loginLoading,
  handleLogin,
  handleLogout,
  creators,
  viewMode,
  setViewMode,
  searching,
  filters,
  setFilters,
  tagPanel,
  setTagPanel,
  allTags,
  toggleTag,
  handleSearch,
  oldPassword,
  setOldPassword,
  newPassword,
  setNewPassword,
  confirmPassword,
  setConfirmPassword,
  pwdError,
  pwdSuccess,
  handleChangePassword,
  daysRemaining,
}: VizPreviewSurfaceProps) {
  const provinceOptions = [
    { value: "", label: "全部省份" },
    ...Array.from(new Set(creators.map((c) => c.province).filter(Boolean))).map((province) => ({ value: province, label: province })),
  ];
  const cityOptions = [
    { value: "", label: "全部城市" },
    ...Array.from(new Set(creators.filter((c) => !filters.province || c.province === filters.province).map((c) => c.city).filter(Boolean))).map((city) => ({ value: city, label: city })),
  ];
  const accessLabel = user?.accessScope === "all" ? "全部省市" : user?.accessScope === "province" ? "指定省份" : "指定城市";
  const resetFilters = () => {
    setFilters({
      province: user?.accessScope === "all" ? "" : user?.province || "",
      city: user?.accessScope === "city" ? user?.city || "" : "",
      startDate: "",
      endDate: "",
      opportunityType: "",
      tagIds: [],
    });
  };

  if (page === "home") {
    return (
      <div className="viz-v2 viz-v2-home">
        <VizV2Header onContact={() => setShowContact(true)} />
        <main className="viz-v2-home-main">
          <section className="viz-v2-home-intro">
            <p className="viz-v2-kicker">VISUALIZATION SYSTEM / 01</p>
            <h1>找到适合这场活动的主理人。</h1>
            <p className="viz-v2-lead">按地区、档期与合作意向筛选，快速查看TDE主理人资料，建立更准确的活动连接。</p>
            <div className="viz-v2-home-notes">
              <span><b>01</b> 条件筛选</span>
              <span><b>02</b> 资料浏览</span>
              <span><b>03</b> 直接联系</span>
            </div>
          </section>
          <section className="viz-v2-auth-card">
            <div className="viz-v2-card-topline" />
            <p className="viz-v2-kicker">ACCOUNT LOGIN</p>
            <h2>登录TDE</h2>
            <p className="viz-v2-card-copy">登录后使用主理人筛选和资料查看功能。</p>
            <form onSubmit={handleLogin} className="viz-v2-form">
              <label className="viz-v2-field"><span>手机号</span><input type="tel" value={loginPhone} onChange={(e) => setLoginPhone(e.target.value.replace(/\D/g, "").slice(0, 11))} placeholder="请输入手机号" required /></label>
              <label className="viz-v2-field"><span>密码</span><input type="password" value={loginPassword} onChange={(e) => setLoginPassword(e.target.value)} placeholder="请输入密码" required /></label>
              {loginError && <p className="viz-v2-form-error">{loginError}</p>}
              <button type="submit" className="viz-v2-button viz-v2-button-primary viz-v2-button-wide" disabled={loginLoading}>
                {loginLoading ? <LoaderCircle className="spin" size={17} /> : <LogIn size={17} />}
                {loginLoading ? "登录中…" : "登录"}
              </button>
            </form>
            <button type="button" className="viz-v2-text-button" onClick={() => setShowContact(true)}>
              还没有账号？联系TDE
            </button>
          </section>
        </main>
        <footer className="viz-v2-footer"><span>TDE</span><span>原创者可视化系统</span></footer>
        {showContact && <VizContactDialog text={contactText} onClose={() => setShowContact(false)} />}
      </div>
    );
  }

  if (page === "login") {
    return (
      <div className="viz-v2 viz-v2-login-page">
        <VizV2Header onContact={() => setShowContact(true)} />
        <main className="viz-v2-login-main">
          <section className="viz-v2-login-context">
            <p className="viz-v2-kicker">WELCOME BACK</p>
            <h1>把合适的人，放进合适的场景。</h1>
            <p className="viz-v2-lead">登录后可以根据城市、空档时间、合作意向与标签查找主理人。</p>
          </section>
          <section className="viz-v2-form-card">
            <div className="viz-v2-card-topline" />
            <p className="viz-v2-kicker">ACCOUNT LOGIN</p>
            <h2>登录TDE</h2>
            <form onSubmit={handleLogin} className="viz-v2-form">
              <label className="viz-v2-field"><span>手机号</span><input type="tel" value={loginPhone} onChange={(e) => setLoginPhone(e.target.value.replace(/\D/g, "").slice(0, 11))} placeholder="请输入手机号" required /></label>
              <label className="viz-v2-field"><span>密码</span><input type="password" value={loginPassword} onChange={(e) => setLoginPassword(e.target.value)} placeholder="请输入密码" required /></label>
              {loginError && <p className="viz-v2-form-error">{loginError}</p>}
              <button type="submit" className="viz-v2-button viz-v2-button-primary viz-v2-button-wide" disabled={loginLoading}>
                {loginLoading ? <LoaderCircle className="spin" size={17} /> : <LogIn size={17} />}
                {loginLoading ? "登录中…" : "登录"}
              </button>
            </form>
            <button type="button" className="viz-v2-text-button" onClick={() => setPage("home")}>返回首页</button>
          </section>
        </main>
        {showContact && <VizContactDialog text={contactText} onClose={() => setShowContact(false)} />}
      </div>
    );
  }

  if (page === "account") {
    return (
      <div className="viz-v2 viz-v2-account-page">
        <VizV2Header user={user} onAccount={() => setPage("dashboard")} accountActionLabel="返回筛选" onLogout={handleLogout} />
        <main className="viz-v2-content viz-v2-account-content">
          <div className="viz-v2-page-heading"><p className="viz-v2-kicker">ACCOUNT / 04</p><h1>账号与权限</h1><p>查看当前访问范围，管理登录密码。</p></div>
          <div className="viz-v2-account-grid">
            <section className="viz-v2-panel viz-v2-info-panel"><div className="viz-v2-panel-heading"><span className="viz-v2-number">01</span><div><h2>账号信息</h2><p>当前可视化系统访问配置</p></div></div>
              <dl className="viz-v2-info-list">
                <div><dt>登录账号</dt><dd>{user?.phone}</dd></div>
                <div><dt>权限模式</dt><dd>{accessLabel}</dd></div>
                <div><dt>可访问范围</dt><dd>{user?.accessScope === "all" ? "全部城市" : user?.accessScope === "province" ? user.province : `${user?.province} ${user?.city}`}</dd></div>
                <div><dt>使用有效期</dt><dd className={daysRemaining === 0 ? "is-danger" : daysRemaining <= 7 ? "is-warning" : "is-success"}>{daysRemaining === -1 ? "永久有效" : daysRemaining === 0 ? "已过期" : `剩余 ${daysRemaining} 天`}</dd></div>
              </dl>
              {daysRemaining <= 7 && daysRemaining > 0 && <p className="viz-v2-notice">账号即将到期，请联系TDE续时。</p>}
            </section>
            <section className="viz-v2-panel"><div className="viz-v2-panel-heading"><span className="viz-v2-number">02</span><div><h2>修改密码</h2><p>定期更新密码，保护账号安全</p></div></div>
              <form onSubmit={handleChangePassword} className="viz-v2-form">
                <label className="viz-v2-field"><span>原密码</span><input type="password" value={oldPassword} onChange={(e) => setOldPassword(e.target.value)} required /></label>
                <label className="viz-v2-field"><span>新密码 <em>至少6位</em></span><input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required /></label>
                <label className="viz-v2-field"><span>确认新密码</span><input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required /></label>
                {pwdError && <p className="viz-v2-form-error">{pwdError}</p>}
                {pwdSuccess && <p className="viz-v2-form-success">密码修改成功。</p>}
                <button type="submit" className="viz-v2-button viz-v2-button-primary">确认修改</button>
              </form>
            </section>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="viz-v2 viz-v2-dashboard-page">
      <VizV2Header user={user} onAccount={() => setPage("account")} onLogout={handleLogout} />
      <main className="viz-v2-content viz-v2-dashboard-content">
        <div className="viz-v2-page-heading viz-v2-dashboard-heading"><div><p className="viz-v2-kicker">CREATOR DIRECTORY / 02</p><h1>主理人可视化检索</h1><p>用更具体的条件，找到更合适的合作对象。</p></div><span className="viz-v2-access-badge"><span />{accessLabel}</span></div>
        <form onSubmit={handleSearch} className="viz-v2-panel viz-v2-filter-panel">
          <div className="viz-v2-panel-heading"><span className="viz-v2-number">01</span><div><h2>设置筛选条件</h2><p>选择完成后开始搜索，结果会显示在下方。</p></div></div>
          <div className="viz-v2-filter-grid">
            <label className="viz-v2-field"><span>省份</span>{user?.accessScope === "all" ? <CustomSelect value={filters.province} onChange={(value) => setFilters({ ...filters, province: value, city: "" })} options={provinceOptions} placeholder="全部省份" /> : <CustomSelect value={filters.province} onChange={() => {}} options={[{ value: filters.province, label: filters.province || "全部省份" }]} placeholder="全部省份" disabled />}</label>
            <label className="viz-v2-field"><span>城市</span>{user?.accessScope === "city" ? <CustomSelect value={filters.city} onChange={() => {}} options={[{ value: filters.city, label: filters.city || "全部城市" }]} placeholder="全部城市" disabled /> : <CustomSelect value={filters.city} onChange={(value) => setFilters({ ...filters, city: value })} options={cityOptions} placeholder="全部城市" />}</label>
            <label className="viz-v2-field"><span>明确空档开始</span><input type="date" value={filters.startDate} onChange={(e) => setFilters({ ...filters, startDate: e.target.value })} /></label>
            <label className="viz-v2-field"><span>明确空档结束</span><input type="date" min={filters.startDate} value={filters.endDate} onChange={(e) => setFilters({ ...filters, endDate: e.target.value })} /></label>
            <label className="viz-v2-field"><span>合作意向</span><CustomSelect value={filters.opportunityType} onChange={(value) => setFilters({ ...filters, opportunityType: value })} options={[{ value: "", label: "全部合作意向" }, ...cooperationTypes.map((value) => ({ value, label: value }))]} placeholder="全部合作意向" /></label>
          </div>
          <div className="viz-v2-filter-tags">
            <button type="button" className="viz-v2-filter-toggle" onClick={() => setTagPanel(!tagPanel)}><Tag size={15} />标签筛选{filters.tagIds.length > 0 ? ` · 已选 ${filters.tagIds.length} 个` : ""}<ChevronDown size={15} className={tagPanel ? "is-open" : ""} /></button>
            {tagPanel && <div className="viz-v2-tag-panel">{allTags.length ? allTags.map((tag, index) => <button type="button" key={tag.id} className={`viz-v2-tag ${filters.tagIds.includes(tag.id) ? "is-selected" : ""} tag-tone-${index % 5}`} onClick={() => toggleTag(tag.id)}>{tag.label}{filters.tagIds.includes(tag.id) && <Check size={13} />}</button>) : <span className="viz-v2-empty-tags">暂无可选标签</span>}</div>}
          </div>
          <div className="viz-v2-filter-actions"><button type="submit" className="viz-v2-button viz-v2-button-primary" disabled={searching}>{searching ? <LoaderCircle className="spin" size={16} /> : <Search size={16} />}{searching ? "搜索中…" : "开始搜索"}</button><button type="button" className="viz-v2-button viz-v2-button-secondary" onClick={resetFilters}>清空条件</button></div>
        </form>
        {creators.length > 0 ? <section className="viz-v2-results"><div className="viz-v2-results-heading"><div><p className="viz-v2-kicker">RESULTS / 03</p><h2>找到 <strong>{creators.length}</strong> 位原创者</h2></div><div className="viz-v2-view-switch"><button type="button" className={viewMode === "card" ? "is-active" : ""} onClick={() => setViewMode("card")}><LayoutGridIcon />卡片视图</button><button type="button" className={viewMode === "image" ? "is-active" : ""} onClick={() => setViewMode("image")}><FileText size={15} />图片视图</button></div></div>{viewMode === "card" ? <div className="viz-v2-creator-grid">{creators.map((creator, index) => <article className="viz-v2-creator-card" key={creator.id}><div className={`viz-v2-creator-media tag-tone-${index % 5}`}>{creator.workUrls?.[0] ? <img src={creator.workUrls[0]} alt={`${creator.brandName || creator.userName}作品`} loading="lazy" /> : creator.logoUrl ? <img src={creator.logoUrl} alt={`${creator.brandName || creator.userName}Logo`} loading="lazy" /> : <span>{(creator.brandName || creator.userName || "?").charAt(0)}</span>}</div><div className="viz-v2-creator-body"><div className="viz-v2-creator-title"><div><p className="viz-v2-kicker">CREATOR {String(index + 1).padStart(2, "0")}</p><h3>{creator.brandName || creator.userName || "未命名"}</h3></div><span className="viz-v2-creator-index">{String(index + 1).padStart(2, "0")}</span></div><p className="viz-v2-location">{creator.province} {creator.city}</p>{creator.intro && <p className="viz-v2-creator-intro">{creator.intro}</p>}{creator.tags.length > 0 && <div className="viz-v2-creator-tags">{creator.tags.slice(0, 4).map((tag, tagIndex) => <span className={`viz-v2-tag tag-tone-${tagIndex % 5}`} key={tag.id}>{tag.label}</span>)}</div>}</div></article>)}</div> : <div className="viz-v2-image-view"><VizImageView creators={creators.map((creator) => ({ ...creator, boothDescription: "", district: "", opportunityTypes: [], busyPeriods: [], noBookings: 0 }))} onSwitchToCard={() => setViewMode("card")} /></div>}</section> : <section className="viz-v2-empty-results"><Search size={28} /><h2>等待一次精准搜索</h2><p>设置地区、档期或合作意向后，结果会显示在这里。</p></section>}
      </main>
    </div>
  );
}

function LayoutGridIcon() {
  return <span className="viz-v2-grid-icon" aria-hidden="true"><i /><i /><i /><i /></span>;
}
