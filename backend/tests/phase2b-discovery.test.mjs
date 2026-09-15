import assert from "node:assert/strict";
import { after, test } from "node:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";

const dataDir = mkdtempSync(path.join(tmpdir(), "tde-phase2b-discovery-"));
process.env.DATA_DIR = dataDir;
process.env.NODE_ENV = "test";

const database = await import("../lib/database.ts");
const registerRoute = await import("../app/api/web/auth/register-account/route.ts");
const discoveryRoute = await import("../app/api/web/discovery/route.ts");
const uploadRoute = await import("../app/api/web/upload/route.ts");
const repository = await import("../lib/repository.ts");

let token = "";
let creatorId = 0;

after(() => {
  database.getDb().close();
  rmSync(dataDir, { recursive: true, force: true });
});

function request(body, authToken = token) {
  return new Request("http://localhost/api/web/discovery", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(authToken ? { authorization: `Bearer ${authToken}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

async function payload(response) {
  return { status: response.status, body: await response.json() };
}

async function saveAnswerFor(authToken, questionKey, selections, originalText = "", media = []) {
  return payload(await discoveryRoute.POST(request({
    action: "saveAnswer",
    questionKey,
    version: "v1",
    selections,
    originalText,
    media,
  }, authToken)));
}

async function saveAnswer(questionKey, selections, originalText = "", media = []) {
  return saveAnswerFor(token, questionKey, selections, originalText, media);
}

test("phase2b discovery persists facts, separates namespaces, and resumes", async () => {
  const registered = await payload(await registerRoute.POST(new Request(
    "http://localhost/api/web/auth/register-account",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        flow: "phase2a",
        phone: "18830000781",
        confirmPhone: "18830000781",
        password: "Phase2B-pass-781!",
        confirmPassword: "Phase2B-pass-781!",
        agreed: true,
      }),
    },
  )));
  assert.equal(registered.status, 201, JSON.stringify(registered.body));
  token = registered.body.session.token;
  creatorId = registered.body.creator.id;

  const initial = await payload(await discoveryRoute.GET(new Request(
    "http://localhost/api/web/discovery",
    { headers: { authorization: `Bearer ${token}` } },
  )));
  assert.equal(initial.status, 200);
  assert.equal(initial.body.questions.length, 6);
  assert.ok(initial.body.taxonomy.some((term) => term.termKey === "R01"));
  assert.ok(initial.body.taxonomy.some((term) => term.termKey === "I01"));
  assert.ok(initial.body.taxonomy.some((term) => term.termKey === "O01"));
  assert.ok(initial.body.taxonomy.some((term) => term.termKey === "X01"));
  assert.ok(initial.body.taxonomy.some((term) => term.termKey === "P01"));
  assert.ok(initial.body.taxonomy.some((term) => term.termKey === "E01"));
  assert.ok(initial.body.taxonomy.some((term) => term.termKey === "S01"));

  const q1 = await saveAnswer("q1_identity_category", { R: ["R01"], I: ["I01"] });
  assert.equal(q1.status, 200, JSON.stringify(q1.body));
  const resumed = await payload(await discoveryRoute.GET(new Request(
    "http://localhost/api/web/discovery",
    { headers: { authorization: `Bearer ${token}` } },
  )));
  assert.equal(resumed.body.session.currentQuestionKey, "q2_supply_experience");
  assert.deepEqual(resumed.body.answers[0].selections, { R: ["R01"], I: ["I01"] });

  const q2 = await saveAnswer("q2_supply_experience", { O: ["O03"], X: ["X01", "X07"] });
  assert.equal(q2.status, 200);

  const image = await sharp({
    create: { width: 24, height: 24, channels: 4, background: { r: 255, g: 230, b: 0, alpha: 1 } },
  }).png().toBuffer();
  const form = new FormData();
  form.set("file", new File([image], "discovery-q3.png", { type: "image/png" }));
  const upload = await payload(await uploadRoute.POST(new Request(
    "http://localhost/api/web/upload",
    { method: "POST", headers: { authorization: `Bearer ${token}` }, body: form },
  )));
  assert.equal(upload.status, 200, JSON.stringify(upload.body));

  const q3 = await saveAnswer(
    "q3_difference",
    { structured: ["材料或技法"] },
    "我会把旧材料做成新的日常小物",
    [{ key: upload.body.key, visibility: "private" }],
  );
  assert.equal(q3.status, 200, JSON.stringify(q3.body));
  const q4 = await saveAnswer(
    "q4_memory",
    { structured: ["一件小事"] },
    "希望他记得自己亲手完成的那一刻",
  );
  assert.equal(q4.status, 200);
  const q5 = await saveAnswer("q5_audience", { P: ["P02", "P03"] });
  assert.equal(q5.status, 200);
  const q6 = await saveAnswer("q6_style", { S: ["S01", "S05", "S10"] });
  assert.equal(q6.status, 200);

  const completed = await payload(await discoveryRoute.POST(request({ action: "complete" })));
  assert.equal(completed.status, 200, JSON.stringify(completed.body));
  assert.equal(completed.body.session.status, "completed");
  assert.ok(completed.body.insights.some((item) => item.type === "representative_line" && item.source === "fact"));
  assert.ok(completed.body.insights.some((item) => item.type === "emotion"));
  const emotion = completed.body.insights.find((item) => item.type === "emotion");
  assert.ok(emotion?.taxonomyTermId);
  assert.equal(
    database.one(
      `SELECT COUNT(*) AS count
       FROM creator_taxonomy_terms ctt
       JOIN taxonomy_terms t ON t.id = ctt.taxonomy_term_id
       WHERE ctt.creator_id = ? AND t.namespace = 'E'`,
      creatorId,
    ).count,
    0,
  );

  assert.deepEqual(
    database.all(
      `SELECT t.namespace, t.term_key
       FROM creator_discovery_answer_terms at
       JOIN creator_discovery_answers a ON a.id = at.answer_id
       JOIN taxonomy_terms t ON t.id = at.taxonomy_term_id
       WHERE a.creator_id = ?
       ORDER BY a.question_key, t.namespace, t.term_key`,
      creatorId,
    ),
    [
      { namespace: "I", term_key: "I01" },
      { namespace: "R", term_key: "R01" },
      { namespace: "O", term_key: "O03" },
      { namespace: "X", term_key: "X01" },
      { namespace: "X", term_key: "X07" },
      { namespace: "P", term_key: "P02" },
      { namespace: "P", term_key: "P03" },
      { namespace: "S", term_key: "S01" },
      { namespace: "S", term_key: "S05" },
      { namespace: "S", term_key: "S10" },
    ],
  );
  assert.equal(
    database.one(
      `SELECT original_text, difference_original, memory_line_original, memory_line_source
       FROM creator_discovery_answers
       WHERE creator_id = ? AND question_key = 'q4_memory'`,
      creatorId,
    ).original_text,
    "希望他记得自己亲手完成的那一刻",
  );
  assert.deepEqual(
    database.one(
      `SELECT difference_original, memory_line_original, memory_line_source
       FROM creator_discovery_answers
       WHERE creator_id = ? AND question_key = 'q4_memory'`,
      creatorId,
    ),
    {
      difference_original: "",
      memory_line_original: "希望他记得自己亲手完成的那一刻",
      memory_line_source: "self",
    },
  );
  assert.equal(
    database.one(
      `SELECT COUNT(*) AS count
       FROM creator_discovery_answer_media m
       JOIN creator_discovery_answers a ON a.id = m.answer_id
       WHERE a.creator_id = ? AND a.question_key = 'q3_difference'`,
      creatorId,
    ).count,
    1,
  );

  const traits = completed.body.insights.find((item) => item.type === "traits");
  const title = completed.body.insights.find((item) => item.type === "display_title");
  const line = completed.body.insights.find((item) => item.type === "representative_line");
  const confirmed = await payload(await discoveryRoute.POST(request({
    action: "confirmInsights",
    traits: { candidateIds: traits ? [traits.id] : [], customTexts: ["愿意把材料讲得很清楚"] },
    displayTitle: { candidateId: title?.id || 0 },
    representativeLine: { candidateId: line?.id || 0 },
    emotions: { candidateIds: emotion ? [emotion.id] : [] },
  })));
  assert.equal(confirmed.status, 200, JSON.stringify(confirmed.body));
  assert.equal(confirmed.body.session.status, "feedback");
  assert.ok(confirmed.body.insights.some((item) => item.type === "traits" && item.status === "confirmed" && item.source === "self"));
  assert.ok(confirmed.body.insights.some((item) => item.type === "representative_line" && item.source === "fact"));
  assert.deepEqual(
    database.all(
      `SELECT t.namespace, t.term_key, ctt.source
       FROM creator_taxonomy_terms ctt
       JOIN taxonomy_terms t ON t.id = ctt.taxonomy_term_id
       WHERE ctt.creator_id = ? AND t.namespace = 'E'`,
      creatorId,
    ),
    [{
      namespace: "E",
      term_key: database.one(
        "SELECT term_key FROM taxonomy_terms WHERE id = ?",
        emotion.taxonomyTermId,
      ).term_key,
      source: "discovery",
    }],
  );
  assert.ok(repository.listCreatorTaxonomyTerms(creatorId).some((term) =>
    term.namespace === "E" && term.termKey === database.one(
      "SELECT term_key FROM taxonomy_terms WHERE id = ?",
      emotion.taxonomyTermId,
    ).term_key,
  ));
  assert.equal(
    database.one(
      "SELECT original_text FROM creator_discovery_answers WHERE creator_id = ? AND question_key = 'q4_memory'",
      creatorId,
    ).original_text,
    "希望他记得自己亲手完成的那一刻",
  );

  const canceled = await payload(await discoveryRoute.POST(request({
    action: "confirmInsights",
    traits: {},
    displayTitle: { none: true },
    representativeLine: { none: true },
    emotions: { candidateIds: [] },
  })));
  assert.equal(canceled.status, 200, JSON.stringify(canceled.body));
  assert.equal(
    database.one(
      `SELECT COUNT(*) AS count
       FROM creator_taxonomy_terms ctt
       JOIN taxonomy_terms t ON t.id = ctt.taxonomy_term_id
       WHERE ctt.creator_id = ? AND t.namespace = 'E'`,
      creatorId,
    ).count,
    0,
  );
  assert.equal(
    database.one(
      `SELECT COUNT(*) AS count
       FROM creator_discovery_insights
       WHERE creator_id = ? AND insight_type = 'emotion' AND status = 'confirmed'`,
      creatorId,
    ).count,
    0,
  );
});

test("phase2b has no seventh question and rejects unknown question keys", async () => {
  const response = await payload(await discoveryRoute.POST(request({
    action: "saveAnswer",
    questionKey: "q7_emotion",
    selections: {},
  })));
  assert.equal(response.status, 400);
  assert.match(response.body.error, /问答题目无效/);
});

test("phase2b representative line falls back through other saved original text", async () => {
  const registered = await payload(await registerRoute.POST(new Request(
    "http://localhost/api/web/auth/register-account",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        flow: "phase2a",
        phone: "18830000782",
        confirmPhone: "18830000782",
        password: "Phase2B-pass-782!",
        confirmPassword: "Phase2B-pass-782!",
        agreed: true,
      }),
    },
  )));
  assert.equal(registered.status, 201, JSON.stringify(registered.body));
  const otherToken = registered.body.session.token;
  await saveAnswerFor(otherToken, "q1_identity_category", { R: ["R01"], I: ["I01"] }, "我喜欢把熟悉的材料做出新的日常感");
  await saveAnswerFor(otherToken, "q2_supply_experience", { O: ["O01"], X: ["X01"] });
  await saveAnswerFor(otherToken, "q3_difference", { structured: ["呈现方式"] });
  await saveAnswerFor(otherToken, "q4_memory", { structured: ["一种感觉"] });
  await saveAnswerFor(otherToken, "q5_audience", { P: ["P03"] });
  await saveAnswerFor(otherToken, "q6_style", { S: ["S01"] });

  const completed = await payload(await discoveryRoute.POST(request({ action: "complete" }, otherToken)));
  assert.equal(completed.status, 200, JSON.stringify(completed.body));
  assert.deepEqual(
    completed.body.insights
      .filter((item) => item.type === "representative_line")
      .map((item) => ({ content: item.content, source: item.source })),
    [{ content: "我喜欢把熟悉的材料做出新的日常感", source: "fact" }],
  );
});

test("phase2b secondary feedback action remains editable without settling candidates", () => {
  const source = readFileSync(
    path.join(import.meta.dirname, "../../frontend/discovery-feedback.html"),
    "utf8",
  );
  const editBranch = source.indexOf("if(action==='edit')");
  const confirmCall = source.indexOf("call('confirmInsights'");
  assert.ok(editBranch >= 0);
  assert.ok(confirmCall > editBranch);
  assert.match(source.slice(editBranch, confirmCall), /return;/);
});
