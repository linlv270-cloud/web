import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

const root = process.cwd();
const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const releaseDir = path.join(root, ".release");

const sourceDirectories = ["app", "chandiduan", "deploy", "design-system", "docs", "lib", "miniprogram", "public", "scripts", "tests"];
const siblingSourceDirectories = ["frontend"];
const sourceFiles = [
  ".env.example",
  ".gitignore",
  "LAUNCH_READINESS.md",
  "MIGRATION_BASELINE.md",
  "README.md",
  "SOURCE_BACKUP.md",
  "eslint.config.mjs",
  "instrumentation.ts",
  "next-env.d.ts",
  "next.config.mjs",
  "package-lock.json",
  "package.json",
  "postcss.config.mjs",
  "project.config.json",
  "tsconfig.json",
];

function runGate(script) {
  execFileSync(process.platform === "win32" ? "npm.cmd" : "npm", ["run", script], {
    cwd: root,
    env: process.env,
    stdio: "inherit",
  });
}

function shanghaiTimestamp() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}${value.month}${value.day}-${value.hour}${value.minute}${value.second}`;
}

function shouldCopy(source) {
  const relative = path.relative(root, source);
  if (relative === "scripts/local-project-center-seed.mjs") return false;
  if (relative === "scripts/seed-workshop-preview.mjs") return false;
  if (relative === "deploy/qideng-backup") return false;
  if (relative === "tests/screenshots" || relative.startsWith("tests/screenshots/")) return false;
  if (!relative) return true;
  const segments = relative.split(path.sep);
  const name = path.basename(source);
  if (name !== "SOURCE_BACKUP.md" && /backup/i.test(name)) return false;
  if (segments.some((segment) => ["node_modules", ".next", ".release", ".secrets", ".npm-cache", ".tmp-tests", ".preview-data"].includes(segment))) return false;
  if (name === ".DS_Store" || name.startsWith("._") || name.endsWith(".log")) return false;
  if (/\.(?:sqlite(?:-shm|-wal)?|pem|p12|pfx)$/i.test(name) || /^(?:id_rsa|id_ed25519)$/i.test(name)) return false;
  return true;
}

function walkFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? walkFiles(file) : [file];
  });
}

if (process.env.RELEASE_SKIP_CHECKS !== "YES") {
  runGate("check:all");
  runGate("test");
}

const stagingRoot = fs.mkdtempSync(path.join(os.tmpdir(), "qideng-source-release-"));
const staging = path.join(stagingRoot, "package");
fs.mkdirSync(staging, { recursive: true });

try {
  for (const relative of sourceDirectories) {
    const source = path.join(root, relative);
    if (!fs.existsSync(source)) throw new Error(`Missing release source directory: ${relative}`);
    fs.cpSync(source, path.join(staging, relative), { recursive: true, filter: shouldCopy });
  }
  for (const relative of siblingSourceDirectories) {
    const source = path.resolve(root, "..", relative);
    if (!fs.existsSync(source)) throw new Error(`Missing release source directory: ../${relative}`);
    fs.cpSync(source, path.join(staging, relative), { recursive: true, filter: shouldCopy });
  }
  for (const relative of sourceFiles) {
    const source = path.join(root, relative);
    if (!fs.existsSync(source)) throw new Error(`Missing release source file: ${relative}`);
    fs.copyFileSync(source, path.join(staging, relative));
  }

  const suspicious = walkFiles(staging).filter((file) => {
    const relative = path.relative(staging, file);
    if (/\.env(?:\.|$)/.test(relative) && relative !== ".env.example") return true;
    if (/\.(?:key|pem|p12|pfx)$/i.test(relative)) return true;
    if (fs.statSync(file).size > 2 * 1024 * 1024) return false;
    return /-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(fs.readFileSync(file, "utf8"));
  });
  if (suspicious.length) throw new Error(`Release staging contains sensitive files: ${suspicious.map((file) => path.relative(staging, file)).join(", ")}`);

  fs.writeFileSync(path.join(staging, "RELEASE_MANIFEST.json"), `${JSON.stringify({
    name: packageJson.name,
    version: packageJson.version,
    packageKind: "source-only-build-input",
    createdAt: new Date().toISOString(),
    checks: process.env.RELEASE_SKIP_CHECKS === "YES" ? "performed separately" : "check:all and test passed before packaging",
    selfContained: true,
  }, null, 2)}\n`);

  fs.mkdirSync(releaseDir, { recursive: true });
  const timestamp = process.env.RELEASE_TIMESTAMP || shanghaiTimestamp();
  const basename = `qideng-workshop-platform-${packageJson.version}-${timestamp}-source.tar.gz`;
  const packagePath = path.join(releaseDir, basename);
  if (process.platform === "darwin") {
    execFileSync("xattr", ["-cr", staging], { stdio: "inherit" });
  }
  execFileSync("tar", ["-czf", packagePath, "-C", staging, "."], {
    env: { ...process.env, COPYFILE_DISABLE: "1" },
    stdio: "inherit",
  });

  const body = fs.readFileSync(packagePath);
  const checksum = crypto.createHash("sha256").update(body).digest("hex");
  fs.writeFileSync(`${packagePath}.sha256`, `${checksum}  ${basename}\n`);
  console.log(packagePath);
  console.log(`${packagePath}.sha256`);
} finally {
  fs.rmSync(stagingRoot, { recursive: true, force: true });
}
