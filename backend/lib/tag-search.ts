import type { Tag } from "./types";

const aliases: Array<[RegExp, string]> = [
  [/陶艺/g, "陶瓷"],
  [/手工/g, "手作"],
  [/饰品/g, "首饰"],
  [/甜点/g, "甜品"],
  [/烘培/g, "烘焙"],
  [/画画/g, "插画"],
  [/调酒/g, "酒饮"],
];

export function limitTagInput(value: string, maxLength = 7) {
  return Array.from(value).slice(0, maxLength).join("");
}

export function normalizeTagText(value: string) {
  return value
    .toLowerCase()
    .replace(/[\s，。、“”‘’！？,.!?/\\·—_（）()【】\[\]：:；;]/g, "");
}

function searchVariants(value: string) {
  const normalized = normalizeTagText(value);
  const stripped = normalized.replace(/^(?:我是|我做|我们做|主营|专做|制作|做|卖)+/, "");
  const variants = new Set([normalized, stripped]);
  for (const item of [...variants]) {
    let aliased = item;
    for (const [pattern, replacement] of aliases) aliased = aliased.replace(pattern, replacement);
    variants.add(aliased);
  }
  return [...variants].filter(Boolean);
}

function editDistance(left: string, right: string) {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    let diagonal = previous[0];
    previous[0] = leftIndex;
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const above = previous[rightIndex];
      previous[rightIndex] = Math.min(
        previous[rightIndex] + 1,
        previous[rightIndex - 1] + 1,
        diagonal + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1),
      );
      diagonal = above;
    }
  }
  return previous[right.length];
}

function matchScore(query: string, label: string) {
  if (query === label) return 120;
  if (label.includes(query)) return 96 - Math.max(0, label.length - query.length);
  if (query.includes(label)) return 88 - Math.max(0, query.length - label.length);

  const stem = label.replace(/(?:非遗传承人|内容创作者|工作坊老师|主理人|从业者|材料包|体验课|作品|服务|老师|传承人|匠人|演员|设计师|摄影师|插画师|艺术家|人|师)$/u, "");
  if (stem.length >= 2 && query.includes(stem)) return 82 - Math.max(0, label.length - stem.length);

  const distance = editDistance(query, label);
  const similarity = 1 - distance / Math.max(query.length, label.length);
  const queryChars = new Set(query);
  const labelChars = new Set(label);
  const shared = [...queryChars].filter((character) => labelChars.has(character)).length;
  const overlap = shared / Math.max(queryChars.size, labelChars.size);
  return similarity * 62 + overlap * 38;
}

export function rankTagMatches(tags: Tag[], input: string, limit = 12) {
  const variants = searchVariants(input);
  return tags
    .filter((tag) => tag.status === "active")
    .map((tag) => {
      const label = normalizeTagText(tag.label);
      const score = Math.max(...variants.map((query) => matchScore(query, label)));
      return { tag, score };
    })
    .filter((item) => item.score >= 34)
    .sort((left, right) => right.score - left.score || left.tag.label.length - right.tag.label.length || left.tag.id - right.tag.id)
    .slice(0, limit)
    .map((item) => item.tag);
}
