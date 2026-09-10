import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

const packageRoot = path.resolve(import.meta.dirname, "..");
const frontendRoot = path.resolve(packageRoot, "../frontend");
const publicRoot = path.resolve(packageRoot, "public");

test("主理人端 exposes one shared PWA install experience", () => {
  const manifest = JSON.parse(readFileSync(path.join(frontendRoot, "manifest.json"), "utf8"));
  const installScript = readFileSync(path.join(frontendRoot, "pwa-install.js"), "utf8");
  const serviceWorker = readFileSync(path.join(frontendRoot, "service-worker.js"), "utf8");

  assert.equal(manifest.name, "TDE 主理人");
  assert.equal(manifest.start_url, "/index.html");
  assert.equal(manifest.scope, "/");
  assert.equal(manifest.display, "standalone");
  assert.deepEqual(manifest.icons.map((icon) => icon.sizes), ["192x192", "512x512"]);

  for (const root of [frontendRoot, publicRoot]) {
    for (const pageName of ["index.html", "profile.html"]) {
      const html = readFileSync(path.join(root, pageName), "utf8");
      assert.match(html, /rel="manifest" href="manifest\.json"/);
      assert.match(html, /rel="apple-touch-icon"[^>]+pwa-icon-180\.png/);
      assert.match(html, /data-install-app/);
      assert.match(html, /src="pwa-install\.js"/);
    }
    assert.equal(readFileSync(path.join(root, "manifest.json"), "utf8"), readFileSync(path.join(frontendRoot, "manifest.json"), "utf8"));
    assert.equal(readFileSync(path.join(root, "pwa-install.js"), "utf8"), installScript);
    assert.equal(readFileSync(path.join(root, "service-worker.js"), "utf8"), serviceWorker);
    for (const iconName of ["pwa-icon-180.png", "pwa-icon-192.png", "pwa-icon-512.png"]) {
      assert.deepEqual(readFileSync(path.join(root, iconName)), readFileSync(path.join(frontendRoot, iconName)));
    }
  }

  assert.match(installScript, /beforeinstallprompt/);
  assert.match(installScript, /添加到桌面/);
  assert.match(installScript, /不影响账号和资料/);
  assert.match(installScript, /添加到主屏幕/);
  assert.match(serviceWorker, /pathname\.startsWith\("\/api\/"\)/);
});
