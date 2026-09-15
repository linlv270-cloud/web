import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import path from "node:path";

const root = path.resolve(new URL("../..", import.meta.url).pathname);
const frontend = readFileSync(path.join(root, "frontend/profile.html"), "utf8");
const published = readFileSync(path.join(root, "backend/public/profile.html"), "utf8");
const register = readFileSync(path.join(root, "frontend/register.html"), "utf8");

test("A1-2 profile keeps the locked basics order and identity options", () => {
  const order = ["品牌名称", "主理人所在地", "品牌标志/商标图", "主理人身份"];
  let previous = -1;
  for (const label of order) {
    const index = frontend.indexOf(label);
    assert.ok(index > previous, `${label} must follow the locked field order`);
    previous = index;
  }
  for (const label of ["手作人", "艺术家", "设计师", "插画师", "独立品牌主理人", "美食主理人", "非遗创作者", "收藏者", "内容创作者", "工作坊老师", "其他"]) {
    assert.match(frontend, new RegExp(label));
  }
});

test("A1-2 preserves the creator brand and registration helper copy", () => {
  assert.match(frontend, /奇灯®TDE/);
  assert.match(register, /联系官方微信aaabht获取邀请码。/);
});

test("A1-2 shows custom identity labels immediately and keeps required validation local", () => {
  assert.match(frontend, /a12-custom-identity/);
  assert.match(frontend, /function removeIdentityOther\(\)/);
  assert.match(frontend, /id="brandNameStatus"/);
  assert.match(frontend, /focusA12Requirement\('brandName','brandNameStatus','请填写品牌名称'\)/);
});

test("A1-2 validation returns to the first invalid field with yellow highlighting", () => {
  assert.match(frontend, /\.a12-shell \.is-invalid/);
  assert.match(frontend, /function focusA12Requirement\(/);
  assert.match(frontend, /请选择完整的所在地区/);
  assert.match(frontend, /请上传 Logo/);
  assert.match(frontend, /请选择主理人身份/);
});

test("A1-2 published static copy matches the frontend source", () => {
  assert.equal(published, frontend);
});

test("brand classification keeps the full legacy work catalog and custom labels toggle cleanly", () => {
  for (const label of ["身体艺术", "明星周边"]) {
    assert.match(frontend, new RegExp(label));
  }
  assert.match(frontend, /custom=.*profileStyleCustomDraft/);
  assert.match(frontend, /if\(custom\?\.has\(value\)\)\{custom\.delete\(value\)\}/);
  assert.equal(published, frontend);
});
