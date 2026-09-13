import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const root = path.resolve(import.meta.dirname, "..");
const migrationPath = path.join(root, "scripts/migrations/001_execution_project_center.sql");
const args = process.argv.slice(2);
const databaseIndex = args.indexOf("--database");
const databasePath = databaseIndex >= 0 ? args[databaseIndex + 1] : "";
const checkOnly = args.includes("--check");

if (!databasePath || databasePath.startsWith("--")) {
  console.log("用法：node scripts/migrate-execution-project-center.mjs --database /绝对路径/临时数据库.sqlite [--check]");
  process.exit(0);
}

const resolved = path.resolve(databasePath);
const forbidden = [
  path.resolve("/opt/tde/data"),
  path.join(root, "data"),
  path.join(root, ".local-data"),
];
if (forbidden.some((prefix) => resolved === prefix || resolved.startsWith(`${prefix}${path.sep}`))) {
  throw new Error(`拒绝操作正式业务数据库路径：${resolved}`);
}
if (!path.isAbsolute(databasePath)) throw new Error("数据库路径必须是绝对路径");
if (!existsSync(migrationPath)) throw new Error(`迁移文件不存在：${migrationPath}`);

console.log(`目标数据库：${resolved}`);
const db = new DatabaseSync(resolved);
try {
  db.exec("PRAGMA foreign_keys = ON");
  const before = db.prepare(
    "SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'table' AND name = 'execution_projects'",
  ).get().count;
  if (!checkOnly) {
    db.exec("BEGIN");
    try {
      db.exec(readFileSync(migrationPath, "utf8"));
      db.exec("COMMIT");
    } catch (error) {
      try {
        db.exec("ROLLBACK");
      } catch {
        // Preserve the original migration failure if rollback itself is unavailable.
      }
      throw error;
    }
  }
  const after = db.prepare(
    "SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'table' AND name = 'execution_projects'",
  ).get().count;
  const foreignKeys = db.prepare("PRAGMA foreign_key_check").all();
  const integrity = db.prepare("PRAGMA integrity_check").get().integrity_check;
  console.log(JSON.stringify({
    checkOnly,
    wasReady: Number(before) === 1,
    ready: Number(after) === 1,
    foreignKeyErrors: foreignKeys.length,
    integrity,
  }, null, 2));
  if (foreignKeys.length || integrity !== "ok") process.exitCode = 1;
} finally {
  db.close();
}
