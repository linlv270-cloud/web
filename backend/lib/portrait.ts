import { randomToken } from "./security";
import { all, one, run, transaction } from "./database";
import { assetUrl } from "./storage";
import { getCreator, listCreatorTaxonomyTerms } from "./repository";
import { getCooperationPreferences } from "./cooperation";
import { contentSafety, cleanText } from "./security";
import type {
  PortraitImage,
  PortraitManagement,
  PortraitPreview,
  PortraitStatus,
  PortraitVisibility,
  TaxonomyNamespace,
} from "./types";

type PortraitRow = {
  id: number;
  creator_id: number;
  public_id: string;
  guide_number: string;
  status: PortraitStatus;
  display_title_override: string;
  representative_line_override: string;
  hero_media_key: string;
  gallery_media_json: string;
  gallery_configured: number;
  visibility_json: string;
  claimed_at: string | null;
  updated_at: string;
};

type PortraitSource = {
  displayTitle: string;
  representativeLine: string;
  difference: string;
  memory: string;
  creatorSaid: string[];
  images: Array<{ key: string; label: string }>;
};

export type ClaimedPortraitPresentation = {
  publicId: string;
  publicUrl: string;
  guideNumber: string;
  brandName: string;
  displayTitle: string;
  representativeLine: string;
  heroMediaKey: string;
  galleryMediaKeys: string[];
  supply: PortraitPreview["supply"];
  difference: string;
  memory: string;
  creatorSaid: string[];
  tags: Array<{ key: string; label: string }>;
};

const PUBLIC_PATH = "/creator.html?portrait=";
const PUBLIC_TAG_NAMESPACES = new Set<TaxonomyNamespace>(["R", "I", "X", "E", "S"]);
const DEFAULT_VISIBILITY: PortraitVisibility = {
  displayTitle: true,
  representativeLine: true,
  supply: true,
  difference: true,
  memory: true,
  creatorSaid: true,
  tags: true,
  hiddenTagKeys: [],
};

function parseJson<T>(value: string | null | undefined, fallback: T): T {
  try {
    return value ? JSON.parse(value) as T : fallback;
  } catch {
    return fallback;
  }
}

function portraitRow(creatorId: number) {
  return one<PortraitRow>(
    `SELECT id, creator_id, public_id, guide_number, status,
            display_title_override, representative_line_override,
            hero_media_key, gallery_media_json, gallery_configured, visibility_json,
            claimed_at, updated_at
     FROM creator_portraits
     WHERE creator_id = ?`,
    creatorId,
  );
}

function createPortrait(creatorId: number) {
  let publicId = "";
  let guideNumber = "";
  for (let attempt = 0; attempt < 5; attempt += 1) {
    publicId = `p-${randomToken().slice(0, 16)}`;
    guideNumber = `TDE-${randomToken().slice(0, 8).toUpperCase()}`;
    if (
      !one("SELECT id FROM creator_portraits WHERE public_id = ?", publicId)
      && !one("SELECT id FROM creator_portraits WHERE guide_number = ?", guideNumber)
    ) break;
  }
  run(
    `INSERT INTO creator_portraits(
      creator_id, public_id, guide_number, visibility_json
    ) VALUES (?, ?, ?, ?)`,
    creatorId,
    publicId,
    guideNumber,
    JSON.stringify(DEFAULT_VISIBILITY),
  );
  return portraitRow(creatorId);
}

function ensurePortrait(creatorId: number) {
  if (!getCreator(creatorId)) throw new Error("用户不存在");
  return portraitRow(creatorId) || createPortrait(creatorId);
}

function visibilityFor(row: PortraitRow): PortraitVisibility {
  const raw = parseJson<Partial<PortraitVisibility>>(row.visibility_json, {});
  const visibility = { ...DEFAULT_VISIBILITY };
  for (const key of Object.keys(DEFAULT_VISIBILITY) as Array<keyof PortraitVisibility>) {
    if (key === "hiddenTagKeys") continue;
    visibility[key] = raw[key] !== false;
  }
  visibility.hiddenTagKeys = Array.isArray(raw.hiddenTagKeys)
    ? [...new Set(
      raw.hiddenTagKeys.map((item) => String(item || "").trim())
        .filter((item) => /^[RIPXES]:[^:]+$/.test(item)),
    )]
    : [];
  return visibility;
}

function imageSources(creatorId: number) {
  const creator = one<{
    logo_key: string | null;
    work_keys: string;
    product_image_key: string;
    booth_image_key: string;
    history_image_key: string;
  }>(
    `SELECT logo_key, work_keys, product_image_key, booth_image_key, history_image_key
     FROM creators WHERE id = ?`,
    creatorId,
  );
  const keys: Array<{ key: string; label: string }> = [];
  const seen = new Set<string>();
  const add = (key: unknown, label: string) => {
    const normalized = String(key || "").trim();
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    keys.push({ key: normalized, label });
  };
  const works = parseJson<string[]>(creator?.work_keys, []);
  add(works[0], "品牌形象图");
  add(creator?.logo_key, "品牌 Logo");
  add(creator?.product_image_key, "产品图");
  add(creator?.booth_image_key, "摊位陈列图");
  add(creator?.history_image_key, "历史活动照片");
  for (const row of all<{ media_key: string }>(
    `SELECT DISTINCT m.media_key
     FROM creator_discovery_answer_media m
     JOIN creator_discovery_answers a ON a.id = m.answer_id
     WHERE a.creator_id = ? AND m.visibility = 'public'
     ORDER BY m.id`,
    creatorId,
  )) add(row.media_key, "问答配图");
  return keys;
}

function sourceData(creatorId: number): PortraitSource {
  const confirmedTitle = one<{ content: string }>(
    `SELECT content FROM creator_discovery_insights
     WHERE creator_id = ? AND insight_type = 'display_title' AND status = 'confirmed'
     ORDER BY updated_at DESC, id DESC LIMIT 1`,
    creatorId,
  )?.content || "";
  const confirmedLine = one<{ content: string }>(
    `SELECT content FROM creator_discovery_insights
     WHERE creator_id = ? AND insight_type = 'representative_line' AND status = 'confirmed'
     ORDER BY updated_at DESC, id DESC LIMIT 1`,
    creatorId,
  )?.content || "";
  const answers = all<{
    question_key: string;
    original_text: string;
    difference_original: string;
    memory_line_original: string;
  }>(
    `SELECT question_key, original_text, difference_original, memory_line_original
     FROM creator_discovery_answers
     WHERE creator_id = ?
     ORDER BY id`,
    creatorId,
  );
  const q3 = answers.find((answer) => answer.question_key === "q3_difference");
  const q4 = answers.find((answer) => answer.question_key === "q4_memory");
  const creatorSaid = [...new Set(
    answers
      .map((answer) => answer.original_text || answer.difference_original || answer.memory_line_original)
      .map((value) => value.trim())
      .filter(Boolean),
  )].slice(0, 3);
  return {
    displayTitle: confirmedTitle,
    representativeLine: confirmedLine,
    difference: String(q3?.difference_original || q3?.original_text || "").trim(),
    memory: String(q4?.memory_line_original || q4?.original_text || confirmedLine || "").trim(),
    creatorSaid,
    images: imageSources(creatorId),
  };
}

function currentSupply(creatorId: number) {
  const preferences = getCooperationPreferences(creatorId);
  const supply: PortraitPreview["supply"] = [];
  for (const namespace of ["O", "X"] as const) {
    for (const term of preferences.supply[namespace])
      supply.push({ namespace, label: term.label, source: "canonical" });
    for (const fact of preferences.supplyFacts[namespace])
      supply.push({ namespace, label: fact.originalText, source: "self" });
  }
  const seen = new Set<string>();
  return supply.filter((item) => {
    const key = `${item.namespace}:${item.label}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function portraitTagTerms(creatorId: number) {
  const answeredTerms = all<{
    id: number;
    namespace: TaxonomyNamespace;
    term_key: string;
    label: string;
    version: string;
    status: "active" | "pending" | "retired";
  }>(
    `SELECT DISTINCT t.id, t.namespace, t.term_key, t.label, t.version, t.status
     FROM creator_discovery_answers a
     JOIN creator_discovery_sessions s ON s.id = a.session_id
     JOIN creator_discovery_answer_terms at ON at.answer_id = a.id
     JOIN taxonomy_terms t ON t.id = at.taxonomy_term_id
     WHERE a.creator_id = ? AND s.status = 'feedback'
       AND a.question_key IN ('q1_identity_category', 'q6_style')
       AND t.namespace IN ('R', 'I', 'S') AND t.status = 'active'
     ORDER BY a.id, t.namespace, t.term_key`,
    creatorId,
  );
  const seen = new Set<string>();
  return [...listCreatorTaxonomyTerms(creatorId), ...answeredTerms.map((term) => ({
    id: term.id,
    namespace: term.namespace,
    termKey: term.term_key,
    label: term.label,
    version: term.version,
    status: term.status,
  }))]
    .filter((term) => PUBLIC_TAG_NAMESPACES.has(term.namespace) && term.status === "active")
    .filter((term) => !term.termKey.startsWith("legacy."))
    .filter((term) => {
      const key = `${term.namespace}:${term.termKey}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => {
      const priority = ["R", "I", "X", "E", "S"];
      return priority.indexOf(a.namespace) - priority.indexOf(b.namespace)
        || a.termKey.localeCompare(b.termKey);
    })
    .slice(0, 6);
}

function visiblePortraitTagTerms(creatorId: number, row: PortraitRow) {
  const hidden = new Set(visibilityFor(row).hiddenTagKeys);
  return portraitTagTerms(creatorId)
    .filter((term) => !hidden.has(`${term.namespace}:${term.termKey}`));
}

function portraitTags(creatorId: number, row: PortraitRow) {
  return visiblePortraitTagTerms(creatorId, row).map((term) => term.label);
}

function portraitTagOptions(creatorId: number, row: PortraitRow) {
  const hidden = new Set(visibilityFor(row).hiddenTagKeys);
  return portraitTagTerms(creatorId).map((term) => ({
    key: `${term.namespace}:${term.termKey}`,
    namespace: term.namespace,
    label: term.label,
    visible: !hidden.has(`${term.namespace}:${term.termKey}`),
  }));
}

function selectedGallery(row: PortraitRow, sources: Array<{ key: string; label: string }>) {
  const available = new Set(sources.map((item) => item.key));
  const hero = available.has(row.hero_media_key) ? row.hero_media_key : sources[0]?.key || "";
  const stored = parseJson<string[]>(row.gallery_media_json, []);
  const gallery = stored.filter((key) => available.has(key) && key !== hero);
  return {
    hero,
    gallery: row.gallery_configured
      ? gallery
      : sources.filter((item) => item.key !== hero).map((item) => item.key),
  };
}

function buildPreview(creatorId: number, row: PortraitRow, source: PortraitSource): PortraitPreview {
  const creator = getCreator(creatorId)!;
  const visibility = visibilityFor(row);
  const selected = selectedGallery(row, source.images);
  const galleryKeys = new Set(selected.gallery);
  const imageUrl = (key: string) => assetUrl(key) || "";
  return {
    brandName: creator.brandName,
    displayTitle: visibility.displayTitle ? row.display_title_override || source.displayTitle : "",
    representativeLine: visibility.representativeLine ? row.representative_line_override || source.representativeLine : "",
    heroImageUrl: selected.hero ? imageUrl(selected.hero) : "",
    supply: visibility.supply ? currentSupply(creatorId) : [],
    difference: visibility.difference ? source.difference : "",
    memory: visibility.memory && source.memory !== (visibility.representativeLine
      ? row.representative_line_override || source.representativeLine
      : "") ? source.memory : "",
    creatorSaid: visibility.creatorSaid ? source.creatorSaid : [],
    tags: visibility.tags ? portraitTags(creatorId, row) : [],
    gallery: source.images.filter((item) => galleryKeys.has(item.key)).map((item) => imageUrl(item.key)),
  };
}

function managementPayload(creatorId: number, row: PortraitRow): PortraitManagement {
  const source = sourceData(creatorId);
  const selected = selectedGallery(row, source.images);
  const publicUrl = row.status === "claimed" ? `${PUBLIC_PATH}${encodeURIComponent(row.public_id)}` : null;
  const images: PortraitImage[] = source.images.map((item) => ({
    key: item.key,
    label: item.label,
    url: assetUrl(item.key) || "",
    visible: item.key === selected.hero || selected.gallery.includes(item.key),
    isHero: item.key === selected.hero,
  }));
  return {
    portrait: {
      publicId: row.public_id,
      guideNumber: row.guide_number,
      status: row.status,
      claimedAt: row.claimed_at,
      publicUrl,
      updatedAt: row.updated_at,
    },
    editable: {
      displayTitleOverride: row.display_title_override,
      representativeLineOverride: row.representative_line_override,
      heroMediaKey: selected.hero,
      galleryMediaKeys: selected.gallery,
      galleryConfigured: Boolean(row.gallery_configured),
      visibility: visibilityFor(row),
    },
    source: {
      displayTitle: source.displayTitle,
      representativeLine: source.representativeLine,
    },
    preview: buildPreview(creatorId, row, source),
    images,
    tagOptions: portraitTagOptions(creatorId, row),
  };
}

function normalizeVisibility(value: unknown, current: PortraitVisibility) {
  const raw = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  const result = { ...current };
  const booleanKeys = [
    "displayTitle",
    "representativeLine",
    "supply",
    "difference",
    "memory",
    "creatorSaid",
    "tags",
  ] as const;
  for (const key of booleanKeys) {
    if (raw[key] !== undefined) result[key] = raw[key] === true;
  }
  if (Array.isArray(raw.hiddenTagKeys)) {
    result.hiddenTagKeys = [...new Set(
      raw.hiddenTagKeys.map((item) => String(item || "").trim()).filter((item) => /^[RIPXES]:[^:]+$/.test(item)),
    )];
  }
  return result;
}

function normalizeKeys(value: unknown) {
  return Array.isArray(value)
    ? [...new Set(value.map((item) => String(item || "").trim()).filter(Boolean))]
    : [];
}

function saveValues(creatorId: number, input: {
  displayTitleOverride?: unknown;
  representativeLineOverride?: unknown;
  heroMediaKey?: unknown;
  galleryMediaKeys?: unknown;
  visibility?: unknown;
}) {
  const row = ensurePortrait(creatorId)!;
  const source = sourceData(creatorId);
  const available = new Set(source.images.map((item) => item.key));
  const current = visibilityFor(row);
  const displayTitleOverride = input.displayTitleOverride === undefined
    ? row.display_title_override
    : cleanText(input.displayTitleOverride, 120);
  const representativeLineOverride = input.representativeLineOverride === undefined
    ? row.representative_line_override
    : cleanText(input.representativeLineOverride, 300);
  if (displayTitleOverride && !source.displayTitle)
    throw new Error("当前没有已确认的称号，暂时不能设置图鉴称号");
  if (contentSafety(displayTitleOverride, representativeLineOverride))
    throw new Error(contentSafety(displayTitleOverride, representativeLineOverride)!);
  const heroMediaKey = input.heroMediaKey === undefined
    ? selectedGallery(row, source.images).hero
    : String(input.heroMediaKey || "").trim();
  const galleryMediaKeys = input.galleryMediaKeys === undefined
    ? selectedGallery(row, source.images).gallery
    : normalizeKeys(input.galleryMediaKeys);
  if (heroMediaKey && !available.has(heroMediaKey)) throw new Error("主图已失效，请重新选择");
  if (galleryMediaKeys.some((key) => !available.has(key))) throw new Error("补充图片已失效，请重新选择");
  if (galleryMediaKeys.includes(heroMediaKey)) throw new Error("主图不能同时作为补充图片");
  const visibility = normalizeVisibility(input.visibility, current);
  run(
    `UPDATE creator_portraits
     SET display_title_override = ?, representative_line_override = ?,
         hero_media_key = ?, gallery_media_json = ?, gallery_configured = 1, visibility_json = ?,
         updated_at = CURRENT_TIMESTAMP
     WHERE creator_id = ?`,
    displayTitleOverride,
    representativeLineOverride,
    heroMediaKey,
    JSON.stringify(galleryMediaKeys),
    JSON.stringify(visibility),
    creatorId,
  );
  return managementPayload(creatorId, ensurePortrait(creatorId)!);
}

export function getPortraitManagement(creatorId: number) {
  return managementPayload(creatorId, ensurePortrait(creatorId)!);
}

export function updatePortrait(creatorId: number, input: Parameters<typeof saveValues>[1]) {
  return saveValues(creatorId, input);
}

export function getClaimedPortraitPresentation(creatorId: number): ClaimedPortraitPresentation {
  const row = ensurePortrait(creatorId)!;
  if (row.status !== "claimed") throw new Error("请先认领图鉴，再生成视觉输出");
  const source = sourceData(creatorId);
  const preview = buildPreview(creatorId, row, source);
  const selected = selectedGallery(row, source.images);
  const visibility = visibilityFor(row);
  return {
    publicId: row.public_id,
    publicUrl: `${PUBLIC_PATH}${encodeURIComponent(row.public_id)}`,
    guideNumber: row.guide_number,
    brandName: preview.brandName,
    displayTitle: preview.displayTitle,
    representativeLine: preview.representativeLine,
    heroMediaKey: selected.hero,
    galleryMediaKeys: selected.gallery,
    supply: visibility.supply ? preview.supply : [],
    difference: visibility.difference ? preview.difference : "",
    memory: visibility.memory ? preview.memory : "",
    creatorSaid: visibility.creatorSaid ? preview.creatorSaid : [],
    tags: visibility.tags
      ? visiblePortraitTagTerms(creatorId, row).map((term) => ({
        key: `${term.namespace}:${term.termKey}`,
        label: term.label,
      }))
      : [],
  };
}

export function claimPortrait(creatorId: number) {
  const row = ensurePortrait(creatorId)!;
  transaction(() => {
    run(
      `UPDATE creator_portraits
       SET status = 'claimed', claimed_at = COALESCE(claimed_at, CURRENT_TIMESTAMP),
           updated_at = CURRENT_TIMESTAMP
       WHERE creator_id = ?`,
      creatorId,
    );
  });
  return managementPayload(creatorId, portraitRow(creatorId)!);
}

function publicRow(publicRef: string) {
  const normalized = String(publicRef || "").trim();
  if (!normalized) return null;
  if (/^\d+$/.test(normalized)) {
    return one<PortraitRow>(
      `SELECT id, creator_id, public_id, guide_number, status,
              display_title_override, representative_line_override,
              hero_media_key, gallery_media_json, gallery_configured, visibility_json,
              claimed_at, updated_at
       FROM creator_portraits
       WHERE creator_id = ? AND status = 'claimed'`,
      Number(normalized),
    );
  }
  return one<PortraitRow>(
    `SELECT id, creator_id, public_id, guide_number, status,
            display_title_override, representative_line_override,
            hero_media_key, gallery_media_json, gallery_configured, visibility_json,
            claimed_at, updated_at
     FROM creator_portraits
     WHERE public_id = ? AND status = 'claimed'`,
    normalized,
  );
}

export function getPublicPortrait(publicRef: string) {
  const row = publicRow(publicRef);
  if (!row) return null;
  const source = sourceData(row.creator_id);
  const preview = buildPreview(row.creator_id, row, source);
  const selected = selectedGallery(row, source.images);
  return {
    guideNumber: row.guide_number,
    publicId: row.public_id,
    brandName: preview.brandName,
    displayTitle: preview.displayTitle,
    representativeLine: preview.representativeLine,
    heroImageUrl: selected.hero
      ? `/api/public/creator-media?portrait=${encodeURIComponent(row.public_id)}&key=${encodeURIComponent(selected.hero)}`
      : "",
    supply: preview.supply,
    difference: preview.difference,
    memory: preview.memory,
    creatorSaid: preview.creatorSaid,
    tags: preview.tags,
    imageUrls: selected.gallery.map((key) =>
      `/api/public/creator-media?portrait=${encodeURIComponent(row.public_id)}&key=${encodeURIComponent(key)}`),
  };
}

export function publicMediaKey(publicRef: string, key: string) {
  const row = publicRow(publicRef);
  if (!row) return null;
  const source = sourceData(row.creator_id);
  const selected = selectedGallery(row, source.images);
  const visible = new Set([selected.hero, ...selected.gallery].filter(Boolean));
  return visible.has(key) ? { portrait: row, key } : null;
}
