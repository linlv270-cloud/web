import { all, one, run, transaction } from "./database";
import type {
  CooperationPreferences,
  CooperationSupplyNamespace,
  CooperationSupplyFact,
  TaxonomyTerm,
} from "./types";

export const adaptationPreferenceOptions = [
  "保持我原来的内容",
  "可以调整材料 / 颜色",
  "可以做活动限定",
  "可以调整体验内容",
  "可以根据主题重新设计",
  "可以做品牌联名",
  "具体项目再聊",
] as const;

export const opportunityInterestOptions = [
  "主题活动",
  "商业空间",
  "品牌合作",
  "工作坊",
  "展览",
  "快闪",
  "异地活动",
  "联名",
  "礼品采购",
  "内容拍摄",
  "都可以先聊聊",
] as const;

type SupplyRow = Omit<TaxonomyTerm, "namespace"> & {
  namespace: CooperationSupplyNamespace;
  source: string;
};
type SupplyFactRow = {
  id: number;
  namespace: CooperationSupplyNamespace;
  original_text: string;
  source: "self";
  status: "active";
  created_at: string;
  updated_at: string;
};

function parseJson<T>(value: string | null | undefined, fallback: T): T {
  try {
    return value ? JSON.parse(value) as T : fallback;
  } catch {
    return fallback;
  }
}

function choiceList(value: unknown, options: readonly string[], label: string) {
  if (!Array.isArray(value)) return [];
  const values = [...new Set(value.map((item) => String(item).trim()).filter(Boolean))];
  if (values.some((item) => !options.includes(item)))
    throw new Error(`${label}选项已失效，请刷新后重试`);
  return values;
}

function mapTerm(row: TaxonomyTerm): TaxonomyTerm {
  return {
    id: row.id,
    namespace: row.namespace,
    termKey: row.termKey,
    label: row.label,
    version: row.version,
    status: row.status,
  };
}

function activeSupplyOptions(namespace: CooperationSupplyNamespace) {
  return all<{
    id: number;
    namespace: CooperationSupplyNamespace;
    term_key: string;
    label: string;
    version: string;
    status: TaxonomyTerm["status"];
  }>(
    `SELECT id, namespace, term_key, label, version, status
     FROM taxonomy_terms
     WHERE namespace = ? AND version = 'v1' AND status = 'active'
     ORDER BY term_key`,
    namespace,
  ).map((row) => ({
    id: row.id,
    namespace: row.namespace,
    termKey: row.term_key,
    label: row.label,
    version: row.version,
    status: row.status,
  }));
}

function creatorSupplyRows(creatorId: number) {
  return all<SupplyRow>(
    `SELECT DISTINCT t.id, t.namespace, t.term_key AS termKey, t.label, t.version, t.status, ctt.source
     FROM creator_taxonomy_terms ctt
     JOIN taxonomy_terms t ON t.id = ctt.taxonomy_term_id
     WHERE ctt.creator_id = ? AND t.namespace IN ('O', 'X') AND t.status = 'active'
     UNION
     SELECT DISTINCT t.id, t.namespace, t.term_key AS termKey, t.label, t.version, t.status, 'legacy'
     FROM creator_tags ct
     JOIN tag_taxonomy_mappings m ON m.tag_id = ct.tag_id
     JOIN taxonomy_terms t ON t.id = m.taxonomy_term_id
     WHERE ct.creator_id = ? AND t.namespace IN ('O', 'X') AND t.status = 'active'
     UNION
     SELECT DISTINCT t.id, t.namespace, t.term_key AS termKey, t.label, t.version, t.status, 'discovery_answer'
     FROM creator_discovery_answers a
     JOIN creator_discovery_answer_terms at ON at.answer_id = a.id
     JOIN taxonomy_terms t ON t.id = at.taxonomy_term_id
     WHERE a.creator_id = ? AND a.question_key = 'q2_supply_experience'
       AND t.namespace IN ('O', 'X') AND t.status = 'active'
     ORDER BY namespace, term_key, source`,
    creatorId,
    creatorId,
    creatorId,
  );
}

function cooperationSupply(creatorId: number, hasSavedPreferences: boolean) {
  const rows = creatorSupplyRows(creatorId);
  const selected = hasSavedPreferences
    ? rows.filter((row) => row.source === "cooperation")
    : rows.filter((row) => row.source === "cooperation")
      .concat(rows.filter((row) => row.source !== "cooperation"));
  const result: Record<CooperationSupplyNamespace, TaxonomyTerm[]> = { O: [], X: [] };
  const seen = new Set<string>();
  for (const row of selected) {
    const key = `${row.namespace}:${row.termKey}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result[row.namespace].push(mapTerm(row));
  }
  return result;
}

function cooperationSupplyFacts(creatorId: number) {
  const result: Record<CooperationSupplyNamespace, CooperationSupplyFact[]> = { O: [], X: [] };
  for (const row of all<SupplyFactRow>(
    `SELECT id, namespace, original_text, source, status, created_at, updated_at
     FROM creator_cooperation_supply_facts
     WHERE creator_id = ? AND status = 'active'
     ORDER BY namespace, id`,
    creatorId,
  )) {
    result[row.namespace].push({
      id: row.id,
      namespace: row.namespace,
      originalText: row.original_text,
      source: row.source,
      status: row.status,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    });
  }
  return result;
}

export function getCooperationPreferences(creatorId: number): CooperationPreferences {
  if (!one("SELECT id FROM creators WHERE id = ?", creatorId))
    throw new Error("用户不存在");
  const row = one<{
    adaptation_preferences: string;
    opportunity_interests: string;
    updated_at: string;
  }>(
    `SELECT adaptation_preferences, opportunity_interests, updated_at
     FROM creator_cooperation_preferences
     WHERE creator_id = ?`,
    creatorId,
  );
  return {
    supply: cooperationSupply(creatorId, Boolean(row)),
    supplyOptions: {
      O: activeSupplyOptions("O"),
      X: activeSupplyOptions("X"),
    },
    supplyFacts: cooperationSupplyFacts(creatorId),
    adaptationPreferences: choiceList(
      parseJson(row?.adaptation_preferences, []),
      adaptationPreferenceOptions,
      "变化意愿",
    ),
    opportunityInterests: choiceList(
      parseJson(row?.opportunity_interests, []),
      opportunityInterestOptions,
      "机会类型",
    ),
    updatedAt: row?.updated_at || null,
  };
}

function normalizedSupply(creatorId: number, input: unknown) {
  const raw = input && typeof input === "object" && !Array.isArray(input)
    ? input as Record<string, unknown>
    : {};
  const values: Record<CooperationSupplyNamespace, string[]> = {
    O: Array.isArray(raw.O) ? [...new Set(raw.O.map(String).map((item) => item.trim()).filter(Boolean))] : [],
    X: Array.isArray(raw.X) ? [...new Set(raw.X.map(String).map((item) => item.trim()).filter(Boolean))] : [],
  };
  const terms = all<{
    id: number;
    namespace: CooperationSupplyNamespace;
    term_key: string;
    label: string;
    version: string;
    status: TaxonomyTerm["status"];
  }>(
    `SELECT id, namespace, term_key, label, version, status
     FROM taxonomy_terms
     WHERE version = 'v1' AND status = 'active' AND namespace IN ('O', 'X')`,
  );
  const byKey = new Map(terms.map((term) => [`${term.namespace}:${term.term_key}`, term]));
  const selected: Array<{ id: number; namespace: CooperationSupplyNamespace }> = [];
  for (const namespace of ["O", "X"] as const) {
    if (values[namespace].length > 8) throw new Error(`${namespace} 最多选择8项`);
    for (const termKey of values[namespace]) {
      const term = byKey.get(`${namespace}:${termKey}`);
      if (!term) throw new Error("供给选项已失效，请刷新后重试");
      selected.push({ id: term.id, namespace });
    }
  }
  if (!one("SELECT id FROM creators WHERE id = ?", creatorId))
    throw new Error("用户不存在");
  return selected;
}

function normalizedSupplyFacts(input: unknown) {
  const raw = input && typeof input === "object" && !Array.isArray(input)
    ? input as Record<string, unknown>
    : {};
  const selected: Record<CooperationSupplyNamespace, string[]> = { O: [], X: [] };
  for (const namespace of ["O", "X"] as const) {
    const values = Array.isArray(raw[namespace]) ? raw[namespace] : [];
    for (const item of values) {
      const value = item && typeof item === "object" && !Array.isArray(item)
        ? String((item as Record<string, unknown>).originalText || "").trim()
        : String(item || "").trim();
      if (!value) continue;
      if (value.length > 200) throw new Error("补充内容最多200字");
      if (!selected[namespace].includes(value)) selected[namespace].push(value);
    }
  }
  return selected;
}

export function saveCooperationPreferences(input: {
  creatorId: number;
  supply?: unknown;
  supplyFacts?: unknown;
  adaptationPreferences?: unknown;
  opportunityInterests?: unknown;
}) {
  const adaptationPreferences = choiceList(
    input.adaptationPreferences,
    adaptationPreferenceOptions,
    "变化意愿",
  );
  const opportunityInterests = choiceList(
    input.opportunityInterests,
    opportunityInterestOptions,
    "机会类型",
  );
  const supply = normalizedSupply(input.creatorId, input.supply);
  const supplyFacts = normalizedSupplyFacts(input.supplyFacts);
  transaction(() => {
    run(
      `INSERT INTO creator_cooperation_preferences(
        creator_id, adaptation_preferences, opportunity_interests
      ) VALUES (?, ?, ?)
      ON CONFLICT(creator_id) DO UPDATE SET
        adaptation_preferences = excluded.adaptation_preferences,
        opportunity_interests = excluded.opportunity_interests,
        updated_at = CURRENT_TIMESTAMP`,
      input.creatorId,
      JSON.stringify(adaptationPreferences),
      JSON.stringify(opportunityInterests),
    );
    run(
      `DELETE FROM creator_taxonomy_terms
       WHERE creator_id = ? AND source = 'cooperation'
         AND taxonomy_term_id IN (
           SELECT id FROM taxonomy_terms WHERE namespace IN ('O', 'X')
         )`,
      input.creatorId,
    );
    for (const term of supply)
      run(
        `INSERT INTO creator_taxonomy_terms(creator_id, taxonomy_term_id, source)
         VALUES (?, ?, 'cooperation')
         ON CONFLICT(creator_id, taxonomy_term_id, source) DO UPDATE SET
           updated_at = CURRENT_TIMESTAMP`,
        input.creatorId,
        term.id,
      );
    run(
      `UPDATE creator_cooperation_supply_facts
       SET status = 'inactive', updated_at = CURRENT_TIMESTAMP
       WHERE creator_id = ?`,
      input.creatorId,
    );
    for (const namespace of ["O", "X"] as const) {
      for (const originalText of supplyFacts[namespace])
        run(
          `INSERT INTO creator_cooperation_supply_facts(
            creator_id, namespace, original_text, source, status
          ) VALUES (?, ?, ?, 'self', 'active')
          ON CONFLICT(creator_id, namespace, original_text) DO UPDATE SET
            source = 'self',
            status = 'active',
            updated_at = CURRENT_TIMESTAMP`,
          input.creatorId,
          namespace,
          originalText,
        );
    }
  });
  return getCooperationPreferences(input.creatorId);
}
