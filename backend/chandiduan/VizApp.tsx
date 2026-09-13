"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  LogIn,
  LogOut,
  User,
  Search,
  X,
  Phone,
  Lock,
  LoaderCircle,
  MessageSquare,
  Clock,
} from "lucide-react";
import { CustomSelect } from "./CustomSelect";
import { VizImageView } from "./VizImageView";
import { VenuePlanningDashboard, VizStyleTagFilter } from "./VenuePlanningDashboard";

const QIDENG_COLORS = {
  paper: "#ECEBE5",
  surface: "#F6F4EE",
  surfaceSoft: "#DFE1D9",
  ink: "#3F463F",
  text: "#5C625D",
  muted: "#767D77",
  faint: "#A2A7A1",
  accentPressed: "#2d3a2e",
  line: "#D5D3CC",
  success: "#16a34a",
  danger: "#dc2626",
};

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
  noBookings: boolean;
  scheduleConfirmedAt: string | null;
};

type Page = "home" | "login" | "dashboard" | "account";
type DashboardMode = "inspiration" | "style";

type VizFilters = {
  province: string;
  city: string;
  startDate: string;
  endDate: string;
  tagLabels: string[];
};

type LocationProvince = {
  code: string;
  name: string;
  cities: { code: string; name: string }[];
};

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
};

type VizLogoCreator = {
  id: number;
  brandName: string;
  logoUrl: string | null;
};

type VizInterfaceSettings = {
  landingTitle: string;
  landingSubtitle: string;
  loginButtonLabel: string;
  contactButtonLabel: string;
  loginTitle: string;
  loginSubtitle: string;
  headerName: string;
  headerSubtitle: string;
  pageTitle: string;
};

const defaultInterfaceSettings: VizInterfaceSettings = {
  landingTitle: "TDE",
  landingSubtitle: "小众&创意主理人名录可视化平台",
  loginButtonLabel: "登录",
  contactButtonLabel: "联络TDE",
  loginTitle: "TDE",
  loginSubtitle: "可视化用户登录",
  headerName: "TDE",
  headerSubtitle: "主理人名录可视化平台",
  pageTitle: "TDE主理人名录可视化平台",
};

const emptyFilters = (): VizFilters => ({
  province: "",
  city: "",
  startDate: "",
  endDate: "",
  tagLabels: [],
});

export function VizApp() {
  const [page, setPage] = useState<Page>("home");
  const [user, setUser] = useState<VizUser | null>(null);
  const [timeReference] = useState(() => Date.now());
  const [loading, setLoading] = useState(true);
  const [contactText, setContactText] = useState("");
  const [showContact, setShowContact] = useState(false);
  const [interfaceSettings, setInterfaceSettings] = useState(defaultInterfaceSettings);
  const interfaceSettingsRequestRef = useRef(0);

  // 登录表单
  const [loginPhone, setLoginPhone] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);

  // 仪表盘
  const [creators, setCreators] = useState<CreatorCard[]>([]);
  const [logoCreators, setLogoCreators] = useState<VizLogoCreator[]>([]);
  const [searching, setSearching] = useState(false);
  const [filters, setFilters] = useState<VizFilters>(emptyFilters);
  const [allTags, setAllTags] = useState<{ id: number; ids: number[]; label: string; category: "" }[]>([]);
  const [locations, setLocations] = useState<LocationProvince[]>([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [plans, setPlans] = useState<VizPlan[]>([]);
  const [plansLoading, setPlansLoading] = useState(false);
  const [selectedPlanId, setSelectedPlanId] = useState<number | null>(null);
  const [planningLocation, setPlanningLocation] = useState({ province: "", city: "" });
  const [dashboardMode, setDashboardMode] = useState<DashboardMode>("inspiration");
  const searchRequestRef = useRef(0);

  // 个人中心
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pwdError, setPwdError] = useState("");
  const [pwdSuccess, setPwdSuccess] = useState(false);

  const applyInterfaceSettings = useCallback((settings: VizInterfaceSettings) => {
    setInterfaceSettings(settings);
    document.title = settings.pageTitle || defaultInterfaceSettings.pageTitle;
  }, []);

  const refreshInterfaceSettings = useCallback(async () => {
    const requestId = ++interfaceSettingsRequestRef.current;
    try {
      const response = await fetch("/api/viz/interface-settings", { cache: "no-store" });
      const data = await response.json();
      if (response.ok && data.settings && requestId === interfaceSettingsRequestRef.current) {
        applyInterfaceSettings(data.settings);
      }
    } catch {}
  }, [applyInterfaceSettings]);

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

    fetch("/api/public/locations")
      .then((res) => res.json())
      .then((data) => setLocations(Array.isArray(data.provinces) ? data.provinces.filter((item: LocationProvince) => item.code !== "overseas") : []))
      .catch(() => {});
    void refreshInterfaceSettings();
  }, [refreshInterfaceSettings]);

  useEffect(() => {
    const refreshWhenVisible = () => {
      if (!document.hidden) void refreshInterfaceSettings();
    };
    const channel = typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel("viz-interface-settings");
    if (channel) {
      channel.onmessage = (event) => {
        if (!event.data || typeof event.data !== "object") return;
        interfaceSettingsRequestRef.current += 1;
        applyInterfaceSettings(event.data as VizInterfaceSettings);
      };
    }
    window.addEventListener("focus", refreshWhenVisible);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    const timer = window.setInterval(refreshWhenVisible, 30000);
    return () => {
      channel?.close();
      window.removeEventListener("focus", refreshWhenVisible);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
      window.clearInterval(timer);
    };
  }, [applyInterfaceSettings, refreshInterfaceSettings]);

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
    setCreators([]);
    setLogoCreators([]);
    setPlanningLocation({ province: "", city: "" });
    setHasSearched(false);
    setPage("home");
  };

  const loadCreators = async (nextFilters: VizFilters) => {
    const requestId = ++searchRequestRef.current;
    setSearching(true);
    try {
      const tagParams = new URLSearchParams();
      if (nextFilters.province) tagParams.set("province", nextFilters.province);
      if (nextFilters.city) tagParams.set("city", nextFilters.city);
      const [res, tagRes] = await Promise.all([
        fetch("/api/viz/creators", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(nextFilters),
        }),
        fetch(`/api/viz/tags?${tagParams.toString()}`, { cache: "no-store" }),
      ]);
      const [data, tagData] = await Promise.all([res.json(), tagRes.json()]);
      if (!res.ok) throw new Error(data.error || "搜索失败");
      if (requestId === searchRequestRef.current) {
        setCreators(data.creators || []);
        if (tagRes.ok) setAllTags(Array.isArray(tagData.tags) ? tagData.tags : []);
        setHasSearched(true);
      }
    } catch (err) {
      if (requestId === searchRequestRef.current) {
        alert(err instanceof Error ? err.message : "搜索失败");
      }
    } finally {
      if (requestId === searchRequestRef.current) setSearching(false);
    }
  };

  // 用户登录后，根据权限模式填充省市，并立即显示授权范围内的注册用户。
  useEffect(() => {
    if (!user) return;
    const nextFilters = emptyFilters();
    if (user.accessScope === "city") {
      nextFilters.province = user.province;
      nextFilters.city = user.city;
    } else if (user.accessScope === "province") {
      nextFilters.province = user.province;
    }
    setFilters(nextFilters);
    setPlanningLocation({
      province: user.accessScope === "all" ? "" : user.province,
      city: user.accessScope === "city" ? user.city : "",
    });
    void loadCreators(nextFilters);
    fetch("/api/viz/logo-wall", { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "读取主理人标识失败");
        setLogoCreators(Array.isArray(data.creators) ? data.creators : []);
      })
      .catch(() => setLogoCreators([]));
  }, [user]);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    await loadCreators(filters);
  };

  useEffect(() => {
    if (page !== "dashboard" || !user) {
      setPlans([]);
      setSelectedPlanId(null);
      setPlansLoading(false);
      return;
    }
    const controller = new AbortController();
    const hasPlanningLocation = user.accessScope === "province"
      ? Boolean(planningLocation.province)
      : Boolean(planningLocation.city);
    if (!hasPlanningLocation) {
      setPlans([]);
      setSelectedPlanId(null);
      setPlansLoading(false);
      return;
    }
    const params = new URLSearchParams();
    if (planningLocation.province) params.set("province", planningLocation.province);
    if (planningLocation.city) params.set("city", planningLocation.city);
    setPlansLoading(true);
    fetch(`/api/viz/plans?${params.toString()}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "读取活动方案失败");
        return Array.isArray(data.plans) ? data.plans as VizPlan[] : [];
      })
      .then((nextPlans) => {
        setPlans(nextPlans);
        setSelectedPlanId((current) => nextPlans.some((plan) => plan.id === current) ? current : null);
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setPlans([]);
        setSelectedPlanId(null);
      })
      .finally(() => {
        if (!controller.signal.aborted) setPlansLoading(false);
      });
    return () => controller.abort();
  }, [page, planningLocation.city, planningLocation.province, user]);

  const provinceOptions = useMemo(
    () => [
      { value: "", label: "全部省份" },
      ...locations.map((province) => ({ value: province.name, label: province.name })),
    ],
    [locations],
  );

  const cityOptions = useMemo(() => {
    const province = locations.find((item) => item.name === filters.province);
    return [
      { value: "", label: filters.province ? "全部城市" : "请先选择省份" },
      ...(province?.cities.map((city) => ({ value: city.name, label: city.name })) || []),
    ];
  }, [filters.province, locations]);

  const handleProvinceChange = (province: string) => {
    const nextFilters = { ...filters, province, city: "", tagLabels: [] };
    setFilters(nextFilters);
    void loadCreators(nextFilters);
  };

  const handleCityChange = (city: string) => {
    const nextFilters = { ...filters, city, tagLabels: [] };
    setFilters(nextFilters);
    void loadCreators(nextFilters);
  };

  const handleReset = () => {
    const nextFilters = emptyFilters();
    if (user?.accessScope === "city") {
      nextFilters.province = user.province;
      nextFilters.city = user.city;
    } else if (user?.accessScope === "province") {
      nextFilters.province = user.province;
    }
    setFilters(nextFilters);
    void loadCreators(nextFilters);
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
    const diff = user.expiresAt - timeReference;
    if (diff <= 0) return 0;
    return Math.ceil(diff / (24 * 60 * 60 * 1000));
  }, [timeReference, user]);

  const nextTagFilters = (label: string) => ({
    ...filters,
    tagLabels: filters.tagLabels.includes(label)
      ? filters.tagLabels.filter((value) => value !== label)
      : [...filters.tagLabels, label],
  });

  const handlePlanningTagToggle = (label: string) => {
    const nextFilters = nextTagFilters(label);
    setFilters(nextFilters);
    void loadCreators(nextFilters);
  };

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: QIDENG_COLORS.surface }}>
        <LoaderCircle className="spin" size={32} style={{ color: QIDENG_COLORS.accentPressed }} />
      </div>
    );
  }

  // ========== 首页 ==========
  if (page === "home") {
    return (
      <div style={{ minHeight: "100vh", background: QIDENG_COLORS.surface, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 20, fontFamily: '"PingFang SC", sans-serif' }}>
        <div style={{ textAlign: "center", marginBottom: 48 }}>
          <h1 style={{ fontSize: 36, fontWeight: 700, color: QIDENG_COLORS.accentPressed, letterSpacing: 2, margin: "0 0 12px" }}>{interfaceSettings.landingTitle}</h1>
          <p style={{ fontSize: 14, color: QIDENG_COLORS.muted, letterSpacing: 2, lineHeight: 1.7, margin: 0 }}>{interfaceSettings.landingSubtitle}</p>
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
              color: "#fff",
              fontSize: 16,
              fontWeight: 600,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <LogIn size={18} />
            {interfaceSettings.loginButtonLabel}
          </button>
          <button
            type="button"
            onClick={() => setShowContact(true)}
            style={{
              padding: "14px 40px",
              border: `1px solid ${QIDENG_COLORS.line}`,
              borderRadius: 10,
              background: "#fff",
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
            {interfaceSettings.contactButtonLabel}
          </button>
        </div>

        {showContact && (
          <div
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(0,0,0,0.5)",
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
                background: "#fff",
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
              <h3 style={{ margin: "0 0 16px", fontSize: 20, color: QIDENG_COLORS.ink }}>{interfaceSettings.contactButtonLabel}</h3>
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
        <div style={{ maxWidth: 400, width: "100%", background: "#fff", borderRadius: 16, padding: "36px 28px", boxShadow: "0 4px 24px rgba(0,0,0,0.08)" }}>
          <div style={{ textAlign: "center", marginBottom: 28 }}>
            <h2 style={{ fontSize: 28, fontWeight: 700, color: QIDENG_COLORS.accentPressed, letterSpacing: 4, margin: "0 0 8px" }}>{interfaceSettings.loginTitle}</h2>
            <p style={{ fontSize: 12, color: QIDENG_COLORS.muted, letterSpacing: 2, margin: 0 }}>{interfaceSettings.loginSubtitle}</p>
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
                color: "#fff",
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
        <header style={{ background: "#fff", borderBottom: `1px solid ${QIDENG_COLORS.line}`, padding: "16px 24px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <span style={{ fontSize: 20, fontWeight: 700, color: QIDENG_COLORS.accentPressed, letterSpacing: 2 }}>{interfaceSettings.headerName}</span>
            <span style={{ fontSize: 12, color: QIDENG_COLORS.faint }}>{interfaceSettings.headerSubtitle}</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <button type="button" onClick={() => setPage("dashboard")} style={{ padding: "8px 16px", border: `1px solid ${QIDENG_COLORS.line}`, borderRadius: 6, background: "#fff", cursor: "pointer", fontSize: 14 }}>
              返回筛选
            </button>
            <button type="button" onClick={handleLogout} style={{ padding: "8px 16px", border: "none", borderRadius: 6, background: QIDENG_COLORS.accentPressed, color: "#fff", cursor: "pointer", fontSize: 14, display: "flex", alignItems: "center", gap: 6 }}>
              <LogOut size={14} /> 退出
            </button>
          </div>
        </header>

        <main style={{ maxWidth: 600, margin: "32px auto", padding: "0 20px" }}>
          <div style={{ background: "#fff", borderRadius: 12, padding: "28px 24px", marginBottom: 20 }}>
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
                <span style={{ color: daysRemaining === 0 ? QIDENG_COLORS.danger : daysRemaining <= 7 ? "#d97706" : QIDENG_COLORS.success, fontWeight: 600 }}>
                  {daysRemaining === -1 ? "永久有效" : daysRemaining === 0 ? "已过期" : `剩余 ${daysRemaining} 天`}
                </span>
              </div>
            </div>
            {daysRemaining <= 7 && daysRemaining > 0 && (
              <p style={{ marginTop: 16, padding: "10px 14px", background: "#fef3c7", borderRadius: 6, fontSize: 13, color: "#92400e", margin: "16px 0 0" }}>
                账号即将到期，请联系TDE续时。
              </p>
            )}
          </div>

          <div style={{ background: "#fff", borderRadius: 12, padding: "28px 24px" }}>
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
                style={{ width: "100%", padding: "12px", border: "none", borderRadius: 6, background: QIDENG_COLORS.accentPressed, color: "#fff", fontSize: 15, fontWeight: 600, cursor: "pointer" }}
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
      <header className="viz-shell-header" style={{ background: "#fff", borderBottom: `1px solid ${QIDENG_COLORS.line}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <span style={{ fontSize: 20, fontWeight: 700, color: QIDENG_COLORS.accentPressed, letterSpacing: 2 }}>{interfaceSettings.headerName}</span>
          <span style={{ fontSize: 12, color: QIDENG_COLORS.faint }}>{interfaceSettings.headerSubtitle}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 13, color: QIDENG_COLORS.muted }}>{user?.phone}</span>
          <button type="button" onClick={() => setPage("account")} style={{ padding: "8px 14px", border: `1px solid ${QIDENG_COLORS.line}`, borderRadius: 6, background: "#fff", cursor: "pointer", fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}>
            <User size={14} /> 个人中心
          </button>
          <button type="button" onClick={handleLogout} style={{ padding: "8px 14px", border: "none", borderRadius: 6, background: QIDENG_COLORS.accentPressed, color: "#fff", cursor: "pointer", fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}>
            <LogOut size={14} /> 退出
          </button>
        </div>
      </header>

      <main className="viz-shell-main">
        <nav className="viz-mode-switch" aria-label="可视化模式" role="tablist">
          <button
            id="viz-mode-inspiration"
            type="button"
            role="tab"
            aria-selected={dashboardMode === "inspiration"}
            aria-controls="viz-panel-inspiration"
            onClick={() => setDashboardMode("inspiration")}
          >
            灵感日历
          </button>
          <button
            id="viz-mode-style"
            type="button"
            role="tab"
            aria-selected={dashboardMode === "style"}
            aria-controls="viz-panel-style"
            onClick={() => setDashboardMode("style")}
          >
            风格筛选
          </button>
        </nav>

        <section
          id="viz-panel-inspiration"
          className="viz-mode-panel"
          role="tabpanel"
          aria-labelledby="viz-mode-inspiration"
          hidden={dashboardMode !== "inspiration"}
        >
          <VenuePlanningDashboard
            plans={plans}
            logoCreators={logoCreators}
            selectedPlanId={selectedPlanId}
            accessScope={user?.accessScope || "all"}
            locationProvince={planningLocation.province}
            locationCity={planningLocation.city}
            locations={locations}
            plansLoading={plansLoading}
            onLocationChange={(province, city) => {
              setPlanningLocation({ province, city });
              setSelectedPlanId(null);
            }}
            onSelectPlan={setSelectedPlanId}
          />
        </section>

        <section
          id="viz-panel-style"
          className="viz-mode-panel"
          role="tabpanel"
          aria-labelledby="viz-mode-style"
          hidden={dashboardMode !== "style"}
        >
          {/* 筛选区 */}
          <form className="viz-primary-filter" onSubmit={handleSearch} style={{ background: "#fff", borderRadius: 8, padding: "20px", marginBottom: 16 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14, marginBottom: 14 }}>
            <div>
              <label style={{ display: "block", fontSize: 12, color: QIDENG_COLORS.muted, marginBottom: 4 }}>
                省份{user?.accessScope === "province" ? "（已按账号权限锁定）" : user?.accessScope === "city" ? "（已按账号权限锁定）" : ""}
              </label>
              {user?.accessScope === "all" ? (
                <CustomSelect
                  value={filters.province}
                  onChange={handleProvinceChange}
                  options={provinceOptions}
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
                城市{user?.accessScope === "city" || user?.accessScope === "province" ? "（已按账号权限锁定）" : ""}
              </label>
              {user?.accessScope === "city" || user?.accessScope === "province" ? (
                <CustomSelect
                  value={filters.city}
                  onChange={() => {}}
                  options={[{ value: filters.city, label: user.accessScope === "province" ? "全省" : filters.city || "全部城市" }]}
                  placeholder="全部城市"
                  disabled={true}
                />
              ) : (
                <CustomSelect
                  value={filters.city}
                  onChange={handleCityChange}
                  options={cityOptions}
                  placeholder={filters.province ? "全部城市" : "请先选择省份"}
                  disabled={!filters.province}
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
          </div>

          <div className="viz-filter-tags">
            <VizStyleTagFilter tags={allTags} selectedTagLabels={filters.tagLabels} onToggleTag={handlePlanningTagToggle} />
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
                color: "#fff",
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
              onClick={handleReset}
              style={{ padding: "10px 20px", border: `1px solid ${QIDENG_COLORS.line}`, borderRadius: 6, background: "#fff", cursor: "pointer", fontSize: 14 }}
            >
              清空
            </button>
          </div>
          </form>

          {/* 结果区 */}
          {creators.length > 0 ? (
            <div>
              <div style={{ background: "#fff", borderRadius: 10, border: `1px solid ${QIDENG_COLORS.line}`, minHeight: "60vh", display: "flex", flexDirection: "column" }}>
                <VizImageView
                  creators={creators.map((c) => ({
                    ...c,
                    id: c.id,
                    userName: c.userName,
                    brandName: c.brandName,
                    intro: c.intro,
                    boothDescription: c.boothDescription,
                    province: c.province,
                    city: c.city,
                    district: c.district,
                    logoUrl: c.logoUrl,
                    workUrls: c.workUrls,
                    tags: c.tags,
                    opportunityTypes: c.opportunityTypes,
                    busyPeriods: c.busyPeriods,
                    noBookings: c.noBookings,
                  }))}
                />
              </div>
            </div>
          ) : (
            <div style={{ textAlign: "center", padding: "60px 20px", color: QIDENG_COLORS.muted }}>
              <Search size={40} style={{ marginBottom: 12, opacity: 0.3 }} />
              <p style={{ margin: 0, fontSize: 14 }}>{hasSearched ? "暂无符合当前条件的主理人" : "正在读取授权范围内的主理人"}</p>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
