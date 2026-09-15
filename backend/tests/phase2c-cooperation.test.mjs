import assert from "node:assert/strict";
import { after, test } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const dataDir = mkdtempSync(path.join(tmpdir(), "tde-phase2c-cooperation-"));
process.env.DATA_DIR = dataDir;
process.env.NODE_ENV = "test";

const database = await import("../lib/database.ts");
const registerRoute = await import("../app/api/web/auth/register-account/route.ts");
const discoveryRoute = await import("../app/api/web/discovery/route.ts");
const profileRoute = await import("../app/api/web/profile/route.ts");
const repository = await import("../lib/repository.ts");

after(() => {
  database.getDb().close();
  rmSync(dataDir, { recursive: true, force: true });
});

async function json(response) {
  return { status: response.status, body: await response.json() };
}

function post(url, body, token) {
  return new Request(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
}

test("phase2c keeps O/X separate, preserves discovery facts, and restores preferences", async () => {
  const registered = await json(await registerRoute.POST(new Request(
    "http://localhost/api/web/auth/register-account",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        flow: "phase2a",
        phone: "18830000831",
        confirmPhone: "18830000831",
        password: "Phase2C-pass-831!",
        confirmPassword: "Phase2C-pass-831!",
        agreed: true,
      }),
    },
  )));
  assert.equal(registered.status, 201, JSON.stringify(registered.body));
  const token = registered.body.session.token;
  const creatorId = registered.body.creator.id;

  const discoveryQ2 = await json(await discoveryRoute.POST(post(
    "http://localhost/api/web/discovery",
    {
      action: "saveAnswer",
      questionKey: "q2_supply_experience",
      version: "v1",
      selections: { O: ["O03"], X: ["X01"] },
    },
    token,
  )));
  assert.equal(discoveryQ2.status, 200, JSON.stringify(discoveryQ2.body));

  const before = await json(await profileRoute.GET(new Request(
    "http://localhost/api/web/profile",
    { headers: { authorization: `Bearer ${token}` } },
  )));
  assert.equal(before.status, 200, JSON.stringify(before.body));
  assert.deepEqual(
    before.body.cooperationPreferences.supply.O.map((term) => term.termKey),
    ["O03"],
  );
  assert.deepEqual(
    before.body.cooperationPreferences.supply.X.map((term) => term.termKey),
    ["X01"],
  );
  assert.equal(before.body.creator.onboarding.phase2A.basicsCompleted, false);

  const saved = await json(await profileRoute.POST(post(
    "http://localhost/api/web/profile",
    {
      action: "updateCooperationPreferences",
      supply: { O: ["O02"], X: ["X07"] },
      adaptationPreferences: ["可以做活动限定"],
      opportunityInterests: ["工作坊", "品牌合作"],
    },
    token,
  )));
  assert.equal(saved.status, 200, JSON.stringify(saved.body));
  assert.deepEqual(
    saved.body.cooperationPreferences.supply,
    {
      O: [saved.body.cooperationPreferences.supplyOptions.O.find((term) => term.termKey === "O02")],
      X: [saved.body.cooperationPreferences.supplyOptions.X.find((term) => term.termKey === "X07")],
    },
  );
  assert.deepEqual(saved.body.cooperationPreferences.adaptationPreferences, ["可以做活动限定"]);
  assert.deepEqual(saved.body.cooperationPreferences.opportunityInterests, ["工作坊", "品牌合作"]);

  assert.deepEqual(
    database.all(
      `SELECT t.namespace, t.term_key, ctt.source
       FROM creator_taxonomy_terms ctt
       JOIN taxonomy_terms t ON t.id = ctt.taxonomy_term_id
       WHERE ctt.creator_id = ? AND ctt.source = 'cooperation'
       ORDER BY t.namespace, t.term_key`,
      creatorId,
    ),
    [
      { namespace: "O", term_key: "O02", source: "cooperation" },
      { namespace: "X", term_key: "X07", source: "cooperation" },
    ],
  );
  assert.deepEqual(
    repository.listCreatorTaxonomyTerms(creatorId)
      .filter((term) => term.namespace === "O" || term.namespace === "X")
      .map((term) => `${term.namespace}:${term.termKey}`),
    ["O:O02", "X:X07"],
  );
  assert.deepEqual(
    database.all(
      `SELECT t.namespace, t.term_key
       FROM creator_discovery_answer_terms at
       JOIN creator_discovery_answers a ON a.id = at.answer_id
       JOIN taxonomy_terms t ON t.id = at.taxonomy_term_id
       WHERE a.creator_id = ? AND a.question_key = 'q2_supply_experience'
       ORDER BY t.namespace, t.term_key`,
      creatorId,
    ),
    [
      { namespace: "O", term_key: "O03" },
      { namespace: "X", term_key: "X01" },
    ],
  );

  const repeated = await json(await profileRoute.POST(post(
    "http://localhost/api/web/profile",
    {
      action: "updateCooperationPreferences",
      supply: { O: ["O02"], X: ["X07"] },
      adaptationPreferences: ["可以做活动限定"],
      opportunityInterests: ["工作坊", "品牌合作"],
    },
    token,
  )));
  assert.equal(repeated.status, 200, JSON.stringify(repeated.body));
  assert.equal(
    database.one(
      "SELECT COUNT(*) AS count FROM creator_taxonomy_terms WHERE creator_id = ? AND source = 'cooperation'",
      creatorId,
    ).count,
    2,
  );

  const removedO = await json(await profileRoute.POST(post(
    "http://localhost/api/web/profile",
    {
      action: "updateCooperationPreferences",
      supply: { O: [], X: ["X07"] },
      adaptationPreferences: [],
      opportunityInterests: [],
    },
    token,
  )));
  assert.equal(removedO.status, 200, JSON.stringify(removedO.body));
  assert.deepEqual(
    database.all(
      `SELECT t.namespace, t.term_key
       FROM creator_taxonomy_terms ctt
       JOIN taxonomy_terms t ON t.id = ctt.taxonomy_term_id
       WHERE ctt.creator_id = ? AND ctt.source = 'cooperation'
       ORDER BY t.namespace, t.term_key`,
      creatorId,
    ),
    [{ namespace: "X", term_key: "X07" }],
  );
  assert.deepEqual(
    repository.listCreatorTaxonomyTerms(creatorId)
      .filter((term) => term.namespace === "O" || term.namespace === "X")
      .map((term) => `${term.namespace}:${term.termKey}`),
    ["X:X07"],
  );
  assert.equal(
    database.one(
      `SELECT COUNT(*) AS count
       FROM creator_discovery_answer_terms at
       JOIN creator_discovery_answers a ON a.id = at.answer_id
       WHERE a.creator_id = ? AND a.question_key = 'q2_supply_experience'`,
      creatorId,
    ).count,
    2,
  );

  const restored = await json(await profileRoute.GET(new Request(
    "http://localhost/api/web/profile",
    { headers: { authorization: `Bearer ${token}` } },
  )));
  assert.deepEqual(restored.body.cooperationPreferences.supply.O, []);
  assert.deepEqual(
    restored.body.cooperationPreferences.supply.X.map((term) => term.termKey),
    ["X07"],
  );
  assert.deepEqual(restored.body.cooperationPreferences.adaptationPreferences, []);
  assert.deepEqual(restored.body.cooperationPreferences.opportunityInterests, []);

  const customSaved = await json(await profileRoute.POST(post(
    "http://localhost/api/web/profile",
    {
      action: "updateCooperationPreferences",
      supply: { O: ["O02"], X: ["X07"] },
      supplyFacts: {
        O: ["可以提供现场拓印材料"],
        X: ["现场拓印旧建筑纹样"],
      },
      adaptationPreferences: [],
      opportunityInterests: [],
    },
    token,
  )));
  assert.equal(customSaved.status, 200, JSON.stringify(customSaved.body));
  assert.deepEqual(
    customSaved.body.cooperationPreferences.supplyFacts,
    {
      O: [customSaved.body.cooperationPreferences.supplyFacts.O[0]],
      X: [customSaved.body.cooperationPreferences.supplyFacts.X[0]],
    },
  );
  assert.equal(customSaved.body.cooperationPreferences.supplyFacts.O[0].originalText, "可以提供现场拓印材料");
  assert.equal(customSaved.body.cooperationPreferences.supplyFacts.O[0].namespace, "O");
  assert.equal(customSaved.body.cooperationPreferences.supplyFacts.X[0].originalText, "现场拓印旧建筑纹样");
  assert.equal(customSaved.body.cooperationPreferences.supplyFacts.X[0].namespace, "X");
  assert.deepEqual(
    database.all(
      `SELECT namespace, original_text, source, status
       FROM creator_cooperation_supply_facts
       WHERE creator_id = ?
       ORDER BY namespace, original_text`,
      creatorId,
    ),
    [
      { namespace: "O", original_text: "可以提供现场拓印材料", source: "self", status: "active" },
      { namespace: "X", original_text: "现场拓印旧建筑纹样", source: "self", status: "active" },
    ],
  );
  assert.equal(
    database.one(
      "SELECT COUNT(*) AS count FROM taxonomy_terms WHERE label IN ('可以提供现场拓印材料', '现场拓印旧建筑纹样')",
    ).count,
    0,
  );
  assert.deepEqual(
    database.all(
      `SELECT t.namespace, t.term_key
       FROM creator_taxonomy_terms ctt
       JOIN taxonomy_terms t ON t.id = ctt.taxonomy_term_id
       WHERE ctt.creator_id = ? AND ctt.source = 'cooperation'
       ORDER BY t.namespace, t.term_key`,
      creatorId,
    ),
    [
      { namespace: "O", term_key: "O02" },
      { namespace: "X", term_key: "X07" },
    ],
  );

  const customRestored = await json(await profileRoute.GET(new Request(
    "http://localhost/api/web/profile",
    { headers: { authorization: `Bearer ${token}` } },
  )));
  assert.deepEqual(
    customRestored.body.cooperationPreferences.supplyFacts.O.map((fact) => fact.originalText),
    ["可以提供现场拓印材料"],
  );
  assert.deepEqual(
    customRestored.body.cooperationPreferences.supplyFacts.X.map((fact) => fact.originalText),
    ["现场拓印旧建筑纹样"],
  );

  const customRemoved = await json(await profileRoute.POST(post(
    "http://localhost/api/web/profile",
    {
      action: "updateCooperationPreferences",
      supply: { O: ["O02"], X: ["X07"] },
      supplyFacts: { O: [], X: [] },
      adaptationPreferences: [],
      opportunityInterests: [],
    },
    token,
  )));
  assert.equal(customRemoved.status, 200, JSON.stringify(customRemoved.body));
  assert.deepEqual(customRemoved.body.cooperationPreferences.supplyFacts, { O: [], X: [] });
  assert.deepEqual(
    database.all(
      `SELECT namespace, original_text, status
       FROM creator_cooperation_supply_facts
       WHERE creator_id = ?
       ORDER BY namespace, original_text`,
      creatorId,
    ),
    [
      { namespace: "O", original_text: "可以提供现场拓印材料", status: "inactive" },
      { namespace: "X", original_text: "现场拓印旧建筑纹样", status: "inactive" },
    ],
  );
});
