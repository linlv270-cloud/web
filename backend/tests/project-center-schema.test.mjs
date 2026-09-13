import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import {
  countProjectTasks,
  createExecutionProject,
  seedExecutionSopStructure,
} from "../lib/execution-projects.ts";

const migration = readFileSync(
  path.join(import.meta.dirname, "../scripts/migrations/001_execution_project_center.sql"),
  "utf8",
);
const newTables = [
  "execution_projects",
  "execution_project_members",
  "execution_project_phases",
  "execution_project_milestones",
  "execution_project_tasks",
  "execution_task_collaborators",
  "execution_task_dependencies",
  "execution_sop_templates",
  "execution_sop_versions",
  "execution_sop_task_templates",
  "execution_file_assets",
  "execution_file_versions",
  "execution_task_evidence",
  "execution_project_records",
  "execution_task_approvals",
  "execution_project_activity_logs",
];

function setupDatabase() {
  const dir = mkdtempSync(path.join(tmpdir(), "qideng-project-center-schema-"));
  const db = new DatabaseSync(path.join(dir, "test.sqlite"));
  db.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE admin_accounts (id INTEGER PRIMARY KEY, status TEXT NOT NULL DEFAULT 'active');
    CREATE TABLE creators (id INTEGER PRIMARY KEY);
    CREATE TABLE venues (id INTEGER PRIMARY KEY);
    CREATE TABLE tde_events (id INTEGER PRIMARY KEY);
    CREATE TABLE design_sessions (id INTEGER PRIMARY KEY);
    CREATE TABLE design_drafts (id INTEGER PRIMARY KEY);
    CREATE TABLE legacy_marker (id INTEGER PRIMARY KEY, value TEXT NOT NULL);
    INSERT INTO admin_accounts(id) VALUES (1), (2), (3);
    INSERT INTO legacy_marker(id, value) VALUES (1, 'untouched');
  `);
  db.exec(migration);
  db.exec(migration);
  return { db, dir };
}

test("migration is idempotent, preserves old data, and creates every table and index", () => {
  const { db, dir } = setupDatabase();
  try {
    for (const table of newTables) {
      assert.equal(db.prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'table' AND name = ?").get(table).count, 1);
    }
    assert.equal(db.prepare("SELECT value FROM legacy_marker WHERE id = 1").get().value, "untouched");
    assert.equal(db.prepare("PRAGMA foreign_key_check").all().length, 0);
    assert.equal(db.prepare("PRAGMA integrity_check").get().integrity_check, "ok");
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'index' AND name LIKE 'execution_%'").get().count > 0, true);
    db.prepare(
      "INSERT INTO execution_projects(code, name, source) VALUES ('PX-1', '项目一', 'CREATOR_CLUSTER')",
    ).run();
    assert.throws(() => db.prepare(
      "INSERT INTO execution_projects(code, name, source) VALUES ('PX-1', '项目重复', 'CREATOR_CLUSTER')",
    ).run());
  } finally {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("project creation creates the default structure and rolls back all steps on failure", () => {
  const { db, dir } = setupDatabase();
  try {
    seedExecutionSopStructure(db);
    const version = db.prepare("SELECT id FROM execution_sop_versions LIMIT 1").get().id;
    db.prepare(`
      INSERT INTO execution_sop_task_templates(
        sop_version_id, phase_code, task_code, title, description, sort_order, is_key,
        deliverables, acceptance_criteria
      ) VALUES (?, 'P00', 'T00', '初始化任务', '结构快照', 1, 1, '文件', '完成')
    `).run(version);
    const created = createExecutionProject({
      code: "PX-ROLLBACK",
      name: "可回滚项目",
      source: "CONCEPT_FIRST",
      managerAdminId: 1,
      createdByAdminId: 1,
      members: [{ userId: 2, role: "MEMBER" }],
      sopVersionId: version,
    }, db);
    assert.equal(created.phaseCount, 12);
    assert.equal(created.milestoneCount, 14);
    assert.ok(created.taskCount >= 1);
    assert.equal(countProjectTasks(created.project.id, db), created.taskCount);
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM execution_project_activity_logs WHERE project_id = ?").get(created.project.id).count, 1);

    db.prepare("UPDATE execution_sop_task_templates SET title = '模板后续修改' WHERE sop_version_id = ?").run(version);
    assert.equal(db.prepare("SELECT title FROM execution_project_tasks WHERE project_id = ? AND code = 'T00'").get(created.project.id).title, "初始化任务");

    assert.throws(() => createExecutionProject({
      code: "PX-FAIL",
      name: "应回滚项目",
      source: "VENUE_REQUEST",
      managerAdminId: 1,
      members: [{ userId: 999, role: "MEMBER" }],
    }, db));
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM execution_projects WHERE code = 'PX-FAIL'").get().count, 0);
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM execution_project_phases p JOIN execution_projects p2 ON p2.id = p.project_id WHERE p2.code = 'PX-FAIL'").get().count, 0);
  } finally {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("schema constraints protect membership, version uniqueness, and evidence chain", () => {
  const { db, dir } = setupDatabase();
  try {
    const project = db.prepare(
      "INSERT INTO execution_projects(code, name, source) VALUES ('PX-CONSTRAINT', '约束项目', 'EXISTING_RELATIONSHIP')",
    ).run();
    const projectId = Number(project.lastInsertRowid);
    db.prepare("INSERT INTO execution_project_members(project_id, user_id, role) VALUES (?, 1, 'MEMBER')").run(projectId);
    assert.throws(() => db.prepare("INSERT INTO execution_project_members(project_id, user_id, role) VALUES (?, 1, 'OBSERVER')").run(projectId));
    const asset = db.prepare(
      "INSERT INTO execution_file_assets(project_id, name) VALUES (?, '文件')",
    ).run(projectId);
    const assetId = Number(asset.lastInsertRowid);
    db.prepare(
      "INSERT INTO execution_file_versions(asset_id, version_number, storage_key) VALUES (?, 1, 'a')",
    ).run(assetId);
    assert.throws(() => db.prepare(
      "INSERT INTO execution_file_versions(asset_id, version_number, storage_key) VALUES (?, 1, 'b')",
    ).run(assetId));
  } finally {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
