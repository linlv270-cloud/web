import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";

const source = readFileSync(new URL("../../frontend/creator-entry.js", import.meta.url), "utf8");
const window = {};
const sessionValues = new Map();
vm.runInNewContext(source, {
  window,
  localStorage: { removeItem() {} },
  sessionStorage: {
    getItem(key) { return sessionValues.get(key) || null; },
    setItem(key, value) { sessionValues.set(key, String(value)); },
  },
});

test("creator entry routes an incomplete profile to the A1-2 target", () => {
  assert.equal(
    window.tdeCreatorEntry.destinationForProfile({
      creator: {
        brandName: "",
        province: "",
        city: "",
        district: "",
        onboarding: { phase2A: { basicsCompleted: false } },
      },
    }),
    "profile.html?section=brand",
  );
});

test("creator entry routes a complete basic profile to the A1-3 target", () => {
  assert.equal(
    window.tdeCreatorEntry.destinationForProfile({
      creator: {
        brandName: "测试品牌",
        id: 101,
        province: "北京市",
        city: "北京市",
        district: "朝阳区",
        logoImageKey: "logo/example.jpg",
        tags: [{ category: "我的身份", label: "设计师" }],
        onboarding: { phase2A: { basicsCompleted: true } },
      },
    }),
    "profile.html?section=overview",
  );
});

test("creator entry keeps incomplete A1-2 fields on the profile target", () => {
  assert.equal(
    window.tdeCreatorEntry.destinationForProfile({
      creator: {
        brandName: "缺身份账号",
        id: 102,
        province: "北京市",
        city: "北京市",
        district: "朝阳区",
        logoImageKey: "logo/example.jpg",
        tags: [],
      },
    }),
    "profile.html?section=brand",
  );
});

test("creator entry routes complete profile to maintenance after schedule is seen in this session", () => {
  sessionValues.set("tde:a1-3:schedule-seen:103", "1");
  assert.equal(
    window.tdeCreatorEntry.destinationForProfile({
      creator: {
        id: 103,
        brandName: "完整账号",
        province: "北京市",
        city: "北京市",
        district: "朝阳区",
        logoImageKey: "logo/example.jpg",
        tags: [{ category: "我的身份", label: "设计师" }],
        onboarding: { phase2A: { basicsCompleted: true } },
      },
    }),
    "profile.html?section=overview",
  );
});
