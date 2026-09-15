import assert from "node:assert/strict";
import { test } from "node:test";

const origin = await import("../lib/public-origin.ts");

test("production uses configured canonical origin instead of request origin", () => {
  const request = new Request("https://localhost:3101/api/web/portrait/export?format=share");
  assert.equal(
    origin.getPublicOrigin(request, {
      NODE_ENV: "production",
      PUBLIC_ORIGIN: "https://tde.thedesignexpo.org.cn",
    }),
    "https://tde.thedesignexpo.org.cn",
  );
  assert.equal(
    origin.buildPublicPortraitUrl("p-public123", "https://tde.thedesignexpo.org.cn"),
    "https://tde.thedesignexpo.org.cn/creator.html?portrait=p-public123",
  );
});

test("production rejects missing or unsafe PUBLIC_ORIGIN", () => {
  assert.throws(
    () => origin.getPublicOrigin(
      new Request("https://localhost:3101/api/web/portrait/export?format=share"),
      { NODE_ENV: "production" },
    ),
    /缺少 PUBLIC_ORIGIN/,
  );

  assert.throws(
    () => origin.getPublicOrigin(
      new Request("https://localhost:3101/api/web/portrait/export?format=share"),
      { NODE_ENV: "production", PUBLIC_ORIGIN: "https://localhost:3101" },
    ),
    /不得包含端口|loopback|必须为 https:\/\/tde\.thedesignexpo\.org\.cn/,
  );
});

test("development falls back to request origin when PUBLIC_ORIGIN is absent", () => {
  const request = new Request("http://127.0.0.1:3020/api/web/portrait/export?format=share");
  assert.equal(origin.getPublicOrigin(request, { NODE_ENV: "development" }), "http://127.0.0.1:3020");
  assert.equal(
    origin.buildPublicPortraitUrl("p-dev123", "http://127.0.0.1:3020"),
    "http://127.0.0.1:3020/creator.html?portrait=p-dev123",
  );
});

test("portrait URL rejects numeric creator ids", () => {
  assert.throws(() => origin.buildPublicPortraitUrl("123", "https://tde.thedesignexpo.org.cn"), /public_id/);
});
