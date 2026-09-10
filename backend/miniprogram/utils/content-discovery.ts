import { absoluteAsset } from "./api";

export const operationTabs = [
  { value: "all", label: "推荐", icon: "/assets/icons/recommended-muted.svg", activeIcon: "/assets/icons/recommended-active.svg" },
  { value: "今日上新", label: "今日上新", icon: "/assets/icons/new-muted.svg", activeIcon: "/assets/icons/new-active.svg" },
  { value: "首发尝鲜", label: "首发尝鲜", icon: "/assets/icons/first-muted.svg", activeIcon: "/assets/icons/first-active.svg" },
  { value: "限时限量", label: "限时限量", icon: "/assets/icons/timer-muted.svg", activeIcon: "/assets/icons/timer-active.svg" },
  { value: "好评精选", label: "好评精选", icon: "/assets/icons/favorite-muted.svg", activeIcon: "/assets/icons/favorite-active.svg" },
];

export const sceneChoices = ["自己放空", "和朋友玩", "带孩子玩", "定制礼物"];
export const sceneOptions = [
  { value: "自己放空", label: "自己放空", icon: "/assets/icons/coffee-muted.svg", activeIcon: "/assets/icons/coffee-active.svg" },
  { value: "和朋友玩", label: "和朋友玩", icon: "/assets/icons/users-muted.svg", activeIcon: "/assets/icons/users-active.svg" },
  { value: "带孩子玩", label: "带孩子玩", icon: "/assets/icons/baby-muted.svg", activeIcon: "/assets/icons/baby-active.svg" },
  { value: "定制礼物", label: "定制礼物", icon: "/assets/icons/gift-muted.svg", activeIcon: "/assets/icons/gift-active.svg" },
];
const operationLabels = new Set(operationTabs.slice(1).map((item) => item.value));
const sceneLabels = new Set(sceneChoices);
const interestCategories = new Set(["我的作品", "我的客群", "我的风格", "现场体验"]);

function labels(tags: any[] = []) {
  return tags
    .filter((tag) => typeof tag !== "object" || !tag?.status || tag.status === "active")
    .map((tag) => String(tag?.label || tag || ""))
    .filter(Boolean);
}

function labelsIn(tags: any[] = [], category: string) {
  return tags
    .filter((tag) => typeof tag === "object" && tag?.category === category && (!tag?.status || tag.status === "active"))
    .map((tag) => String(tag.label || ""))
    .filter(Boolean);
}

function interestLabels(tags: any[] = []) {
  return tags
    .filter((tag) => typeof tag === "object" && interestCategories.has(tag?.category) && (!tag?.status || tag.status === "active"))
    .map((tag) => String(tag.label || ""))
    .filter(Boolean);
}

function shortCity(city = "") {
  return String(city).replace(/市$/, "");
}

export function projectPoster(project: any) {
  const tags = labels(project?.tags || []);
  const works = labelsIn(project?.tags || [], "我的作品");
  const interests = interestLabels(project?.tags || []);
  const title = String(project?.oneLiner || project?.title || "一场城市新体验");
  return {
    key: `project:${Number(project?.id || 0)}`,
    kind: "companion",
    id: Number(project?.id || 0),
    kitId: 0,
    venueId: 0,
    title,
    category: project?.primaryCategoryLabel || labelsIn(project?.tags || [], "我的作品")[0] || project?.creatorName || "结伴",
    byline: project?.creatorName || "奇灯新遇官",
    location: [shortCity(project?.city), project?.district].filter(Boolean).join(" · "),
    imageUrl: absoluteAsset(project?.coverUrl) || "/assets/companion-fallback.jpg",
    fallbackUrl: "/assets/companion-fallback.jpg",
    longTitle: Array.from(title).length > 11,
    operations: tags.filter((tag) => operationLabels.has(tag)),
    scenes: tags.filter((tag) => sceneLabels.has(tag)),
    works,
    interests,
    schedules: (project?.schedules || []).filter((item: any) => item?.status === "open"),
    startDate: String(project?.startDate || ""),
    endDate: String(project?.endDate || ""),
    editorialRank: 9999,
    quality: Number(Boolean(project?.coverUrl)) * 4 + Number(Boolean(project?.description)) + Number(Boolean(project?.primaryCategoryLabel)),
  };
}

export function kitPoster(entry: any) {
  const kit = entry?.kit || entry || {};
  const venue = entry?.venue || {};
  const tags = labels(kit.tags || []);
  const title = String(kit.title || "一场到店自助体验");
  const fallbackUrl = Number(entry?.kitId || kit.id || 0) % 2
    ? "/assets/self-play-fallback.jpg"
    : "/assets/self-play-fallback-alt.jpg";
  return {
    key: `kit:${Number(entry?.kitId || kit.id || 0)}:venue:${Number(entry?.venueId || venue.id || 0)}`,
    kind: "self",
    id: Number(entry?.kitId || kit.id || 0),
    kitId: Number(entry?.kitId || kit.id || 0),
    venueId: Number(entry?.venueId || venue.id || 0),
    title,
    category: labelsIn(kit.tags || [], "我的作品")[0] || "到店自助",
    byline: venue.name || "奇灯体验点",
    location: [shortCity(venue.city), venue.businessArea || venue.district].filter(Boolean).join(" · "),
    imageUrl: absoluteAsset(kit.coverUrl || venue.coverUrl) || fallbackUrl,
    fallbackUrl,
    longTitle: Array.from(title).length > 11,
    operations: tags.filter((tag) => operationLabels.has(tag)),
    scenes: tags.filter((tag) => sceneLabels.has(tag)),
    works: labelsIn(kit.tags || [], "我的作品"),
    interests: interestLabels(kit.tags || []),
    schedules: [],
    startDate: "",
    endDate: "",
    editorialRank: 9999,
    quality: Number(Boolean(kit.coverUrl || venue.coverUrl)) * 4 + Number(Boolean(kit.description)),
  };
}

function slotLabel(key: string) {
  return ({ limited: "限时限量", new_today: "今日上新", first_launch: "首发尝鲜", featured: "好评精选" } as Record<string, string>)[key] || "";
}

function slotPoster(slot: any, slotKey: string, rank: number) {
  if (!slot?.content) return null;
  const card = slot.contentType === "project" ? projectPoster(slot.content) : slot.contentType === "kit" ? kitPoster(slot.content) : null;
  if (!card) return null;
  const operation = slotLabel(slot.slotKey || slotKey);
  return {
    ...card,
    title: slot.titleOverride || card.title,
    longTitle: Array.from(String(slot.titleOverride || card.title)).length > 11,
    operations: operation ? [...new Set([...card.operations, operation])] : card.operations,
    editorialRank: rank,
  };
}

export function mergePosters(cards: any[]) {
  const values = new Map<string, any>();
  cards.filter(Boolean).forEach((card) => {
    const current = values.get(card.key);
    values.set(card.key, current ? {
      ...current,
      ...card,
      editorialRank: Math.min(current.editorialRank, card.editorialRank),
      operations: [...new Set([...current.operations, ...card.operations])],
      scenes: [...new Set([...current.scenes, ...card.scenes])],
      works: [...new Set([...current.works, ...card.works])],
      interests: [...new Set([...(current.interests || current.works), ...(card.interests || card.works)])],
    } : card);
  });
  return [...values.values()];
}

export function homePosters(home: any) {
  const slotOrder = ["featured", "new_today", "first_launch", "limited"];
  const editorial = slotOrder.flatMap((key, groupIndex) =>
    (home?.slots?.[key] || []).map((slot: any, index: number) => slotPoster(slot, key, groupIndex * 100 + index)),
  );
  return mergePosters([
    ...editorial,
    ...(home?.companionPreview || []).map(projectPoster),
    ...(home?.selfPlayPreview || []).map(kitPoster),
  ]);
}

function hash(value: string) {
  let result = 0;
  for (const character of value) result = ((result << 5) - result + character.charCodeAt(0)) | 0;
  return Math.abs(result);
}

function weekKey() {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 1);
  return `${now.getFullYear()}-${Math.ceil(((Number(now) - Number(start)) / 86400000 + start.getDay() + 1) / 7)}`;
}

function dayKey() {
  const now = new Date();
  return `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
}

function dateMatches(card: any, date: string) {
  if (!date || card.kind !== "companion") return true;
  if (card.schedules.length) return card.schedules.some((item: any) => item.availableDate === date);
  return Boolean(card.startDate && card.endDate && card.startDate <= date && date <= card.endDate);
}

export function filteredPosters(cards: any[], filters: { operation?: string; mode?: string; scene?: string; interest?: string; work?: string; date?: string }) {
  return cards.filter((card) => {
    if (filters.operation && filters.operation !== "all" && !card.operations.includes(filters.operation)) return false;
    if (filters.mode === "self" && card.kind !== "self") return false;
    if (filters.mode === "companion" && card.kind !== "companion") return false;
    if (filters.scene && !card.scenes.includes(filters.scene)) return false;
    const interest = filters.interest || filters.work || "";
    if (interest && !(card.interests || card.works || []).includes(interest)) return false;
    return dateMatches(card, filters.date || "");
  });
}

export function discoverySections(cards: any[]) {
  const weekly = [...cards].sort((left, right) =>
    left.editorialRank - right.editorialRank
    || right.quality - left.quality
    || hash(`${weekKey()}:${left.key}`) - hash(`${weekKey()}:${right.key}`),
  );
  const featuredCount = cards.length > 2 ? Math.min(5, Math.max(2, Math.ceil(cards.length / 3))) : Math.min(1, cards.length);
  const featured = weekly.slice(0, featuredCount);
  const used = new Set(featured.map((card) => card.key));
  const today = cards.filter((card) => !used.has(card.key)).sort((left, right) =>
    left.editorialRank - right.editorialRank
    || right.quality - left.quality
    || hash(`${dayKey()}:${left.key}`) - hash(`${dayKey()}:${right.key}`),
  );
  return { featured, today };
}

export function availableWorks(cards: any[], kind = "companion") {
  return [...new Set(cards.filter((card) => kind === "all" || card.kind === kind).flatMap((card) => card.works))]
    .sort((a, b) => a.localeCompare(b, "zh-CN"));
}

export function availableInterests(cards: any[], kind = "companion") {
  return [...new Set(cards
    .filter((card) => kind === "all" || card.kind === kind)
    .flatMap((card) => card.interests || card.works || []))]
    .sort((a, b) => a.localeCompare(b, "zh-CN"));
}
