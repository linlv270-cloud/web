import crypto from "node:crypto";
import { all, one, run } from "./database";
import { listAdminCreators } from "./repository";
import { cleanText } from "./security";

export type VisualizationTagOption = {
  id: number;
  ids: number[];
  label: string;
  category: "";
};

export type VisualizationPlan = {
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
  aiRunId: number | null;
  createdByLabel: string;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type PlanRow = {
  id: number;
  plan_date: string;
  start_date: string;
  end_date: string;
  province: string;
  city: string;
  source: VisualizationPlan["source"];
  title: string;
  description: string;
  status: VisualizationPlan["status"];
  resource_project_id: string | null;
  ai_run_id: number | null;
  created_by_label: string;
  published_at: string | null;
  created_at: string;
  updated_at: string;
};

export type VisualizationAiSettings = {
  enabled: boolean;
  promptTemplate: string;
  minCreatorCount: number;
  scheduleWeekday: number;
  scheduleHour: number;
  horizonDays: number;
  requireReview: boolean;
  maxCandidatesPerRun: number;
  lastAutoRunAt: string | null;
  updatedBy: string;
  updatedAt: string;
};

export type VisualizationAiProvider = {
  id: number;
  name: string;
  provider: string;
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
  lastUsedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type VisualizationAiRun = {
  id: number;
  triggerType: "manual" | "scheduled";
  status: "queued" | "running" | "completed" | "no_candidates" | "failed";
  scope: { province?: string; city?: string; date?: string };
  candidateCount: number;
  generatedCount: number;
  providerSummary: Record<string, number>;
  error: string;
  requestedBy: string;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
};

function mapPlan(row: PlanRow): VisualizationPlan {
  return {
    id: row.id,
    planDate: row.start_date || row.plan_date,
    startDate: row.start_date || row.plan_date,
    endDate: row.end_date || row.start_date || row.plan_date,
    province: row.province,
    city: row.city,
    source: row.source,
    title: row.title,
    description: row.description,
    status: row.status,
    resourceProjectId: row.resource_project_id,
    aiRunId: row.ai_run_id,
    createdByLabel: row.created_by_label,
    publishedAt: row.published_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function parseJson<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export function listVisibleVisualizationTags(filters: { province?: string; city?: string } = {}): VisualizationTagOption[] {
  const clauses = ["t.status = 'active'", "c.suspended = 0"];
  const values: string[] = [];
  if (filters.province) {
    clauses.push("c.province = ?");
    values.push(cleanText(filters.province, 20));
  }
  if (filters.city) {
    clauses.push("c.city = ?");
    values.push(cleanText(filters.city, 30));
  }
  const rows = all<{ id: number; label: string; usage_count: number }>(
    `SELECT t.id, t.label, COUNT(DISTINCT c.id) AS usage_count
     FROM tags t
     JOIN creator_tags ct ON ct.tag_id = t.id
     JOIN creators c ON c.id = ct.creator_id
     WHERE ${clauses.join(" AND ")}
     GROUP BY t.id, t.label
     HAVING COUNT(DISTINCT c.id) > 0
     ORDER BY usage_count DESC, t.label COLLATE NOCASE, t.id`,
    ...values,
  );
  const merged = new Map<string, { ids: number[]; usageCount: number }>();
  rows.forEach((row) => {
    const current = merged.get(row.label) || { ids: [], usageCount: 0 };
    current.ids.push(row.id);
    current.usageCount += Number(row.usage_count || 0);
    merged.set(row.label, current);
  });
  return [...merged.entries()]
    .sort((a, b) => b[1].usageCount - a[1].usageCount || a[0].localeCompare(b[0], "zh-CN"))
    .map(([label, value]) => ({ id: value.ids[0], ids: value.ids, label, category: "" }));
}

export function listVisualizationPlans(filters: { date?: string; startDate?: string; endDate?: string; province?: string; city?: string; publishedOnly?: boolean } = {}) {
  const clauses: string[] = [];
  const values: Array<string | number> = [];
  if (filters.date) {
    clauses.push("COALESCE(NULLIF(start_date, ''), plan_date) <= ? AND COALESCE(NULLIF(end_date, ''), plan_date) >= ?");
    const date = cleanText(filters.date, 10);
    values.push(date, date);
  } else if (filters.startDate || filters.endDate) {
    const startDate = cleanText(filters.startDate || filters.endDate, 10);
    const endDate = cleanText(filters.endDate || filters.startDate, 10);
    clauses.push("COALESCE(NULLIF(start_date, ''), plan_date) <= ? AND COALESCE(NULLIF(end_date, ''), plan_date) >= ?");
    values.push(endDate, startDate);
  }
  if (filters.province) { clauses.push("province = ?"); values.push(cleanText(filters.province, 20)); }
  if (filters.city) { clauses.push("city = ?"); values.push(cleanText(filters.city, 30)); }
  clauses.push(filters.publishedOnly ? "status = 'published'" : "status != 'archived'");
  return all<PlanRow>(
    `SELECT * FROM visualization_plans WHERE ${clauses.join(" AND ")}
     ORDER BY COALESCE(NULLIF(start_date, ''), plan_date) DESC,
       CASE source WHEN 'manual' THEN 1 WHEN 'resource' THEN 2 ELSE 3 END,
       created_at DESC`,
    ...values,
  ).map(mapPlan);
}

export function saveVisualizationPlan(input: Record<string, unknown>, actor: { id: number | null; label: string }) {
  const id = Number(input.id || 0);
  const startDate = cleanText(input.startDate || input.planDate, 10);
  const endDate = cleanText(input.endDate || input.startDate || input.planDate, 10);
  const province = cleanText(input.province, 20);
  const city = cleanText(input.city, 30);
  const title = cleanText(input.title, 80);
  const description = cleanText(input.description, 1200);
  let source: VisualizationPlan["source"] = input.source === "resource" ? "resource" : "manual";
  const status = input.status === "published" ? "published" : "draft";
  const resourceProjectId = cleanText(input.resourceProjectId, 80) || null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) throw new Error("请选择投放起止日期");
  if (startDate > endDate) throw new Error("投放结束日期不能早于开始日期");
  if (!city) throw new Error("请选择投放城市");
  if (!title) throw new Error("请填写投放主题");

  if (id) {
    const existing = one<PlanRow>("SELECT * FROM visualization_plans WHERE id = ?", id);
    if (!existing) throw new Error("方案不存在");
    if (existing.source === "ai") source = "ai";
    run(
      `UPDATE visualization_plans SET plan_date = ?, start_date = ?, end_date = ?, province = ?, city = ?, source = ?,
       title = ?, description = ?, status = ?, resource_project_id = ?,
       created_by_admin_id = ?, created_by_label = ?,
       published_at = CASE WHEN ? = 'published' THEN COALESCE(published_at, CURRENT_TIMESTAMP) ELSE NULL END,
       updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      startDate, startDate, endDate, province, city, source, title, description, status, resourceProjectId,
      actor.id, cleanText(actor.label, 80), status, id,
    );
  } else {
    run(
      `INSERT INTO visualization_plans(
        plan_date, start_date, end_date, province, city, source, title, description, status, resource_project_id,
        created_by_admin_id, created_by_label, published_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CASE WHEN ? = 'published' THEN CURRENT_TIMESTAMP ELSE NULL END)`,
      startDate, startDate, endDate, province, city, source, title, description, status, resourceProjectId,
      actor.id, cleanText(actor.label, 80), status,
    );
  }
  return listVisualizationPlans();
}

export function setVisualizationPlanStatus(id: number, status: VisualizationPlan["status"]) {
  if (!Number.isInteger(id) || id <= 0) throw new Error("方案不存在");
  if (!(["draft", "published", "archived"] as string[]).includes(status)) throw new Error("方案状态无效");
  run(
    `UPDATE visualization_plans SET status = ?,
     published_at = CASE WHEN ? = 'published' THEN COALESCE(published_at, CURRENT_TIMESTAMP) ELSE published_at END,
     updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    status, status, id,
  );
  return listVisualizationPlans();
}

type AiSettingsRow = {
  enabled: number; prompt_template: string; min_creator_count: number; schedule_weekday: number;
  schedule_hour: number; horizon_days: number; require_review: number; max_candidates_per_run: number;
  last_auto_run_at: string | null; updated_by: string; updated_at: string;
};

export function getVisualizationAiSettings(): VisualizationAiSettings {
  const row = one<AiSettingsRow>("SELECT * FROM visualization_ai_settings WHERE id = 1");
  if (!row) throw new Error("AI方案设置未初始化");
  return {
    enabled: Boolean(row.enabled),
    promptTemplate: row.prompt_template,
    minCreatorCount: row.min_creator_count,
    scheduleWeekday: row.schedule_weekday,
    scheduleHour: row.schedule_hour,
    horizonDays: row.horizon_days,
    requireReview: Boolean(row.require_review),
    maxCandidatesPerRun: row.max_candidates_per_run,
    lastAutoRunAt: row.last_auto_run_at,
    updatedBy: row.updated_by,
    updatedAt: row.updated_at,
  };
}

export function saveVisualizationAiSettings(input: Record<string, unknown>, actor: string) {
  const prompt = cleanText(input.promptTemplate, 4000);
  const minCreatorCount = Math.max(1, Math.min(10000, Number(input.minCreatorCount || 20)));
  const scheduleWeekday = Math.max(1, Math.min(7, Number(input.scheduleWeekday || 1)));
  const scheduleHour = Math.max(0, Math.min(23, Number(input.scheduleHour ?? 9)));
  const horizonDays = Math.max(7, Math.min(365, Number(input.horizonDays || 90)));
  const maxCandidates = Math.max(1, Math.min(100, Number(input.maxCandidatesPerRun || 20)));
  if (!prompt) throw new Error("请填写AI方案提示词");
  run(
    `UPDATE visualization_ai_settings SET enabled = ?, prompt_template = ?, min_creator_count = ?,
     schedule_weekday = ?, schedule_hour = ?, horizon_days = ?, require_review = ?,
     max_candidates_per_run = ?, updated_by = ?, updated_at = CURRENT_TIMESTAMP WHERE id = 1`,
    input.enabled ? 1 : 0, prompt, minCreatorCount, scheduleWeekday, scheduleHour, horizonDays,
    input.requireReview === false ? 0 : 1, maxCandidates, cleanText(actor, 80),
  );
  return getVisualizationAiSettings();
}

type ProviderRow = {
  id: number; name: string; provider: string; model: string; base_url: string; api_key_env: string;
  priority: number; weight: number; max_concurrency: number; enabled: number;
  last_status: VisualizationAiProvider["lastStatus"]; last_error: string; last_used_at: string | null;
  created_at: string; updated_at: string;
};

function mapProvider(row: ProviderRow): VisualizationAiProvider {
  return {
    id: row.id, name: row.name, provider: row.provider, model: row.model, baseUrl: row.base_url,
    apiKeyEnv: row.api_key_env, keyConfigured: Boolean(process.env[row.api_key_env]), priority: row.priority,
    weight: row.weight, maxConcurrency: row.max_concurrency, enabled: Boolean(row.enabled),
    lastStatus: row.last_status, lastError: row.last_error, lastUsedAt: row.last_used_at,
    createdAt: row.created_at, updatedAt: row.updated_at,
  };
}

export function listVisualizationAiProviders() {
  return all<ProviderRow>(
    "SELECT * FROM visualization_ai_providers ORDER BY priority, enabled DESC, id",
  ).map(mapProvider);
}

function validateProviderUrl(value: unknown) {
  const raw = cleanText(value, 500);
  let url: URL;
  try { url = new URL(raw); } catch { throw new Error("AI接口地址无效"); }
  const host = url.hostname.toLowerCase();
  if (url.protocol !== "https:" || host === "localhost" || host === "127.0.0.1" || host === "::1" ||
      /^10\./.test(host) || /^192\.168\./.test(host) || /^172\.(1[6-9]|2\d|3[01])\./.test(host)) {
    throw new Error("AI接口必须是可公开访问的HTTPS地址");
  }
  return url.toString();
}

export function saveVisualizationAiProvider(input: Record<string, unknown>) {
  const id = Number(input.id || 0);
  const name = cleanText(input.name, 80);
  const model = cleanText(input.model, 120);
  const baseUrl = validateProviderUrl(input.baseUrl);
  const apiKeyEnv = cleanText(input.apiKeyEnv, 100).toUpperCase();
  if (!name || !model) throw new Error("请填写供应商名称和模型");
  if (!/^[A-Z][A-Z0-9_]{2,99}$/.test(apiKeyEnv)) throw new Error("密钥环境变量名称无效");
  const values = [
    name, model, baseUrl, apiKeyEnv,
    Math.max(1, Math.min(1000, Number(input.priority || 100))),
    Math.max(1, Math.min(100, Number(input.weight || 1))),
    Math.max(1, Math.min(10, Number(input.maxConcurrency || 1))),
    input.enabled === false ? 0 : 1,
  ] as const;
  if (id) {
    run(
      `UPDATE visualization_ai_providers SET name = ?, model = ?, base_url = ?, api_key_env = ?,
       priority = ?, weight = ?, max_concurrency = ?, enabled = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      ...values, id,
    );
  } else {
    run(
      `INSERT INTO visualization_ai_providers(
       name, model, base_url, api_key_env, priority, weight, max_concurrency, enabled
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ...values,
    );
  }
  return listVisualizationAiProviders();
}

export function deleteVisualizationAiProvider(id: number) {
  run("DELETE FROM visualization_ai_providers WHERE id = ?", id);
  return listVisualizationAiProviders();
}

type RunRow = {
  id: number; trigger_type: VisualizationAiRun["triggerType"]; status: VisualizationAiRun["status"];
  scope_json: string; candidate_count: number; generated_count: number; provider_summary: string;
  error: string; requested_by: string; started_at: string | null; finished_at: string | null; created_at: string;
};

function mapRun(row: RunRow): VisualizationAiRun {
  return {
    id: row.id, triggerType: row.trigger_type, status: row.status,
    scope: parseJson(row.scope_json, {}), candidateCount: row.candidate_count,
    generatedCount: row.generated_count, providerSummary: parseJson(row.provider_summary, {}),
    error: row.error, requestedBy: row.requested_by, startedAt: row.started_at,
    finishedAt: row.finished_at, createdAt: row.created_at,
  };
}

export function listVisualizationAiRuns(limit = 20) {
  return all<RunRow>(
    "SELECT * FROM visualization_ai_runs ORDER BY id DESC LIMIT ?",
    Math.max(1, Math.min(100, limit)),
  ).map(mapRun);
}

export function queueVisualizationAiRun(
  triggerType: VisualizationAiRun["triggerType"],
  requestedBy: string,
  scope: VisualizationAiRun["scope"] = {},
) {
  const result = run(
    `INSERT INTO visualization_ai_runs(trigger_type, scope_json, requested_by)
     VALUES (?, ?, ?)`,
    triggerType,
    JSON.stringify({
      province: cleanText(scope.province, 20),
      city: cleanText(scope.city, 30),
      date: /^\d{4}-\d{2}-\d{2}$/.test(scope.date || "") ? scope.date : "",
    }),
    cleanText(requestedBy, 80),
  );
  return Number(result.lastInsertRowid);
}

type Candidate = {
  date: string;
  province: string;
  city: string;
  creatorCount: number;
  calendarContext: string;
  tags: Record<string, Array<{ label: string; count: number }>>;
};

const SOLAR_TERMS = ["小寒", "大寒", "立春", "雨水", "惊蛰", "春分", "清明", "谷雨", "立夏", "小满", "芒种", "夏至", "小暑", "大暑", "立秋", "处暑", "白露", "秋分", "寒露", "霜降", "立冬", "小雪", "大雪", "冬至"];
const SOLAR_TERM_MINUTES = [0, 21208, 42467, 63836, 85337, 107014, 128867, 150921, 173149, 195551, 218072, 240693, 263343, 285989, 308563, 331033, 353350, 375494, 397447, 419210, 440795, 462224, 483532, 504758];
const POSITIVE_DATES: Record<string, string> = {
  "01-01": "元旦", "03-08": "国际妇女节", "03-12": "植树节", "04-23": "世界读书日",
  "05-01": "劳动节", "05-04": "青年节", "06-01": "儿童节", "09-10": "教师节",
  "10-01": "国庆节", "12-05": "国际志愿者日",
};

function solarTermDate(year: number, index: number) {
  const milliseconds = 31556925974.7 * (year - 1900) + SOLAR_TERM_MINUTES[index] * 60000 + Date.UTC(1900, 0, 6, 2, 5);
  return new Date(milliseconds).toISOString().slice(0, 10);
}

function calendarContext(date: string) {
  const year = Number(date.slice(0, 4));
  const values: string[] = [];
  const holiday = POSITIVE_DATES[date.slice(5)];
  if (holiday) values.push(holiday);
  SOLAR_TERMS.forEach((term, index) => { if (solarTermDate(year, index) === date) values.push(term); });
  return values.length ? values.join("、") : "普通周末或工作日，可从城市与主理人供给出发策划";
}

function dateRange(start: string, days: number) {
  const result: string[] = [];
  const date = new Date(`${start}T00:00:00+08:00`);
  for (let index = 0; index < days; index += 1) {
    result.push(new Date(date.getTime() + index * 86400000).toLocaleDateString("sv-SE", { timeZone: "Asia/Shanghai" }));
  }
  return result;
}

function topTags(creators: ReturnType<typeof listAdminCreators>, category: string) {
  const counts = new Map<string, number>();
  creators.forEach((creator) => creator.tags.filter((tag) => tag.category === category).forEach((tag) => {
    counts.set(tag.label, (counts.get(tag.label) || 0) + 1);
  }));
  return [...counts.entries()].map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "zh-CN")).slice(0, 8);
}

function buildCandidates(settings: VisualizationAiSettings, scope: VisualizationAiRun["scope"]): Candidate[] {
  const creators = listAdminCreators().filter((creator) => !creator.suspended && creator.city &&
    (!scope.province || creator.province === scope.province) && (!scope.city || creator.city === scope.city));
  const preferenceRows = all<{ creator_id: number; unavailable_dates: string; weekly_off: string }>(
    "SELECT creator_id, unavailable_dates, weekly_off FROM creator_preferences",
  );
  const preferences = new Map(preferenceRows.map((row) => [row.creator_id, {
    unavailable: new Set(parseJson<string[]>(row.unavailable_dates, [])),
    weeklyOff: new Set(parseJson<number[]>(row.weekly_off, [])),
  }]));
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Shanghai" });
  const dates = scope.date ? [scope.date] : dateRange(today, settings.horizonDays);
  const groups = new Map<string, typeof creators>();
  creators.forEach((creator) => {
    const key = `${creator.province}\u0000${creator.city}`;
    groups.set(key, [...(groups.get(key) || []), creator]);
  });
  const candidates: Candidate[] = [];
  groups.forEach((cityCreators, key) => {
    const [province, city] = key.split("\u0000");
    dates.forEach((date) => {
      const weekday = new Date(`${date}T12:00:00+08:00`).getDay() || 7;
      const available = cityCreators.filter((creator) => {
        const preference = preferences.get(creator.id);
        const scheduleKnown = creator.noBookings || Boolean(creator.scheduleConfirmedAt) || Boolean(preference);
        if (!scheduleKnown || preference?.unavailable.has(date) || preference?.weeklyOff.has(weekday)) return false;
        return !(creator.busyPeriods || []).some((period) => period.startDate <= date && period.endDate >= date);
      });
      if (available.length <= settings.minCreatorCount) return;
      candidates.push({
        date, province, city, creatorCount: available.length, calendarContext: calendarContext(date),
        tags: {
          "我的作品": topTags(available, "我的作品"),
          "现场体验": topTags(available, "现场体验"),
          "我的客群": topTags(available, "我的客群"),
          "我的风格": topTags(available, "我的风格"),
        },
      });
    });
  });
  return candidates.sort((a, b) => b.creatorCount - a.creatorCount || a.date.localeCompare(b.date))
    .slice(0, settings.maxCandidatesPerRun);
}

function chooseProvider(providers: VisualizationAiProvider[], excludedIds: Set<number> = new Set()) {
  const configured = providers.filter((provider) => provider.enabled && provider.keyConfigured && !excludedIds.has(provider.id));
  if (!configured.length) throw new Error("没有已启用且已配置密钥的AI供应商");
  const bestPriority = Math.min(...configured.map((provider) => provider.priority + (provider.lastStatus === "error" ? 1000 : 0)));
  const pool = configured.filter((provider) => provider.priority + (provider.lastStatus === "error" ? 1000 : 0) === bestPriority);
  const total = pool.reduce((sum, provider) => sum + provider.weight, 0);
  let pick = crypto.randomInt(total);
  for (const provider of pool) {
    pick -= provider.weight;
    if (pick < 0) return provider;
  }
  return pool[0];
}

async function generatePlan(provider: VisualizationAiProvider, settings: VisualizationAiSettings, candidate: Candidate) {
  const key = process.env[provider.apiKeyEnv];
  if (!key) throw new Error(`${provider.apiKeyEnv}尚未配置`);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60000);
  try {
    const response = await fetch(provider.baseUrl, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: provider.model,
        temperature: 0.65,
        messages: [
          { role: "system", content: settings.promptTemplate },
          { role: "user", content: JSON.stringify(candidate) },
        ],
      }),
      signal: controller.signal,
    });
    const data = await response.json() as { choices?: Array<{ message?: { content?: string } }>; error?: { message?: string } };
    if (!response.ok) throw new Error(cleanText(data.error?.message || `HTTP ${response.status}`, 500));
    const raw = String(data.choices?.[0]?.message?.content || "").replace(/^```(?:json)?\s*|\s*```$/g, "").trim();
    const parsed = parseJson<{ title?: string; description?: string }>(raw, {});
    const title = cleanText(parsed.title, 80);
    const description = cleanText(parsed.description, 1200);
    if (!title || !description) throw new Error("模型未返回有效的主题JSON");
    run(
      "UPDATE visualization_ai_providers SET last_status = 'healthy', last_error = '', last_used_at = CURRENT_TIMESTAMP WHERE id = ?",
      provider.id,
    );
    return { title, description };
  } catch (error) {
    const message = cleanText(error instanceof Error ? error.message : "AI调用失败", 500);
    run(
      "UPDATE visualization_ai_providers SET last_status = 'error', last_error = ?, last_used_at = CURRENT_TIMESTAMP WHERE id = ?",
      message, provider.id,
    );
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

let processing = false;

export async function processNextVisualizationAiRun() {
  if (processing) return false;
  processing = true;
  let currentId = 0;
  try {
    const queued = one<RunRow>("SELECT * FROM visualization_ai_runs WHERE status = 'queued' ORDER BY id LIMIT 1");
    if (!queued) return false;
    const claimed = run(
      "UPDATE visualization_ai_runs SET status = 'running', started_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'queued'",
      queued.id,
    );
    if (!claimed.changes) return false;
    currentId = queued.id;
    const settings = getVisualizationAiSettings();
    const scope = parseJson<VisualizationAiRun["scope"]>(queued.scope_json, {});
    const candidates = buildCandidates(settings, scope);
    run("UPDATE visualization_ai_runs SET candidate_count = ? WHERE id = ?", candidates.length, queued.id);
    if (!candidates.length) {
      run("UPDATE visualization_ai_runs SET status = 'no_candidates', finished_at = CURRENT_TIMESTAMP WHERE id = ?", queued.id);
      return true;
    }
    const providers = listVisualizationAiProviders();
    const providerSummary: Record<string, number> = {};
    let generated = 0;
    for (const candidate of candidates) {
      const attempted = new Set<number>();
      const errors: string[] = [];
      let generatedPlan: Awaited<ReturnType<typeof generatePlan>> | null = null;
      let successfulProvider: VisualizationAiProvider | null = null;
      while (attempted.size < providers.filter((provider) => provider.enabled && provider.keyConfigured).length) {
        const provider = chooseProvider(providers, attempted);
        attempted.add(provider.id);
        try {
          generatedPlan = await generatePlan(provider, settings, candidate);
          provider.lastStatus = "healthy";
          provider.lastError = "";
          successfulProvider = provider;
          break;
        } catch (error) {
          provider.lastStatus = "error";
          provider.lastError = cleanText(error instanceof Error ? error.message : "AI调用失败", 500);
          errors.push(`${provider.name}: ${provider.lastError}`);
        }
      }
      if (!generatedPlan || !successfulProvider) {
        throw new Error(errors.length ? `所有AI供应商均调用失败：${errors.join("；")}` : "没有已启用且已配置密钥的AI供应商");
      }
      const provider = successfulProvider;
      providerSummary[provider.name] = (providerSummary[provider.name] || 0) + 1;
      const status = settings.requireReview ? "draft" : "published";
      const existing = one<{ id: number }>(
        "SELECT id FROM visualization_plans WHERE source = 'ai' AND COALESCE(NULLIF(start_date, ''), plan_date) = ? AND city = ? AND title = ? AND status != 'archived'",
        candidate.date, candidate.city, generatedPlan.title,
      );
      if (existing) {
        run(
          `UPDATE visualization_plans SET description = ?, status = ?, ai_run_id = ?,
           published_at = CASE WHEN ? = 'published' THEN COALESCE(published_at, CURRENT_TIMESTAMP) ELSE NULL END,
           updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
          generatedPlan.description, status, queued.id, status, existing.id,
        );
      } else {
        run(
          `INSERT INTO visualization_plans(
           plan_date, start_date, end_date, province, city, source, title, description, status, ai_run_id,
           created_by_label, published_at
           ) VALUES (?, ?, ?, ?, ?, 'ai', ?, ?, ?, ?, 'AI方案任务',
             CASE WHEN ? = 'published' THEN CURRENT_TIMESTAMP ELSE NULL END)`,
          candidate.date, candidate.date, candidate.date, candidate.province, candidate.city, generatedPlan.title,
          generatedPlan.description, status, queued.id, status,
        );
      }
      generated += 1;
      run(
        "UPDATE visualization_ai_runs SET generated_count = ?, provider_summary = ? WHERE id = ?",
        generated, JSON.stringify(providerSummary), queued.id,
      );
    }
    run(
      "UPDATE visualization_ai_runs SET status = 'completed', finished_at = CURRENT_TIMESTAMP WHERE id = ?",
      queued.id,
    );
    return true;
  } catch (error) {
    if (currentId) {
      run(
        "UPDATE visualization_ai_runs SET status = 'failed', error = ?, finished_at = CURRENT_TIMESTAMP WHERE id = ?",
        cleanText(error instanceof Error ? error.message : "AI方案生成失败", 1000), currentId,
      );
    }
    return false;
  } finally {
    processing = false;
  }
}

export function queueScheduledVisualizationAiRunIfDue() {
  const settings = getVisualizationAiSettings();
  if (!settings.enabled) return false;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai", weekday: "short", hour: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date());
  const weekdayMap: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
  const weekday = weekdayMap[parts.find((part) => part.type === "weekday")?.value || "Mon"];
  const hour = Number(parts.find((part) => part.type === "hour")?.value || 0);
  if (weekday !== settings.scheduleWeekday || hour < settings.scheduleHour) return false;
  if (settings.lastAutoRunAt && Date.now() - new Date(settings.lastAutoRunAt).getTime() < 6 * 86400000) return false;
  const existing = one("SELECT id FROM visualization_ai_runs WHERE trigger_type = 'scheduled' AND status IN ('queued', 'running')");
  if (existing) return false;
  queueVisualizationAiRun("scheduled", "系统每周任务");
  run("UPDATE visualization_ai_settings SET last_auto_run_at = CURRENT_TIMESTAMP WHERE id = 1");
  return true;
}
