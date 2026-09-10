import { absoluteAsset } from "./api";

const operationLabels = ["限时限量", "今日上新", "首发尝鲜", "好评精选"];
const sceneLabels = ["带孩子玩", "和朋友玩", "自己放空", "定制礼物"];

function price(cents: number) {
  return cents > 0 ? `¥${Math.round(cents / 100)} 起` : "到店了解";
}

function operation(tags: any[] = [], fallback = "") {
  return (operationLabels.includes(fallback) ? fallback : "") || tags.find((tag) => operationLabels.includes(tag.label))?.label || "";
}

function uniqueTags(tags: Array<{ label: string; tone: string }>) {
  const seen = new Set<string>();
  return tags.filter((tag) => {
    if (!tag.label || seen.has(tag.label)) return false;
    seen.add(tag.label);
    return true;
  });
}

export function selfPlayCard(item: any, operationLabel = "") {
  const kit = item.kit || {};
  const venue = item.venue || {};
  const tags = uniqueTags([
    { label: [venue.city, venue.businessArea || venue.district].filter(Boolean).join(" · "), tone: "green" },
    { label: operation(kit.tags, operationLabel), tone: "" },
    { label: price(Number(kit.priceCents || 0)), tone: "" },
  ].filter((tag) => tag.label));
  return {
    kind: "self",
    key: `self:${item.kitId || kit.id}:${item.venueId || venue.id}`,
    kitId: item.kitId || kit.id,
    venueId: item.venueId || venue.id,
    title: kit.title || venue.name,
    description: kit.subtitle || kit.description || "营业时间内到店即可体验。",
    tags,
    facts: [
      { label: "营业时间", value: item.openingLabel || "按现场安排" },
      { label: "详细地址", value: venue.address || "查看体验点详情" },
      { label: "路线指引", value: venue.routeHint || "打开地图查看路线" },
    ],
    action: "查看详情",
  };
}

export function companionCard(project: any, operationLabel = "") {
  const projectTags = project.tags || [];
  const selectedTags = [...new Set<string>(projectTags
    .map((tag: any) => tag.label)
    .filter((label: string) => !operationLabels.includes(label)))]
    .slice(0, 2);
  const operationTag = operation(projectTags, operationLabel);
  const tags = uniqueTags([
    { label: [project.city, project.district].filter(Boolean).join(" · "), tone: "blue" },
    { label: `${project.minPeople || 1}-${project.maxPeople || project.minPeople || 1}人 · ${project.durationMinutes || "-"}分钟`, tone: "green" },
    ...selectedTags.map((label: string) => ({ label, tone: sceneLabels.includes(label) ? "" : "blue" })),
    ...(operationTag ? [{ label: operationTag, tone: "" }] : []),
  ].filter((tag) => tag.label));
  return {
    kind: "companion",
    key: `companion:${project.id}`,
    id: project.id,
    title: project.oneLiner || project.title,
    byline: project.creatorName || "奇灯新遇官",
    avatarText: String(project.creatorName || "奇").slice(0, 1),
    imageUrl: absoluteAsset(project.coverUrl),
    tags,
    action: "查看详情",
  };
}
