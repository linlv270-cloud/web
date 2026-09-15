import assert from "node:assert/strict";
import { after, test } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const dataDir = mkdtempSync(path.join(tmpdir(), "tde-phase2d-portrait-"));
process.env.DATA_DIR = dataDir;
process.env.NODE_ENV = "test";

const database = await import("../lib/database.ts");
const storage = await import("../lib/storage.ts");
const registerRoute = await import("../app/api/web/auth/register-account/route.ts");
const discoveryRoute = await import("../app/api/web/discovery/route.ts");
const profileRoute = await import("../app/api/web/profile/route.ts");
const portraitRoute = await import("../app/api/web/portrait/route.ts");
const publicPortraitRoute = await import("../app/api/public/creator/route.ts");
const publicMediaRoute = await import("../app/api/public/creator-media/route.ts");

after(() => {
  database.getDb().close();
  rmSync(dataDir, { recursive: true, force: true });
});

async function payload(response) {
  return { status: response.status, body: await response.json() };
}

function request(url, body, token = "") {
  return new Request(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

async function saveAnswer(token, questionKey, selections, originalText = "") {
  return payload(await discoveryRoute.POST(request(
    "http://localhost/api/web/discovery",
    { action: "saveAnswer", questionKey, version: "v1", selections, originalText },
    token,
  )));
}

test("phase2d portrait stays a presentation layer and only claimed versions are public", async () => {
  const registered = await payload(await registerRoute.POST(new Request(
    "http://localhost/api/web/auth/register-account",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        flow: "phase2a",
        phone: "18830000992",
        confirmPhone: "18830000992",
        password: "Phase2D-pass-992!",
        confirmPassword: "Phase2D-pass-992!",
        agreed: true,
      }),
    },
  )));
  assert.equal(registered.status, 201, JSON.stringify(registered.body));
  const token = registered.body.session.token;
  const creatorId = registered.body.creator.id;

  const imageKeys = {
    representative: `web-creators/${creatorId}/representative.jpg`,
    logo: `web-creators/${creatorId}/logo.jpg`,
    product: `web-creators/${creatorId}/product.jpg`,
  };
  for (const key of Object.values(imageKeys)) await storage.putObject(key, Buffer.from(`image-${key}`));
  await payload(await profileRoute.POST(request(
    "http://localhost/api/web/profile",
    {
      action: "updateProfile",
      brandName: "拓印工作室",
      slogan: "把旧纹样带回日常",
      intro: "真实的手作与现场体验。",
    },
    token,
  )));
  await payload(await profileRoute.POST(request(
    "http://localhost/api/web/profile",
    {
      action: "updateImages",
      representativeImageKey: imageKeys.representative,
      logoImageKey: imageKeys.logo,
      productImageKey: imageKeys.product,
    },
    token,
  )));

  await saveAnswer(token, "q1_identity_category", { R: ["R01"], I: ["I01"] });
  await saveAnswer(token, "q2_supply_experience", { O: ["O03"], X: ["X01"] });
  await saveAnswer(token, "q3_difference", { structured: ["材料或技法"] }, "我把旧建筑纹样做成可以带回家的东西");
  await saveAnswer(token, "q4_memory", { structured: ["一件小事"] }, "希望你记得亲手完成的那一刻");
  await saveAnswer(token, "q5_audience", { P: ["P02"] });
  await saveAnswer(token, "q6_style", { S: ["S01"] });
  const formalR01 = database.one(
    "SELECT id FROM taxonomy_terms WHERE namespace = 'R' AND term_key = 'R01' AND version = 'v1'",
  ).id;
  const formalS01 = database.one(
    "SELECT id FROM taxonomy_terms WHERE namespace = 'S' AND term_key = 'S01' AND version = 'v1'",
  ).id;
  const legacyTerm = Number(database.run(
    `INSERT INTO taxonomy_terms(namespace, term_key, label, version, status)
     VALUES ('R', 'legacy.R.audit-proof', '旧兼容标签', 'v1', 'active')`,
  ).lastInsertRowid);
  database.run(
    `INSERT INTO creator_taxonomy_terms(creator_id, taxonomy_term_id, source)
     VALUES (?, ?, 'discovery')`,
    creatorId,
    formalR01,
  );
  database.run(
    `INSERT INTO creator_taxonomy_terms(creator_id, taxonomy_term_id, source)
     VALUES (?, ?, 'discovery')`,
    creatorId,
    formalS01,
  );
  database.run(
    `INSERT INTO creator_taxonomy_terms(creator_id, taxonomy_term_id, source)
     VALUES (?, ?, 'discovery')`,
    creatorId,
    legacyTerm,
  );
  const insights = await payload(await discoveryRoute.POST(request(
    "http://localhost/api/web/discovery",
    { action: "complete" },
    token,
  )));
  assert.equal(insights.status, 200, JSON.stringify(insights.body));
  const title = insights.body.insights.find((item) => item.type === "display_title");
  const line = insights.body.insights.find((item) => item.type === "representative_line");
  const emotion = insights.body.insights.find((item) => item.type === "emotion");
  const confirmed = await payload(await discoveryRoute.POST(request(
    "http://localhost/api/web/discovery",
    {
      action: "confirmInsights",
      traits: { candidateIds: [] },
      displayTitle: { candidateId: title.id },
      representativeLine: { candidateId: line.id },
      emotions: { candidateIds: emotion ? [emotion.id] : [] },
    },
    token,
  )));
  assert.equal(confirmed.status, 200, JSON.stringify(confirmed.body));
  const confirmedRepresentative = "确认代表句";
  database.run(
    `UPDATE creator_discovery_insights
     SET content = ?
     WHERE creator_id = ? AND insight_type = 'representative_line' AND status = 'confirmed'`,
    confirmedRepresentative,
    creatorId,
  );

  await payload(await profileRoute.POST(request(
    "http://localhost/api/web/profile",
    {
      action: "updateCooperationPreferences",
      supply: { O: ["O03"], X: ["X01"] },
      supplyFacts: { O: [], X: ["现场拓印旧建筑纹样"] },
      adaptationPreferences: [],
      opportunityInterests: [],
    },
    token,
  )));

  const draft = await payload(await portraitRoute.GET(new Request(
    "http://localhost/api/web/portrait",
    { headers: { authorization: `Bearer ${token}` } },
  )));
  assert.equal(draft.status, 200, JSON.stringify(draft.body));
  assert.equal(draft.body.portrait.status, "draft");
  assert.equal(draft.body.portrait.publicUrl, null);
  assert.equal(draft.body.preview.brandName, "拓印工作室");
  assert.equal(draft.body.preview.displayTitle, title.content);
  assert.equal(draft.body.preview.representativeLine, confirmedRepresentative);
  assert.equal(draft.body.preview.memory, "希望你记得亲手完成的那一刻");
  assert.deepEqual(draft.body.editable.galleryMediaKeys, [imageKeys.logo, imageKeys.product]);
  assert.ok(draft.body.preview.supply.some((item) => item.label === "现场拓印旧建筑纹样" && item.source === "self"));
  assert.ok(draft.body.preview.supply.some((item) => item.namespace === "X" && item.label === "自己动手"));
  assert.ok(draft.body.preview.tags.includes("手作人"));
  assert.ok(draft.body.preview.tags.includes("自然"));
  assert.equal(draft.body.preview.tags.includes("旧兼容标签"), false);
  assert.equal(draft.body.tagOptions.some((item) => item.key === "R:legacy.R.audit-proof"), false);
  assert.equal(JSON.stringify(draft.body).includes("18830000992"), false);
  assert.equal(JSON.stringify(draft.body).includes("北京市"), false);

  const notPublic = await payload(await publicPortraitRoute.GET(new Request(
    `http://localhost/api/public/creator?portrait=${encodeURIComponent(draft.body.portrait.publicId)}`,
  )));
  assert.equal(notPublic.status, 404);

  database.run(
    `UPDATE creator_discovery_answers
     SET original_text = '', memory_line_original = ''
     WHERE creator_id = ? AND question_key = 'q4_memory'`,
    creatorId,
  );
  const saved = await payload(await portraitRoute.POST(request(
    "http://localhost/api/web/portrait",
    {
      action: "save",
      displayTitleOverride: "拓印旧纹样的人",
      representativeLineOverride: "",
      heroMediaKey: imageKeys.logo,
      galleryMediaKeys: [],
      visibility: {
        difference: false,
        representativeLine: false,
        hiddenTagKeys: ["S:S01"],
      },
    },
    token,
  )));
  assert.equal(saved.status, 200, JSON.stringify(saved.body));
  assert.equal(saved.body.preview.displayTitle, "拓印旧纹样的人");
  assert.equal(saved.body.preview.representativeLine, "");
  assert.equal(saved.body.preview.difference, "");
  assert.equal(saved.body.preview.memory, confirmedRepresentative);
  assert.equal(saved.body.preview.tags.includes("自然"), false);
  assert.ok(saved.body.preview.tags.includes("手作人"));
  assert.equal(saved.body.editable.galleryConfigured, true);
  assert.deepEqual(saved.body.editable.galleryMediaKeys, []);
  assert.equal(saved.body.tagOptions.find((item) => item.key === "S:S01").visible, false);
  assert.equal(
    database.one(
      `SELECT COUNT(*) AS count FROM creator_taxonomy_terms
       WHERE creator_id = ? AND taxonomy_term_id = ? AND source = 'discovery'`,
      creatorId,
      formalS01,
    ).count,
    1,
  );
  assert.equal(
    database.one(
      `SELECT difference_original FROM creator_discovery_answers
       WHERE creator_id = ? AND question_key = 'q3_difference'`,
      creatorId,
    ).difference_original,
    "我把旧建筑纹样做成可以带回家的东西",
  );
  assert.equal(
    database.one(
      `SELECT status FROM creator_discovery_insights
       WHERE creator_id = ? AND insight_type = 'display_title' AND status = 'confirmed'`,
      creatorId,
    ).status,
    "confirmed",
  );

  const claimed = await payload(await portraitRoute.POST(request(
    "http://localhost/api/web/portrait",
    { action: "claim" },
    token,
  )));
  assert.equal(claimed.status, 200, JSON.stringify(claimed.body));
  assert.equal(claimed.body.portrait.status, "claimed");
  assert.match(claimed.body.portrait.publicUrl, /^\/creator\.html\?portrait=p-/);

  const publicPage = await payload(await publicPortraitRoute.GET(new Request(
    `http://localhost/api/public/creator?portrait=${encodeURIComponent(claimed.body.portrait.publicId)}`,
  )));
  assert.equal(publicPage.status, 200, JSON.stringify(publicPage.body));
  assert.equal(publicPage.body.portrait.displayTitle, "拓印旧纹样的人");
  assert.equal(publicPage.body.portrait.difference, "");
  assert.equal(publicPage.body.portrait.memory, confirmedRepresentative);
  assert.equal(publicPage.body.portrait.tags.includes("自然"), false);
  assert.ok(publicPage.body.portrait.tags.includes("手作人"));
  assert.deepEqual(publicPage.body.portrait.imageUrls, []);
  assert.ok(publicPage.body.portrait.supply.some((item) => item.label === "现场拓印旧建筑纹样"));
  assert.equal(JSON.stringify(publicPage.body).includes("18830000992"), false);
  assert.equal(JSON.stringify(publicPage.body).includes("北京市"), false);
  assert.equal(JSON.stringify(publicPage.body).includes("taxonomy_term_id"), false);
  assert.equal(JSON.stringify(publicPage.body).includes("O03"), false);
  assert.equal(JSON.stringify(publicPage.body).includes("X01"), false);

  const publicImage = await publicMediaRoute.GET(new Request(
    `http://localhost/api/public/creator-media?portrait=${encodeURIComponent(claimed.body.portrait.publicId)}&key=${encodeURIComponent(imageKeys.logo)}`,
  ));
  assert.equal(publicImage.status, 200);
  assert.equal(publicImage.headers.get("cache-control"), "public, max-age=86400, immutable");

  const hiddenImage = await publicMediaRoute.GET(new Request(
    `http://localhost/api/public/creator-media?portrait=${encodeURIComponent(claimed.body.portrait.publicId)}&key=${encodeURIComponent(imageKeys.representative)}`,
  ));
  assert.equal(hiddenImage.status, 404);
  const hiddenGalleryImage = await publicMediaRoute.GET(new Request(
    `http://localhost/api/public/creator-media?portrait=${encodeURIComponent(claimed.body.portrait.publicId)}&key=${encodeURIComponent(imageKeys.product)}`,
  ));
  assert.equal(hiddenGalleryImage.status, 404);
  assert.ok(await storage.getObject(imageKeys.product));

  const refreshed = await payload(await portraitRoute.GET(new Request(
    "http://localhost/api/web/portrait",
    { headers: { authorization: `Bearer ${token}` } },
  )));
  assert.equal(refreshed.body.portrait.status, "claimed");
  assert.equal(refreshed.body.editable.visibility.difference, false);
  assert.equal(refreshed.body.editable.visibility.representativeLine, false);
  assert.deepEqual(refreshed.body.editable.visibility.hiddenTagKeys, ["S:S01"]);
  assert.deepEqual(refreshed.body.editable.galleryMediaKeys, []);
  assert.equal(refreshed.body.preview.memory, confirmedRepresentative);

  database.run(
    `UPDATE creator_discovery_insights
     SET content = ''
     WHERE creator_id = ? AND insight_type = 'representative_line' AND status = 'confirmed'`,
    creatorId,
  );
  const noMemory = await payload(await portraitRoute.GET(new Request(
    "http://localhost/api/web/portrait",
    { headers: { authorization: `Bearer ${token}` } },
  )));
  assert.equal(noMemory.body.preview.memory, "");
});
