import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

const root = path.resolve(new URL("../..", import.meta.url).pathname);
const onsite = readFileSync(path.join(root, "frontend/onsite.html"), "utf8");
const published = readFileSync(path.join(root, "backend/public/onsite.html"), "utf8");
const profile = readFileSync(path.join(root, "frontend/profile.html"), "utf8");
const publishedProfile = readFileSync(path.join(root, "backend/public/profile.html"), "utf8");
const route = readFileSync(path.join(root, "backend/app/api/web/onsite/route.ts"), "utf8");
const catalog = readFileSync(path.join(root, "backend/lib/onsite.ts"), "utf8");

test("B1 includes the locked 13 onsite content labels and no free-form content type", () => {
  for (const label of [
    "产品展售", "作品展示", "现场制作", "工艺演示", "DIY体验", "主题工作坊",
    "现场定制", "互动共创", "试吃 / 品鉴", "气味 / 感官体验", "收藏展示",
    "故事分享 / 内容交流", "现场表演",
  ]) assert.match(catalog, new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(route, /onsiteContentLabels\.includes/);
  assert.doesNotMatch(onsite, /其他现场内容|自定义现场内容/);
});

test("B1 keeps the 13 to 9 template mapping and structured experience payload", () => {
  assert.match(catalog, /"01 产品展售型"/);
  assert.match(catalog, /"09 现场表演型"/);
  assert.match(route, /templateId/);
  assert.match(route, /fields/);
  assert.match(route, /choices/);
  assert.match(route, /rawText/);
  assert.match(route, /mediaKeys/);
  assert.match(route, /media/);
});

test("B1 exposes one current experience while retaining legacy project compatibility", () => {
  assert.match(route, /action === "saveExperience"/);
  assert.match(route, /experienceFromProjects/);
  assert.match(route, /reference LIKE 'B1-EXPERIENCE-%'/);
  assert.match(onsite, /我的体验介绍/);
  assert.match(onsite, /请选择一项/);
  assert.match(onsite, /创作过程图或产品图/);
  assert.match(onsite, /用户体验图或陈列图/);
  assert.match(onsite, /关键细节图/);
  assert.match(onsite, /const isCustom=field\.kind==='choice'/);
  assert.match(onsite, /customValue'\)\.value=isCustom\?current:''/);
  assert.doesNotMatch(onsite, /现场项目|新建项目|项目主类型/);
  assert.doesNotMatch(route, /openai|llm|大模型|人工智能/iu);
});

test("B1 published static page matches the frontend source", () => {
  assert.equal(published, onsite);
});

test("B1 is reachable from the logged-in creator navigation", () => {
  assert.match(profile, /['"]onsite['"],['"]我的体验['"]/);
  assert.match(profile, /location\.href='onsite\.html'/);
  assert.equal(publishedProfile, profile);
});
