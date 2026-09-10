import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

const backendRoot = path.resolve(import.meta.dirname, "..");
const sourceRoot = path.resolve(backendRoot, "../frontend");
const targetRoot = path.join(backendRoot, "public");

function walk(directory, relative = "") {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const nextRelative = path.join(relative, entry.name);
    if (entry.name === ".DS_Store" || entry.name.startsWith("._")) return [];
    const fullPath = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(fullPath, nextRelative) : [nextRelative];
  });
}

function digest(file) {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

test("frontend is the single source for backend/public static files", () => {
  assert.ok(existsSync(sourceRoot), `missing static source: ${sourceRoot}`);
  assert.ok(existsSync(targetRoot), `missing generated public directory: ${targetRoot}`);
  const sourceFiles = walk(sourceRoot).sort();
  const targetFiles = walk(targetRoot).sort();
  assert.deepEqual(targetFiles, sourceFiles);
  for (const relativePath of sourceFiles) {
    const source = path.join(sourceRoot, relativePath);
    const target = path.join(targetRoot, relativePath);
    assert.equal(statSync(target).isFile(), true, `generated target is not a file: ${relativePath}`);
    assert.equal(digest(target), digest(source), `static copy drift: ${relativePath}`);
  }
});
