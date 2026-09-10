"use client";

import {
  Archive,
  Check,
  CheckCircle2,
  Download,
  FileCode2,
  FileDown,
  KeyRound,
  LoaderCircle,
  Palette,
  Plus,
  Sparkles,
  Tags as TagsIcon,
  Trash2,
  Wand2,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { buildPosterSvg } from "../../lib/poster-renderer";
import { fetchJson } from "./client-request";
import { saveBlobWithPicker } from "../../lib/download";
import { QIDENG_COLORS } from "../design-system-values";
import type {
  DesignApiKey,
  DesignBrief,
  DesignDraft,
  DesignSession,
  DesignSolarTerm,
  DesignTag,
  DesignTagCategory,
} from "../../lib/types";

type TabId = "workspace" | "tags" | "keys";

type SessionRow = DesignSession & { solar_term_name: string; draft_count: number; confirmed: boolean };
const C = QIDENG_COLORS;

const styles: Record<string, React.CSSProperties> = {
  wrap: { display: "flex", flexDirection: "column", gap: 16, padding: "20px 24px", minWidth: 960 },
  tabBar: { display: "flex", gap: 8, borderBottom: `1px solid ${C.line}`, paddingBottom: 12 },
  tab: { padding: "8px 18px", borderRadius: 10, border: `1px solid ${C.line}`, background: C.surface, cursor: "pointer", fontSize: 14, fontWeight: 600, color: C.text, display: "flex", alignItems: "center", gap: 6 },
  tabActive: { padding: "8px 18px", borderRadius: 10, border: `1px solid ${C.ink}`, background: C.ink, color: C.onAccent, cursor: "pointer", fontSize: 14, fontWeight: 600, display: "flex", alignItems: "center", gap: 6 },
  panel: { display: "flex", gap: 20, alignItems: "flex-start" },
  listPanel: { flex: "0 0 340px", border: `1px solid ${C.line}`, borderRadius: 14, overflow: "hidden", background: C.surface },
  card: { border: `1px solid ${C.line}`, borderRadius: 14, background: C.surface, padding: 16 },
  btn: { padding: "9px 16px", borderRadius: 10, border: `1px solid ${C.ink}`, background: C.ink, color: C.onAccent, fontSize: 13, fontWeight: 600, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6 },
  btnGhost: { padding: "8px 14px", borderRadius: 10, border: `1px solid ${C.line}`, background: C.surface, color: C.ink, fontSize: 13, fontWeight: 600, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6 },
  input: { width: "100%", padding: "9px 12px", borderRadius: 10, border: `1px solid ${C.line}`, fontSize: 13, background: C.surface, boxSizing: "border-box" },
  select: { padding: "9px 12px", borderRadius: 10, border: `1px solid ${C.line}`, fontSize: 13, background: C.surface, boxSizing: "border-box" },
  label: { fontSize: 12, color: C.muted, marginBottom: 6, display: "block", fontWeight: 600 },
  toast: { position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)", background: C.ink, color: C.onAccent, padding: "10px 22px", borderRadius: 12, fontSize: 13, zIndex: 999 },
};

export function DesignPlannerClient({ showToast, role }: { showToast: (message: string) => void; role: "super" | "subadmin" }) {
  const [tab, setTab] = useState<TabId>("workspace");
  const [terms, setTerms] = useState<DesignSolarTerm[]>([]);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<number | null>(null);
  const [drafts, setDrafts] = useState<DesignDraft[]>([]);
  const [currentDraftId, setCurrentDraftId] = useState<number | null>(null);
  const [keys, setKeys] = useState<DesignApiKey[]>([]);
  const [operatorId, setOperatorId] = useState<number | "">("");
  const [generating, setGenerating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [newTermId, setNewTermId] = useState<number | "">("");
  const [newTitle, setNewTitle] = useState("");
  const [error, setError] = useState("");
  const [promptOpen, setPromptOpen] = useState(false);

  const currentDraft = useMemo(() => drafts.find((d) => d.id === currentDraftId) || null, [drafts, currentDraftId]);
  const posterSvg = useMemo(
    () => (currentDraft?.brief_json ? buildPosterSvg(currentDraft.brief_json as DesignBrief) : ""),
    [currentDraft],
  );
  const previewRef = useRef<HTMLDivElement>(null);
  const svgSavedRef = useRef(false);

  const refreshSessions = useCallback(async () => {
    const { response, data } = await fetchJson("/api/admin/design/sessions", { cache: "no-store" });
    if (response.ok) {
      setSessions(data.sessions || []);
      return data.sessions || [];
    }
    return [];
  }, []);

  const loadSession = useCallback(async (sessionId: number) => {
    setActiveSessionId(sessionId);
    setCurrentDraftId(null);
    setPromptOpen(false);
    const { response, data } = await fetchJson(`/api/admin/design/sessions/${sessionId}/drafts`, { cache: "no-store" });
    if (response.ok) {
      const list = data.drafts || [];
      setDrafts(list);
      if (list.length) setCurrentDraftId(list[list.length - 1].id);
    }
  }, []);

  const loadAll = useCallback(async () => {
    const [t, s, k] = await Promise.all([
      fetchJson("/api/admin/design/solar-terms", { cache: "no-store" }),
      fetchJson("/api/admin/design/sessions", { cache: "no-store" }),
      fetchJson("/api/admin/design/api-keys", { cache: "no-store" }),
    ]);
    if (t.response.ok) setTerms(t.data.terms || []);
    if (s.response.ok) {
      setSessions(s.data.sessions || []);
      if (!activeSessionId && s.data.sessions?.length) {
        setActiveSessionId(s.data.sessions[0].id);
      }
    }
    if (k.response.ok) {
      const keyList = k.data.keys || [];
      setKeys(keyList);
      if (keyList.length && operatorId === "") setOperatorId(keyList[0].id);
    }
  }, [activeSessionId, operatorId]);

  useEffect(() => {
    loadAll().catch(() => setError("初始化失败，请刷新重试"));
  }, [loadAll]);

  useEffect(() => {
    if (activeSessionId) loadSession(activeSessionId).catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSessionId]);

  // 生成完成后自动保存 SVG（所见即所得）
  useEffect(() => {
    if (!currentDraft?.id || !posterSvg || svgSavedRef.current) return;
    svgSavedRef.current = true;
    const timer = window.setTimeout(() => {
      fetchJson(`/api/admin/design/drafts/${currentDraft.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ svg: posterSvg }),
      }).catch(() => showToast("SVG 预览已生成，但保存失败，确定前将自动重存"));
    }, 600);
    return () => window.clearTimeout(timer);
  }, [currentDraft, posterSvg, showToast]);

  async function createSession() {
    if (!newTermId) return showToast("请先选择节气档期");
    setBusy(true);
    try {
      const { response, data } = await fetchJson("/api/admin/design/sessions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ solar_term_id: Number(newTermId), title: newTitle }),
      });
      if (!response.ok) throw new Error(data.error || "创建失败");
      setNewTitle("");
      const list = await refreshSessions();
      await loadSession(Number(data.session.id));
      if (list.length) setActiveSessionId(Number(data.session.id));
      showToast("会话已创建，开始抽卡生成海报");
    } catch (reason) {
      showToast(reason instanceof Error ? reason.message : "创建失败");
    } finally {
      setBusy(false);
    }
  }

  async function generateDraft() {
    if (!activeSessionId) return showToast("请先选择会话");
    if (operatorId === "") return showToast("请先选择操作员 API Key（消耗该操作员自己的算力）");
    setGenerating(true);
    setError("");
    svgSavedRef.current = false;
    try {
      const { response, data } = await fetchJson(
        `/api/admin/design/sessions/${activeSessionId}/drafts`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ operator_id: Number(operatorId) }),
        },
        150000,
      );
      if (!response.ok) throw new Error(data.error || "生成失败");
      setDrafts((prev) => [...prev, data.draft]);
      setCurrentDraftId(Number(data.draft.id));
      setPromptOpen(false);
      showToast(`已生成 v${data.draft.version}，不满意可再点一次「重新生成」`);
      await refreshSessions();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "生成失败，请重试");
    } finally {
      setGenerating(false);
    }
  }

  async function confirmDraft() {
    if (!currentDraftId) return;
    setBusy(true);
    try {
      const { response, data } = await fetchJson(`/api/admin/design/drafts/${currentDraftId}/select`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
      if (!response.ok) throw new Error(data.error || "确定失败");
      showToast("已确定，进入工作流（导出由管理员进行）");
      await refreshSessions();
    } catch (reason) {
      showToast(reason instanceof Error ? reason.message : "确定失败");
    } finally {
      setBusy(false);
    }
  }

  async function exportDraft(format: "svg" | "pdf") {
    if (!currentDraftId) return showToast("请先选择要导出的版本");
    setBusy(true);
    try {
      const response = await fetch(`/api/admin/design/export/${currentDraftId}?format=${format}&bleed=1`, { cache: "no-store" });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "导出失败");
      }
      const blob = await response.blob();
      const disposition = response.headers.get("content-disposition") || "";
      const match = /filename="?([^"]+)"?/.exec(disposition);
      const name = match?.[1] || `TDE-海报-v${currentDraft?.version || 1}.${format}`;
      await saveBlobWithPicker(blob, name, format === "pdf" ? "application/pdf" : "image/svg+xml");
      showToast(format === "pdf" ? "已导出印刷 PDF（CMYK 转曲）" : "已导出印刷 SVG（矢量可编辑）");
    } catch (reason) {
      showToast(reason instanceof Error ? reason.message : "导出失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={styles.wrap}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <Palette size={20} />
        <strong style={{ fontSize: 17 }}>设计策划 · 在线矢量海报</strong>
        <span style={{ fontSize: 12, color: C.muted }}>24 节气档期 × 标签库组合 → 豆包结构化描述 → 自研 SVG 渲染（TDE 透明镜子主视觉）</span>
      </div>
      <div style={styles.tabBar}>
        <button type="button" style={tab === "workspace" ? styles.tabActive : styles.tab} onClick={() => setTab("workspace")}><Wand2 size={15} />抽卡工作台</button>
        {role === "super" ? <button type="button" style={tab === "tags" ? styles.tabActive : styles.tab} onClick={() => setTab("tags")}><TagsIcon size={15} />标签库（9 类）</button> : null}
        {role === "super" ? <button type="button" style={tab === "keys" ? styles.tabActive : styles.tab} onClick={() => setTab("keys")}><KeyRound size={15} />操作员 API Keys</button> : null}
      </div>

      {tab === "workspace" ? (
        <div style={styles.panel}>
          <div style={styles.listPanel}>
            <div style={{ padding: 14, borderBottom: `1px solid ${C.line}`, display: "flex", gap: 8, flexWrap: "wrap" }}>
              <select style={{ ...styles.select, flex: "1 1 120px" }} value={newTermId} onChange={(e) => setNewTermId(e.target.value === "" ? "" : Number(e.target.value))}>
                <option value="">选节气档期…</option>
                {terms.map((term) => (
                  <option key={term.id} value={term.id}>{term.name}（{term.month_day}）</option>
                ))}
              </select>
              <input style={{ ...styles.input, flex: "1 1 140px" }} placeholder="标题（可选）" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} />
              <button type="button" style={styles.btn} onClick={createSession} disabled={busy}><Plus size={14} />新建会话</button>
            </div>
            <div style={{ maxHeight: 560, overflowY: "auto" }}>
              {sessions.length === 0 ? (
                <div style={{ padding: 28, textAlign: "center", color: C.faint, fontSize: 13 }}>还没有会话，先选一个节气新建</div>
              ) : sessions.map((session) => (
                <button
                  key={session.id}
                  type="button"
                  onClick={() => loadSession(session.id)}
                  style={{
                    width: "100%", textAlign: "left", padding: "12px 14px", border: "none", borderBottom: `1px solid ${C.line}`, cursor: "pointer", background: activeSessionId === session.id ? C.surface : C.surface, display: "flex", flexDirection: "column", gap: 4,
                  }}
                >
                  <span style={{ fontSize: 14, fontWeight: 600, color: C.ink, display: "flex", alignItems: "center", gap: 6 }}>
                    {session.solar_term_name} · {session.title || "市集海报"}
                    {session.confirmed ? <CheckCircle2 size={15} color={C.success} /> : null}
                  </span>
                  <span style={{ fontSize: 12, color: C.muted }}>{session.draft_count} 个版本{session.confirmed ? " · 已确认" : ""} · {session.created_at?.slice(0, 10)}</span>
                </button>
              ))}
            </div>
          </div>

          <div style={{ flex: 1, minWidth: 560 }}>
            {!activeSessionId ? (
              <div style={styles.card}><p style={{ color: C.faint, fontSize: 13, textAlign: "center", padding: 40 }}>选择左侧会话开始；点击员只需「点一次生成 → 线下看 → 不满意再点 → 满意点确定」</p></div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <div style={styles.card}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                    <label style={{ fontSize: 12, color: C.muted, fontWeight: 600 }}>本次生成使用（BYOK）</label>
                    <select style={{ ...styles.select, minWidth: 220 }} value={operatorId} onChange={(e) => setOperatorId(e.target.value === "" ? "" : Number(e.target.value))}>
                      <option value="">选择操作员…</option>
                      {keys.map((key) => (
                        <option key={key.id} value={key.id}>{key.operator_name}（{key.model}）{!key.enabled ? " · 已停用" : ""}</option>
                      ))}
                    </select>
                    <button type="button" style={styles.btn} onClick={generateDraft} disabled={generating || busy}>
                      {generating ? <LoaderCircle size={15} className="spin" /> : <Sparkles size={15} />}
                      {generating ? "AI 生成中…" : "点一次 · 生成新结果"}
                    </button>
                    <span style={{ fontSize: 12, color: C.muted }}>消耗所选操作员自己的豆包算力</span>
                  </div>
                  {error ? <p style={{ color: C.danger, fontSize: 12.5, marginTop: 8 }}>{error}</p> : null}
                </div>

                <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
                  <div ref={previewRef} style={{ flex: "0 0 300px", border: `1px solid ${C.line}`, borderRadius: 12, overflow: "hidden", background: C.surface, display: "flex", justifyContent: "center", padding: 12, minHeight: 400 }}>
                    {posterSvg ? (
                      <svg key={currentDraftId} viewBox="0 0 1000 1333" style={{ width: 240, height: 320, borderRadius: 4, boxShadow: `0 4px 16px ${C.shadowSoft}` }} dangerouslySetInnerHTML={{ __html: posterSvg.replace(/^<svg[^>]*>/, "").replace(/<\/svg>$/, "") }} />
                    ) : (
                      <div style={{ color: C.faint, fontSize: 13, alignSelf: "center" }}>点击「生成」后在此预览</div>
                    )}
                  </div>
                  <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 12 }}>
                    <div style={styles.card}>
                      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>版本列表（点击切换查看）</div>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        {drafts.length === 0 ? <span style={{ fontSize: 12, color: C.faint }}>还没有版本</span> : drafts.map((draft) => (
                          <button
                            key={draft.id}
                            type="button"
                            onClick={() => { setCurrentDraftId(draft.id); setPromptOpen(false); }}
                            style={{
                              padding: "7px 12px", borderRadius: 8, border: `1px solid ${C.line}`, cursor: "pointer", fontSize: 12.5, fontWeight: 600,
                              background: draft.status === "selected" ? C.success : currentDraft?.id === draft.id ? C.ink : C.surface,
                              color: draft.status === "selected" || currentDraft?.id === draft.id ? C.onAccent : C.ink,
                            }}
                          >
                            v{draft.version}{draft.status === "selected" ? " ✓" : ""}
                          </button>
                        ))}
                      </div>
                    </div>
                    {currentDraft ? (
                      <div style={styles.card}>
                        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>本次组合（{currentDraft.tag_combo?.length || 0} 项标签）</div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                          {(currentDraft.tag_combo || []).map((item, index) => (
                            <span key={index} style={{ background: C.surface, padding: "3px 9px", borderRadius: 999, fontSize: 12, color: C.text }}>{item.category_name}：{item.value}</span>
                          ))}
                        </div>
                        <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
                          <button type="button" style={styles.btnGhost} onClick={() => setPromptOpen((open) => !open)}><FileCode2 size={14} />{promptOpen ? "收起提示词" : "查看提示词"}</button>
                          <button type="button" style={{ ...styles.btn, background: C.success, borderColor: C.success }} onClick={confirmDraft} disabled={busy}><Check size={15} />确定（进入工作流）</button>
                          {role === "super" ? (
                            <>
                              <button type="button" style={styles.btnGhost} onClick={() => exportDraft("svg")} disabled={busy}><FileDown size={14} />导出 SVG</button>
                              <button type="button" style={styles.btnGhost} onClick={() => exportDraft("pdf")} disabled={busy}><Download size={14} />导出印刷 PDF（CMYK）</button>
                            </>
                          ) : null}
                        </div>
                        {promptOpen ? (
                          <pre style={{ marginTop: 10, background: C.paper, borderRadius: 10, padding: 12, fontSize: 12, lineHeight: 1.7, whiteSpace: "pre-wrap", color: C.ink, maxHeight: 220, overflowY: "auto" }}>{currentDraft.prompt_text}</pre>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : null}

      {tab === "tags" && role === "super" ? <TagsPanel showToast={showToast} /> : null}
      {tab === "keys" && role === "super" ? <KeysPanel showToast={showToast} /> : null}
    </div>
  );
}

// ===== 标签库管理（超管）=====

function TagsPanel({ showToast }: { showToast: (message: string) => void }) {
  const [categories, setCategories] = useState<DesignTagCategory[]>([]);
  const [tags, setTags] = useState<DesignTag[]>([]);
  const [newValue, setNewValue] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    const [{ response: cRes, data: cData }, tRes] = await Promise.all([
      fetchJson("/api/admin/design/tags", { cache: "no-store" }),
      fetchJson("/api/admin/design/tags", { cache: "no-store" }),
    ]);
    if (cRes.ok) {
      setCategories(cData.categories || []);
      setTags(tRes.data.tags || []);
    }
  }, []);

  useEffect(() => {
    load().catch(() => showToast("标签库加载失败"));
  }, [load, showToast]);

  async function addTag(categoryKey: string) {
    const value = (newValue[categoryKey] || "").trim();
    if (!value) return showToast("请输入标签值");
    const { response, data } = await fetchJson("/api/admin/design/tags", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ category_key: categoryKey, value }),
    });
    if (!response.ok) return showToast(data.error || "新增失败");
    setNewValue((prev) => ({ ...prev, [categoryKey]: "" }));
    showToast("已新增标签值");
    load();
  }

  async function toggleTag(id: number, status: string) {
    const { response } = await fetchJson(`/api/admin/design/tags/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: status === "active" ? "archived" : "active" }),
    });
    if (response.ok) showToast(status === "active" ? "已归档" : "已恢复");
    load();
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <p style={{ fontSize: 12.5, color: C.muted }}>9 类固定槽位 = 策划方案字段 ∪ 设计 brief 字段。每类下值池可随意增删，抽取数量为每类参与组合的标签个数（1-5）。类别增删属结构性变更，需同步模板。</p>
      {categories.map((category) => {
        const values = tags.filter((tag) => tag.category_key === category.key);
        return (
          <div key={category.key} style={styles.card}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <strong style={{ fontSize: 14, minWidth: 110 }}>{category.name}</strong>
              <span style={{ fontSize: 12, color: C.faint }}>{category.hint}</span>
              <span style={{ fontSize: 12, color: C.muted, marginLeft: "auto" }}>每类抽取</span>
              <select
                value={category.pick_count}
                style={{ ...styles.select, padding: "5px 8px" }}
                onChange={async (e) => {
                  const { response, data } = await fetchJson("/api/admin/design/tags", {
                    method: "PATCH",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({ category_key: category.key, pick_count: Number(e.target.value) }),
                  });
                  if (!response.ok) return showToast(data.error || "更新失败");
                  showToast(`「${category.name}」每类抽取 ${e.target.value} 个`);
                  load();
                }}
              >
                {[1, 2, 3, 4, 5].map((count) => <option key={count} value={count}>{count} 个</option>)}
              </select>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
              {values.map((tag) => (
                <span key={tag.id} style={{ display: "inline-flex", alignItems: "center", gap: 6, background: tag.status === "active" ? C.surface : C.surfaceSoft, padding: "4px 10px", borderRadius: 999, fontSize: 12.5, color: tag.status === "active" ? C.ink : C.faint }}>
                  {tag.value}
                  <button type="button" onClick={() => toggleTag(tag.id, tag.status)} style={{ border: "none", background: "transparent", cursor: "pointer", color: C.faint, padding: 0, display: "inline-flex" }} aria-label={tag.status === "active" ? "归档" : "恢复"}>
                    <X size={12} />
                  </button>
                </span>
              ))}
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
              <input style={styles.input} placeholder={`新增${category.name}…`} value={newValue[category.key] || ""} onChange={(e) => setNewValue((prev) => ({ ...prev, [category.key]: e.target.value }))} onKeyDown={(e) => { if (e.key === "Enter") addTag(category.key); }} />
              <button type="button" style={styles.btnGhost} onClick={() => addTag(category.key)}><Plus size={13} />添加</button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ===== 操作员 API Keys 管理（超管）=====

function KeysPanel({ showToast }: { showToast: (message: string) => void }) {
  const [keys, setKeys] = useState<DesignApiKey[]>([]);
  const [form, setForm] = useState({ operator_name: "", base_url: "", api_key: "", model: "", note: "" });

  const load = useCallback(async () => {
    const { response, data } = await fetchJson("/api/admin/design/api-keys", { cache: "no-store" });
    if (response.ok) setKeys(data.keys || []);
  }, []);

  useEffect(() => {
    load().catch(() => showToast("API Keys 加载失败"));
  }, [load, showToast]);

  async function save() {
    if (!form.operator_name || !form.api_key || !form.model) return showToast("操作员、API Key、模型均为必填");
    const { response, data } = await fetchJson("/api/admin/design/api-keys", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        operator_name: form.operator_name,
        base_url: form.base_url || "https://ark.cn-beijing.volces.com/api/v3",
        api_key: form.api_key,
        model: form.model,
        note: form.note,
      }),
    });
    if (!response.ok) return showToast(data.error || "保存失败");
    setForm({ operator_name: "", base_url: "", api_key: "", model: "", note: "" });
    showToast("已保存，Key 已加密存储、服务端转发，不进入浏览器");
    load();
  }

  async function toggle(id: number, enabled: number) {
    const { response } = await fetchJson(`/api/admin/design/api-keys/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ enabled: enabled ? 0 : 1 }),
    });
    if (response.ok) showToast(enabled ? "已停用" : "已启用");
    load();
  }

  async function remove(id: number) {
    const { response } = await fetchJson(`/api/admin/design/api-keys/${id}`, { method: "DELETE" });
    if (response.ok) showToast("已删除");
    load();
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={styles.card}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>新增操作员（每人一个豆包 Key，消耗各自算力）</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <input style={styles.input} placeholder="操作员名称（必填）" value={form.operator_name} onChange={(e) => setForm({ ...form, operator_name: e.target.value })} />
          <input style={styles.input} placeholder="Base URL（默认豆包火山方舟）" value={form.base_url} onChange={(e) => setForm({ ...form, base_url: e.target.value })} />
          <input style={styles.input} placeholder="豆包 API Key（必填，加密存储）" value={form.api_key} onChange={(e) => setForm({ ...form, api_key: e.target.value })} />
          <input style={styles.input} placeholder="模型 / 推理接入点 ID（必填）" value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} />
          <input style={{ ...styles.input, gridColumn: "1 / 3" }} placeholder="备注" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
        </div>
        <div style={{ marginTop: 10 }}><button type="button" style={styles.btn} onClick={save}><Plus size={14} />保存</button></div>
      </div>
      {keys.length === 0 ? <div style={styles.card}><p style={{ color: C.faint, fontSize: 13, textAlign: "center", padding: 20 }}>还没有操作员配置</p></div> : keys.map((key) => (
        <div key={key.id} style={{ ...styles.card, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 220 }}>
            <strong style={{ fontSize: 14 }}>{key.operator_name}</strong>
            <span style={{ fontSize: 12, color: key.enabled ? C.success : C.danger, marginLeft: 8 }}>{key.enabled ? "启用中" : "已停用"}</span>
            <div style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>{key.model} · {key.base_url}{key.note ? ` · ${key.note}` : ""}</div>
          </div>
          <button type="button" style={styles.btnGhost} onClick={() => toggle(key.id, key.enabled)}>{key.enabled ? "停用" : "启用"}</button>
          <button type="button" style={styles.btnGhost} onClick={() => remove(key.id)}><Trash2 size={14} />删除</button>
        </div>
      ))}
    </div>
  );
}
