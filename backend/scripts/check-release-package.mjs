import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const root = process.cwd();
const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const defaultName = `qideng-workshop-platform-${packageJson.version}.tar.gz`;
const explicitPackagePath = process.argv[2] || process.env.RELEASE_PACKAGE || "";

function findDefaultPackage() {
  const releaseDir = path.join(root, ".release");
  const fallback = path.join(".release", defaultName);
  if (!fs.existsSync(releaseDir)) return fallback;
  const prefix = `qideng-workshop-platform-${packageJson.version}`;
  const candidates = fs.readdirSync(releaseDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.startsWith(prefix) && entry.name.endsWith(".tar.gz"))
    .map((entry) => entry.name);
  const sourceCandidates = candidates.filter((name) => name.includes("-source"));
  const pool = sourceCandidates.length ? sourceCandidates : candidates;
  pool.sort((left, right) => {
    const leftMtime = fs.statSync(path.join(releaseDir, left)).mtimeMs;
    const rightMtime = fs.statSync(path.join(releaseDir, right)).mtimeMs;
    return rightMtime - leftMtime || right.localeCompare(left);
  });
  return pool.length ? path.join(".release", pool[0]) : fallback;
}

const selectedPackage = explicitPackagePath || findDefaultPackage();
const packagePath = path.resolve(root, selectedPackage);
const checksumPath = `${packagePath}.sha256`;

const failures = [];
const notes = [];

function fail(message) {
  failures.push(message);
}

function pass(message) {
  notes.push(message);
}

if (!explicitPackagePath && fs.existsSync(packagePath)) pass(`自动选择当前版本源码发布包：${path.relative(root, packagePath)}`);

function listTarEntries(file) {
  return execFileSync("tar", ["-tzf", file], { encoding: "utf8", maxBuffer: 10 * 1024 * 1024 })
    .trim()
    .split("\n")
    .filter(Boolean);
}

if (!fs.existsSync(packagePath)) fail(`发布包不存在：${packagePath}`);
if (!fs.existsSync(checksumPath)) fail(`发布包哈希文件不存在：${checksumPath}`);

if (!failures.length) {
  const body = fs.readFileSync(packagePath);
  const actual = crypto.createHash("sha256").update(body).digest("hex");
  const checksum = fs.readFileSync(checksumPath, "utf8").trim();
  if (!checksum.startsWith(actual)) fail("发布包 SHA256 与 .sha256 文件不一致");
  else pass("发布包 SHA256 校验通过。");

  const entries = listTarEntries(packagePath);
  const entrySet = new Set(entries);
  const required = [
    "./package.json",
    "./package-lock.json",
    "./.env.example",
    "./LAUNCH_READINESS.md",
    "./RELEASE_MANIFEST.json",
    "./design-system/qideng-tokens.json",
    "./design-system/generate-tokens.mjs",
    "./deploy/README.md",
    "./deploy/nginx.conf",
    "./scripts/launch-check.mjs",
    "./scripts/check-workshop-rules.mjs",
    "./scripts/check-design-system.mjs",
    "./scripts/check-content-first.mjs",
    "./scripts/check-release-package.mjs",
    "./scripts/create-release-package.mjs",
    "./scripts/check-local-ready.mjs",
    "./scripts/check-production-env.mjs",
    "./scripts/check-tencent-map-key.mjs",
    "./miniprogram/app.json",
    "./lib/version.ts",
    "./tests/release-smoke.mjs",
  ];
  for (const file of required) {
    if (!entrySet.has(file)) fail(`发布包缺少关键文件：${file}`);
  }
  if (!required.some((file) => !entrySet.has(file))) pass("发布包包含上线检查、部署、小程序和冒烟测试关键文件。");

  const forbiddenPatterns = [
    /^\.\/\.env$/,
    /^\.\/\.env\.(?!example$)/,
    /^\.\/node_modules(?:\/|$)/,
    /^\.\/\.next(?:\/|$)/,
    /^\.\/\.release(?:\/|$)/,
    /^\.\/\.secrets(?:\/|$)/,
    /^\.\/\.npm-cache(?:\/|$)/,
    /(^|\/)\.DS_Store(?:\/|$)/,
    /(^|\/)\._[^/]*(?:\/|$)/,
    /^\.\/data\/.*\.sqlite/,
    /^\.\/data\/uploads(?:\/|$)/,
    /\.log$/,
  ];
  const forbidden = entries.filter((entry) => forbiddenPatterns.some((pattern) => pattern.test(entry)));
  if (forbidden.length) {
    fail(`发布包包含不应上线的文件：${forbidden.slice(0, 20).join(", ")}`);
  } else {
    pass("发布包未包含 .env、私钥、node_modules、.next、数据库、上传目录或日志。");
  }

  const packageContent = execFileSync("tar", ["-xOzf", packagePath, "./package.json"], { encoding: "utf8" });
  const packagedJson = JSON.parse(packageContent);
  if (packagedJson.name !== packageJson.name) fail(`发布包 package name ${packagedJson.name} 与当前工程 ${packageJson.name} 不一致`);
  if (packagedJson.version !== packageJson.version) fail(`发布包版本 ${packagedJson.version} 与当前版本 ${packageJson.version} 不一致`);
  if (!packagedJson.scripts?.["check:workshop-rules"]) fail("发布包缺少 check:workshop-rules 脚本");
  else pass(`发布包版本为 ${packagedJson.version}，并包含业务规则体检脚本。`);
  const parentDependentScripts = Object.entries(packagedJson.scripts || {}).filter(([, command]) => String(command).includes("../"));
  if (parentDependentScripts.length) fail(`发布包脚本仍依赖包外目录：${parentDependentScripts.map(([name]) => name).join(", ")}`);
  else pass("发布包中的 npm 脚本不依赖父级工作区目录。");

  const manifestContent = execFileSync("tar", ["-xOzf", packagePath, "./RELEASE_MANIFEST.json"], { encoding: "utf8" });
  const manifest = JSON.parse(manifestContent);
  if (manifest.version !== packageJson.version || manifest.selfContained !== true) fail("发布清单缺少正确版本或自包含标记");
  else pass("发布清单已标记为可独立安装、检查和构建。");
}

if (failures.length) {
  console.error("发布包体检未通过：");
  for (const item of failures) console.error(`- ${item}`);
  process.exitCode = 1;
} else {
  console.log("发布包体检通过：");
  for (const item of notes) console.log(`- ${item}`);
}
