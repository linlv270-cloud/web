import { creatorTaxonomyNamespaces } from "./catalog";
import { all, one, run, transaction } from "./database";
import { cleanText, contentSafety } from "./security";
import { assetUrl } from "./storage";
import type {
  DiscoveryAnswer,
  DiscoveryInsight,
  DiscoveryInsightSource,
  DiscoveryInsightStatus,
  DiscoveryInsightType,
  DiscoveryQuestionKey,
  DiscoverySession,
  DiscoverySessionStatus,
  TaxonomyNamespace,
  TaxonomyTerm,
} from "./types";

export const DISCOVERY_VERSION = "v1";

export const discoveryQuestions: ReadonlyArray<{
  key: DiscoveryQuestionKey;
  title: string;
  hint: string;
  namespaces: readonly TaxonomyNamespace[];
}> = [
  {
    key: "q1_identity_category",
    title: "你平时主要在做什么？",
    hint: "先从你是谁，以及你主要做什么开始。",
    namespaces: ["R", "I"],
  },
  {
    key: "q2_supply_experience",
    title: "如果有人来到你这里，你最希望他做什么？",
    hint: "把你能提供的内容，和现场的人可以怎样参与分开告诉我们。",
    namespaces: ["O", "X"],
  },
  {
    key: "q3_difference",
    title: "和大家平时见到的同类东西相比，你觉得自己哪里有一点不一样？",
    hint: "先选一个方向，也可以用自己的话多说一点。",
    namespaces: [],
  },
  {
    key: "q4_memory",
    title: "如果一个人只在你这里停留10分钟，离开以后只能记住一件事，你希望是什么？",
    hint: "可以选一个方向；自己写一句是可选的。",
    namespaces: [],
  },
  {
    key: "q5_audience",
    title: "什么样的人比较容易喜欢你做的东西？",
    hint: "可以选择几种你觉得自然会被吸引来的人。",
    namespaces: ["P"],
  },
  {
    key: "q6_style",
    title: "你的东西看起来，更接近哪些感觉？",
    hint: "最多选择 3 个。",
    namespaces: ["S"],
  },
];

export const discoveryStructuredOptions: Readonly<
  Record<"q3_difference" | "q4_memory", readonly string[]>
> = {
  q3_difference: ["材料或技法", "呈现方式", "来源与故事", "互动方式", "选材与配色", "其他"],
  q4_memory: ["一个具体作品", "一件小事", "一段故事", "一种感觉", "一个可以带走的东西"],
};

type SessionRow = {
  id: number;
  creator_id: number;
  version: string;
  status: DiscoverySessionStatus;
  current_question_key: DiscoveryQuestionKey;
  completed_at: string | null;
  feedback_completed_at: string | null;
  updated_at: string;
};

type AnswerRow = {
  id: number;
  session_id: number;
  creator_id: number;
  question_key: DiscoveryQuestionKey;
  version: string;
  selection_json: string;
  original_text: string;
  difference_original: string;
  memory_line_original: string;
  memory_line_source: "" | "self" | "ai" | "rule" | "fact";
  updated_at: string;
};

type InsightRow = {
  id: number;
  insight_type: DiscoveryInsightType;
  content: string;
  taxonomy_term_id: number | null;
  source: DiscoveryInsightSource;
  status: DiscoveryInsightStatus;
  created_at: string;
  updated_at: string;
};

type SelectionMap = Record<string, string[]>;

function parseJson<T>(value: string | null | undefined, fallback: T): T {
  try {
    const parsed = value ? JSON.parse(value) : fallback;
    return parsed as T;
  } catch {
    return fallback;
  }
}

function question(key: string) {
  const item = discoveryQuestions.find((candidate) => candidate.key === key);
  if (!item) throw new Error("发现问答题目无效");
  return item;
}

function mapSession(row: SessionRow): DiscoverySession {
  return {
    id: row.id,
    creatorId: row.creator_id,
    version: row.version,
    status: row.status,
    currentQuestionKey: row.current_question_key,
    completedAt: row.completed_at,
    feedbackCompletedAt: row.feedback_completed_at,
    updatedAt: row.updated_at,
  };
}

function mapInsight(row: InsightRow): DiscoveryInsight {
  return {
    id: row.id,
    type: row.insight_type,
    content: row.content,
    taxonomyTermId: row.taxonomy_term_id,
    source: row.source,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function canonicalTerms() {
  return all<{
    id: number;
    namespace: TaxonomyNamespace;
    term_key: string;
    label: string;
    version: string;
    status: TaxonomyTerm["status"];
  }>(
    `SELECT id, namespace, term_key, label, version, status
     FROM taxonomy_terms
     WHERE version = 'v1' AND status = 'active' AND term_key NOT LIKE 'legacy.%'
     ORDER BY namespace, term_key`,
  );
}

function canonicalTermMap() {
  return new Map(canonicalTerms().map((term) => [`${term.namespace}:${term.term_key}`, term]));
}

function normalizeSelections(questionKey: DiscoveryQuestionKey, input: unknown): SelectionMap {
  const definition = question(questionKey);
  const raw = input && typeof input === "object" && !Array.isArray(input)
    ? input as Record<string, unknown>
    : {};
  const result: SelectionMap = {};
  const terms = canonicalTermMap();

  for (const namespace of definition.namespaces) {
    const values = Array.isArray(raw[namespace]) ? raw[namespace].map(String) : [];
    const unique = [...new Set(values)];
    if (unique.length > 8) throw new Error("单个问题最多选择8项");
    for (const termKey of unique) {
      const term = terms.get(`${namespace}:${termKey}`);
      if (!term) throw new Error("问答选项已失效，请刷新后重试");
    }
    result[namespace] = unique;
  }

  if (questionKey === "q6_style" && (result.S || []).length > 3)
    throw new Error("风格最多选择3项");

  if (questionKey === "q3_difference" || questionKey === "q4_memory") {
    const structured = Array.isArray(raw.structured) ? raw.structured.map(String) : [];
    const allowed = discoveryStructuredOptions[questionKey];
    const unique = [...new Set(structured)];
    if (unique.length > 3) throw new Error("这道题最多选择3项");
    if (unique.some((value) => !allowed.includes(value))) throw new Error("问答选项已失效，请刷新后重试");
    result.structured = unique;
  }

  return result;
}

function normalizeOriginalText(questionKey: DiscoveryQuestionKey, input: unknown) {
  const maxLength = questionKey === "q3_difference" ? 1000 : questionKey === "q4_memory" ? 300 : 500;
  const text = cleanText(input, maxLength);
  const safety = contentSafety(text);
  if (safety) throw new Error(safety);
  return text;
}

function getOrCreateSession(creatorId: number) {
  if (!one("SELECT id FROM creators WHERE id = ?", creatorId)) throw new Error("用户不存在");
  run(
    `INSERT OR IGNORE INTO creator_discovery_sessions(creator_id, version, current_question_key)
     VALUES (?, ?, 'q1_identity_category')`,
    creatorId,
    DISCOVERY_VERSION,
  );
  const row = one<SessionRow>(
    `SELECT id, creator_id, version, status, current_question_key, completed_at,
            feedback_completed_at, updated_at
     FROM creator_discovery_sessions
     WHERE creator_id = ? AND version = ?`,
    creatorId,
    DISCOVERY_VERSION,
  );
  if (!row) throw new Error("发现问答初始化失败");
  return row;
}

function answerMedia(answerId: number) {
  return all<{ media_key: string; visibility: "private" | "public" }>(
    `SELECT media_key, visibility
     FROM creator_discovery_answer_media
     WHERE answer_id = ?
     ORDER BY id`,
    answerId,
  ).map((media) => ({ key: media.media_key, visibility: media.visibility }));
}

function mapAnswer(row: AnswerRow): DiscoveryAnswer {
  return {
    id: row.id,
    questionKey: row.question_key,
    version: row.version,
    selections: parseJson<SelectionMap>(row.selection_json, {}),
    originalText: row.question_key === "q3_difference"
      ? row.difference_original || row.original_text || ""
      : row.question_key === "q4_memory"
        ? row.memory_line_original || row.original_text || ""
        : row.original_text || "",
    memoryLineSource: row.memory_line_source || "",
    media: answerMedia(row.id).map((media) => ({ ...media, url: assetUrl(media.key) || "" })),
    updatedAt: row.updated_at,
  };
}

function sessionAnswers(sessionId: number) {
  return all<AnswerRow>(
    `SELECT id, session_id, creator_id, question_key, version, selection_json,
            original_text, difference_original, memory_line_original,
            memory_line_source, updated_at
     FROM creator_discovery_answers
     WHERE session_id = ?
     ORDER BY id`,
    sessionId,
  ).map(mapAnswer);
}

function sessionInsights(sessionId: number) {
  return all<InsightRow>(
    `SELECT id, insight_type, content, taxonomy_term_id, source, status, created_at, updated_at
     FROM creator_discovery_insights
     WHERE session_id = ? AND status IN ('candidate', 'confirmed')
     ORDER BY insight_type, id`,
    sessionId,
  ).map(mapInsight);
}

function firstUnanswered(answers: DiscoveryAnswer[]) {
  return discoveryQuestions.find((item) => !answers.some((answer) => answer.questionKey === item.key))?.key
    || "q1_identity_category";
}

export function getDiscoveryBundle(creatorId: number) {
  const session = mapSession(getOrCreateSession(creatorId));
  const answers = sessionAnswers(session.id);
  const currentQuestionKey = session.status === "in_progress"
    ? (answers.some((answer) => answer.questionKey === session.currentQuestionKey)
      ? firstUnanswered(answers)
      : session.currentQuestionKey)
    : session.currentQuestionKey;
  return {
    version: DISCOVERY_VERSION,
    questions: discoveryQuestions,
    structuredOptions: discoveryStructuredOptions,
    taxonomy: canonicalTerms().map((term) => ({
      id: term.id,
      namespace: term.namespace,
      termKey: term.term_key,
      label: term.label,
      version: term.version,
      status: term.status,
    })),
    session: { ...session, currentQuestionKey },
    answers,
    insights: sessionInsights(session.id),
  };
}

function termIdsForSelections(selections: SelectionMap) {
  const terms = canonicalTermMap();
  return creatorTaxonomyNamespaces.flatMap((namespace) =>
    (selections[namespace] || []).map((termKey) => terms.get(`${namespace}:${termKey}`)?.id)
      .filter((id): id is number => Boolean(id)),
  );
}

export function saveDiscoveryAnswer(input: {
  creatorId: number;
  questionKey: DiscoveryQuestionKey;
  version?: string;
  selections?: unknown;
  originalText?: unknown;
  media?: Array<{ key: string; visibility?: "private" | "public" }>;
}) {
  if (input.version && input.version !== DISCOVERY_VERSION) throw new Error("问答版本已更新，请刷新后重试");
  const normalizedSelections = normalizeSelections(input.questionKey, input.selections);
  const originalText = normalizeOriginalText(input.questionKey, input.originalText);
  const memoryLineSource = input.questionKey === "q4_memory" && originalText ? "self" : "";
  const session = getOrCreateSession(input.creatorId);
  const media = input.media || [];

  transaction(() => {
    run(
      `INSERT INTO creator_discovery_answers(
        session_id, creator_id, question_key, version, selection_json,
        original_text, difference_original, memory_line_original, memory_line_source
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(session_id, question_key) DO UPDATE SET
        version = excluded.version,
        selection_json = excluded.selection_json,
        original_text = excluded.original_text,
        difference_original = excluded.difference_original,
        memory_line_original = excluded.memory_line_original,
        memory_line_source = excluded.memory_line_source,
        updated_at = CURRENT_TIMESTAMP`,
      session.id,
      input.creatorId,
      input.questionKey,
      DISCOVERY_VERSION,
      JSON.stringify(normalizedSelections),
      originalText,
      input.questionKey === "q3_difference" ? originalText : "",
      input.questionKey === "q4_memory" ? originalText : "",
      memoryLineSource,
    );
    const answer = one<{ id: number }>(
      "SELECT id FROM creator_discovery_answers WHERE session_id = ? AND question_key = ?",
      session.id,
      input.questionKey,
    );
    if (!answer) throw new Error("问答保存失败");
    run("DELETE FROM creator_discovery_answer_terms WHERE answer_id = ?", answer.id);
    for (const taxonomyTermId of termIdsForSelections(normalizedSelections))
      run(
        "INSERT OR IGNORE INTO creator_discovery_answer_terms(answer_id, taxonomy_term_id) VALUES (?, ?)",
        answer.id,
        taxonomyTermId,
      );
    run("DELETE FROM creator_discovery_answer_media WHERE answer_id = ?", answer.id);
    for (const item of media) {
      run(
        `INSERT OR IGNORE INTO creator_discovery_answer_media(answer_id, media_key, visibility)
         VALUES (?, ?, ?)`,
        answer.id,
        item.key,
        item.visibility === "public" ? "public" : "private",
      );
    }
    run(
      `UPDATE creator_discovery_sessions
       SET status = 'in_progress', current_question_key = ?, completed_at = NULL,
           feedback_completed_at = NULL, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      input.questionKey,
      session.id,
    );
  });

  return getDiscoveryBundle(input.creatorId);
}

function answerByKey(answers: DiscoveryAnswer[], key: DiscoveryQuestionKey) {
  return answers.find((answer) => answer.questionKey === key);
}

function requireCompleteAnswers(answers: DiscoveryAnswer[]) {
  const required: Array<[DiscoveryQuestionKey, string, (answer: DiscoveryAnswer) => boolean]> = [
    ["q1_identity_category", "Q1", (answer) => Boolean(answer.selections.R?.length && answer.selections.I?.length)],
    ["q2_supply_experience", "Q2", (answer) => Boolean(answer.selections.O?.length && answer.selections.X?.length)],
    ["q3_difference", "Q3", (answer) => Boolean(answer.selections.structured?.length)],
    ["q4_memory", "Q4", (answer) => Boolean(answer.selections.structured?.length)],
    ["q5_audience", "Q5", (answer) => Boolean(answer.selections.P?.length)],
    ["q6_style", "Q6", (answer) => Boolean(answer.selections.S?.length && answer.selections.S.length <= 3)],
  ];
  const missing = required.filter(([key, , valid]) => {
    const answer = answerByKey(answers, key);
    return !answer || !valid(answer);
  }).map(([, label]) => label);
  if (missing.length) throw new Error(`请先完成：${missing.join("、")}`);
}

function insertInsight(
  sessionId: number,
  creatorId: number,
  type: DiscoveryInsightType,
  content: string,
  source: DiscoveryInsightSource,
  taxonomyTermId: number | null = null,
) {
  run(
    `INSERT INTO creator_discovery_insights(
      session_id, creator_id, insight_type, content, taxonomy_term_id, source, status
    ) VALUES (?, ?, ?, ?, ?, ?, 'candidate')`,
    sessionId,
    creatorId,
    type,
    content,
    taxonomyTermId,
    source,
  );
}

function labelsForAnswers(sessionId: number) {
  return all<{ question_key: DiscoveryQuestionKey; namespace: TaxonomyNamespace; term_key: string; label: string }>(
    `SELECT a.question_key, t.namespace, t.term_key, t.label
     FROM creator_discovery_answers a
     JOIN creator_discovery_answer_terms at ON at.answer_id = a.id
     JOIN taxonomy_terms t ON t.id = at.taxonomy_term_id
     WHERE a.session_id = ?
     ORDER BY a.id, t.namespace, t.term_key`,
    sessionId,
  );
}

function originalTexts(sessionId: number) {
  return all<{ question_key: DiscoveryQuestionKey; original_text: string }>(
    `SELECT question_key, original_text
     FROM creator_discovery_answers
     WHERE session_id = ? AND original_text != ''
     ORDER BY id`,
    sessionId,
  );
}

const emotionRules: ReadonlyArray<{ termKey: string; triggers: readonly string[] }> = [
  { termKey: "E01", triggers: ["松弛", "放松", "慢一点", "放空", "安静慢"] },
  { termKey: "E02", triggers: ["新鲜", "探索", "好奇", "第一次"] },
  { termKey: "E03", triggers: ["开心", "好玩", "朋友", "亲子"] },
  { termKey: "E04", triggers: ["安静", "慢", "静下来"] },
  { termKey: "E05", triggers: ["动手", "专注", "制作", "工作坊"] },
  { termKey: "E06", triggers: ["惊喜", "新鲜", "选择", "组合"] },
  { termKey: "E07", triggers: ["故事", "传统", "怀旧", "记忆"] },
  { termKey: "E08", triggers: ["表达", "自己", "创作"] },
  { termKey: "E09", triggers: ["聊天", "朋友", "共同", "连接"] },
  { termKey: "E10", triggers: ["探索", "试", "尝", "闻", "触摸"] },
  { termKey: "E11", triggers: ["完成", "做成", "学会", "作品"] },
];

export function generateDiscoveryInsights(creatorId: number) {
  const session = getOrCreateSession(creatorId);
  const answers = sessionAnswers(session.id);
  requireCompleteAnswers(answers);
  const labels = labelsForAnswers(session.id);
  const originals = originalTexts(session.id);
  const labelByNamespace = new Map<TaxonomyNamespace, string[]>();
  for (const item of labels) {
    const values = labelByNamespace.get(item.namespace) || [];
    values.push(item.label);
    labelByNamespace.set(item.namespace, values);
  }

  transaction(() => {
    run(
      `UPDATE creator_discovery_insights
       SET status = 'rejected', updated_at = CURRENT_TIMESTAMP
       WHERE session_id = ? AND status = 'candidate'`,
      session.id,
    );

    const traits = [
      ...(labelByNamespace.get("R") || []),
      ...(labelByNamespace.get("I") || []),
      ...(labelByNamespace.get("O") || []),
      ...(labelByNamespace.get("X") || []),
      ...(labelByNamespace.get("P") || []),
      ...(labelByNamespace.get("S") || []),
    ];
    const q3 = answerByKey(answers, "q3_difference");
    const q4 = answerByKey(answers, "q4_memory");
    if (q3?.originalText) traits.push("愿意说清楚自己的不同");
    if (q4?.originalText) traits.push("在意别人离开后留下的记忆");
    if ((labelByNamespace.get("X") || []).length) traits.push("愿意让人参与其中");
    if (traits.length < 4) traits.push("有自己的创作方向");
    if (traits.length < 4) traits.push("重视真实体验");
    for (const trait of [...new Set(traits)].slice(0, 8))
      insertInsight(session.id, creatorId, "traits", trait, "rule");

    const r = labelByNamespace.get("R")?.[0] || "创作者";
    const i = labelByNamespace.get("I")?.[0] || "自己的作品";
    const titles = [
      `把${i}做成日常体验的人`,
      `${r}的${i}创作`,
      `让${i}变得可以亲近的人`,
    ];
    for (const title of titles) insertInsight(session.id, creatorId, "display_title", title, "rule");

    const line = originals.find((item) => item.question_key === "q4_memory")
      || originals.find((item) => item.question_key === "q3_difference")
      || discoveryQuestions
        .filter((item) => item.key !== "q4_memory" && item.key !== "q3_difference")
        .map((item) => originals.find((candidate) => candidate.question_key === item.key))
        .find((item): item is (typeof originals)[number] => Boolean(item));
    if (line) insertInsight(session.id, creatorId, "representative_line", line.original_text, "fact");

    const termMap = canonicalTermMap();
    const haystack = [
      ...labels.map((item) => item.label),
      ...originals.map((item) => item.original_text),
      ...((q3?.selections.structured || [])),
      ...((q4?.selections.structured || [])),
    ].join(" ");
    const emotionTerms = emotionRules
      .filter((rule) => rule.triggers.some((trigger) => haystack.includes(trigger)))
      .map((rule) => termMap.get(`E:${rule.termKey}`))
      .filter((term): term is NonNullable<typeof term> => Boolean(term));
    for (const term of [...new Map(emotionTerms.map((term) => [term.term_key, term])).values()].slice(0, 5))
      insertInsight(session.id, creatorId, "emotion", term.label, "rule", term.id);

    run(
      `UPDATE creator_discovery_sessions
       SET status = 'completed', current_question_key = 'q6_style',
           completed_at = COALESCE(completed_at, CURRENT_TIMESTAMP),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      session.id,
    );
  });
  return getDiscoveryBundle(creatorId);
}

function candidateIds(value: unknown) {
  return Array.isArray(value)
    ? [...new Set(value.map(Number).filter((id) => Number.isInteger(id) && id > 0))]
    : [];
}

function customTexts(value: unknown) {
  return Array.isArray(value)
    ? [...new Set(value.map((item) => cleanText(item, 80)).filter(Boolean))]
    : [];
}

function confirmType(
  sessionId: number,
  creatorId: number,
  type: DiscoveryInsightType,
  selectedIds: number[],
  custom: string[],
) {
  const rows = all<{ id: number; source: DiscoveryInsightSource }>(
    `SELECT id, source FROM creator_discovery_insights
     WHERE session_id = ? AND insight_type = ? AND status IN ('candidate', 'confirmed')`,
    sessionId,
    type,
  );
  const validIds = new Set(rows.map((row) => row.id));
  if (selectedIds.some((id) => !validIds.has(id))) throw new Error("理解候选已失效，请刷新后重试");
  run(
    `UPDATE creator_discovery_insights
     SET status = 'rejected', updated_at = CURRENT_TIMESTAMP
     WHERE session_id = ? AND insight_type = ? AND status IN ('candidate', 'confirmed')`,
    sessionId,
    type,
  );
  for (const id of selectedIds)
    run(
      `UPDATE creator_discovery_insights
       SET status = 'confirmed', updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND session_id = ?`,
      id,
      sessionId,
    );
  for (const content of custom) {
    const safety = contentSafety(content);
    if (safety) throw new Error(safety);
    insertInsight(sessionId, creatorId, type, content, "self");
    const inserted = one<{ id: number }>(
      `SELECT id FROM creator_discovery_insights
       WHERE session_id = ? AND insight_type = ? AND content = ? AND status = 'candidate'
       ORDER BY id DESC LIMIT 1`,
      sessionId,
      type,
      content,
    );
    if (inserted)
      run(
        "UPDATE creator_discovery_insights SET status = 'confirmed', updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        inserted.id,
      );
  }
}

function syncConfirmedEmotionTags(creatorId: number, sessionId: number, selectedIds: number[]) {
  run(
    `DELETE FROM creator_taxonomy_terms
     WHERE creator_id = ? AND source = 'discovery'
       AND taxonomy_term_id IN (
         SELECT id FROM taxonomy_terms WHERE namespace = 'E'
       )`,
    creatorId,
  );
  if (!selectedIds.length) return;
  const placeholders = selectedIds.map(() => "?").join(", ");
  const rows = all<{ taxonomy_term_id: number }>(
    `SELECT i.taxonomy_term_id
     FROM creator_discovery_insights i
     JOIN taxonomy_terms t ON t.id = i.taxonomy_term_id
     WHERE i.id IN (${placeholders})
       AND i.session_id = ?
       AND i.creator_id = ?
       AND i.insight_type = 'emotion'
       AND i.status = 'confirmed'
       AND i.taxonomy_term_id IS NOT NULL
       AND t.namespace = 'E'`,
    ...selectedIds,
    sessionId,
    creatorId,
  );
  for (const row of rows)
    run(
      `INSERT INTO creator_taxonomy_terms(creator_id, taxonomy_term_id, source)
       VALUES (?, ?, 'discovery')
       ON CONFLICT(creator_id, taxonomy_term_id, source) DO UPDATE SET
         source = excluded.source,
         updated_at = CURRENT_TIMESTAMP`,
      creatorId,
      row.taxonomy_term_id,
    );
}

export function confirmDiscoveryInsights(input: {
  creatorId: number;
  traits?: { candidateIds?: unknown; customTexts?: unknown };
  displayTitle?: { candidateId?: unknown; customText?: unknown; none?: boolean };
  representativeLine?: { candidateId?: unknown; customText?: unknown; none?: boolean };
  emotions?: { candidateIds?: unknown };
}) {
  const session = getOrCreateSession(input.creatorId);
  if (session.status === "in_progress") throw new Error("请先完成6道发现问答");
  const displayTitleId = Number(input.displayTitle?.candidateId || 0);
  const representativeLineId = Number(input.representativeLine?.candidateId || 0);
  transaction(() => {
    confirmType(
      session.id,
      input.creatorId,
      "traits",
      candidateIds(input.traits?.candidateIds),
      customTexts(input.traits?.customTexts),
    );
    confirmType(
      session.id,
      input.creatorId,
      "display_title",
      input.displayTitle?.none ? [] : displayTitleId ? [displayTitleId] : [],
      input.displayTitle?.none ? [] : customTexts([input.displayTitle?.customText]),
    );
    confirmType(
      session.id,
      input.creatorId,
      "representative_line",
      input.representativeLine?.none ? [] : representativeLineId ? [representativeLineId] : [],
      input.representativeLine?.none ? [] : customTexts([input.representativeLine?.customText]),
    );
    confirmType(
      session.id,
      input.creatorId,
      "emotion",
      candidateIds(input.emotions?.candidateIds),
      [],
    );
    syncConfirmedEmotionTags(
      input.creatorId,
      session.id,
      candidateIds(input.emotions?.candidateIds),
    );
    run(
      `UPDATE creator_discovery_sessions
       SET status = 'feedback', feedback_completed_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      session.id,
    );
  });
  return getDiscoveryBundle(input.creatorId);
}

export function discoveryProgress(creatorId: number) {
  const row = one<{ status: DiscoverySessionStatus }>(
    `SELECT status FROM creator_discovery_sessions
     WHERE creator_id = ? AND version = ?
     ORDER BY id DESC LIMIT 1`,
    creatorId,
    DISCOVERY_VERSION,
  );
  return {
    started: Boolean(row),
    completed: row?.status === "completed" || row?.status === "feedback",
    feedbackCompleted: row?.status === "feedback",
  };
}
