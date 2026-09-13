const sourceLabels: Record<string, string> = {
  CREATOR_CLUSTER: "主理人资源聚集",
  CONCEPT_FIRST: "平台主动创意",
  VENUE_REQUEST: "场地方需求",
  EXISTING_RELATIONSHIP: "既有合作延续",
};

const projectStatusLabels: Record<string, string> = {
  ACTIVE: "进行中",
  PAUSED: "已暂停",
  COMPLETED: "已完成",
  CANCELLED: "已取消",
  ARCHIVED: "已归档",
};

const healthLabels: Record<string, string> = {
  GREEN: "正常",
  YELLOW: "需关注",
  RED: "高风险",
};

const phaseStatusLabels: Record<string, string> = {
  PENDING: "待开始",
  IN_PROGRESS: "进行中",
  COMPLETED: "已完成",
  SKIPPED: "已跳过",
};

const taskStatusLabels: Record<string, string> = {
  DRAFT: "草稿",
  READY: "可开始",
  IN_PROGRESS: "进行中",
  WAITING_EXTERNAL: "等待外部",
  WAITING_INTERNAL: "等待内部",
  BLOCKED: "已阻塞",
  REVIEW: "待验收",
  REVISION_REQUIRED: "需修改",
  DONE: "已验收",
  CANCELLED: "已取消",
};

export function labelSource(value: string) {
  return sourceLabels[value] || value || "未填写";
}

export function labelProjectStatus(value: string) {
  return projectStatusLabels[value] || value || "未知";
}

export function labelHealth(value: string) {
  return healthLabels[value] || value || "未知";
}

export function labelPhaseStatus(value: string) {
  return phaseStatusLabels[value] || value || "未知";
}

export function labelTaskStatus(value: string) {
  return taskStatusLabels[value] || value || "未知";
}

export function formatDate(value: string | null | undefined, withTime = false) {
  if (!value) return "未安排";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  const options: Intl.DateTimeFormatOptions = withTime
    ? { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }
    : { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" };
  return new Intl.DateTimeFormat("zh-CN", options).format(date);
}

export function daysUntil(value: string | null | undefined) {
  if (!value) return "未安排";
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return "未安排";
  const nowParts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const targetParts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(time));
  const read = (parts: Intl.DateTimeFormatPart[]) => {
    const get = (type: string) => Number(parts.find((part) => part.type === type)?.value || 0);
    return Date.UTC(get("year"), get("month") - 1, get("day"));
  };
  const days = Math.round((read(targetParts) - read(nowParts)) / 86400000);
  if (days < 0) return `已开始 ${Math.abs(days)} 天`;
  if (days === 0) return "今天";
  return `${days} 天后`;
}

export function percent(done: number, total: number) {
  if (!total) return 0;
  return Math.min(100, Math.max(0, Math.round((done / total) * 100)));
}

export function textValue(value: unknown, fallback = "未填写") {
  if (typeof value !== "string" && typeof value !== "number") return fallback;
  const text = String(value).trim();
  return text || fallback;
}
