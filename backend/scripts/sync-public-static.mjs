import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const root = process.cwd();
const bundledFrontend = path.join(root, "frontend");
const sourceRoot = existsSync(bundledFrontend) && statSync(bundledFrontend).isDirectory()
  ? bundledFrontend
  : path.resolve(root, "../frontend");
const targetRoot = path.join(root, "public");
const checkOnly = process.argv.includes("--check");

const ignoredNames = new Set([".DS_Store"]);

function shouldIgnore(relativePath) {
  const name = path.basename(relativePath);
  return ignoredNames.has(name) || name.startsWith("._");
}

function walk(directory, relative = "") {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const nextRelative = path.join(relative, entry.name);
    if (shouldIgnore(nextRelative)) return [];
    const fullPath = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(fullPath, nextRelative) : [nextRelative];
  });
}

function digest(file) {
  return crypto.createHash("sha256").update(readFileSync(file)).digest("hex");
}

function compareFiles(relativePath) {
  const source = path.join(sourceRoot, relativePath);
  const target = path.join(targetRoot, relativePath);
  if (!existsSync(target)) return "missing";
  if (!statSync(target).isFile()) return "type-mismatch";
  return digest(source) === digest(target) ? null : "different";
}

if (!existsSync(sourceRoot) || !statSync(sourceRoot).isDirectory()) {
  throw new Error(`静态唯一来源不存在：${sourceRoot}`);
}

const sourceFiles = walk(sourceRoot);
const targetFiles = walk(targetRoot);
const sourceSet = new Set(sourceFiles);
const missing = sourceFiles.filter((file) => compareFiles(file) === "missing");
const different = sourceFiles.filter((file) => compareFiles(file) === "different");
const typeMismatch = sourceFiles.filter((file) => compareFiles(file) === "type-mismatch");
const extra = targetFiles.filter((file) => !sourceSet.has(file));

if (checkOnly) {
  const problems = [
    ...missing.map((file) => `缺少 ${file}`),
    ...different.map((file) => `内容不一致 ${file}`),
    ...typeMismatch.map((file) => `类型不一致 ${file}`),
    ...extra.map((file) => `多余 ${file}`),
  ];
  if (problems.length) {
    throw new Error(`静态副本未同步：\n${problems.map((item) => `- ${item}`).join("\n")}`);
  }
  console.log(`静态副本一致：${sourceFiles.length} 个文件`);
  process.exit(0);
}

for (const relativePath of sourceFiles) {
  const source = path.join(sourceRoot, relativePath);
  const target = path.join(targetRoot, relativePath);
  mkdirSync(path.dirname(target), { recursive: true });
  cpSync(source, target);
}

for (const relativePath of extra) {
  rmSync(path.join(targetRoot, relativePath), { force: true });
}

const emptyDirectories = [];
function collectEmptyDirectories(directory) {
  if (!existsSync(directory) || !statSync(directory).isDirectory()) return;
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) collectEmptyDirectories(fullPath);
  }
  if (directory !== targetRoot && readdirSync(directory).length === 0) emptyDirectories.push(directory);
}
collectEmptyDirectories(targetRoot);
for (const directory of emptyDirectories.sort((a, b) => b.length - a.length)) {
  rmSync(directory, { recursive: true, force: true });
}

console.log(`已同步静态副本：${sourceFiles.length} 个文件`);
