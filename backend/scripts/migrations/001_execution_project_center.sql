PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS execution_projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  source TEXT NOT NULL CHECK(source IN ('CREATOR_CLUSTER', 'CONCEPT_FIRST', 'VENUE_REQUEST', 'EXISTING_RELATIONSHIP')),
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE', 'PAUSED', 'COMPLETED', 'CANCELLED', 'ARCHIVED')),
  health TEXT NOT NULL DEFAULT 'GREEN' CHECK(health IN ('GREEN', 'YELLOW', 'RED')),
  description TEXT NOT NULL DEFAULT '',
  manager_admin_id INTEGER REFERENCES admin_accounts(id) ON DELETE SET NULL,
  created_by_admin_id INTEGER REFERENCES admin_accounts(id) ON DELETE SET NULL,
  created_by_label TEXT NOT NULL DEFAULT '',
  source_creator_id INTEGER REFERENCES creators(id) ON DELETE SET NULL,
  source_venue_id INTEGER REFERENCES venues(id) ON DELETE SET NULL,
  source_event_id INTEGER REFERENCES tde_events(id) ON DELETE SET NULL,
  source_design_session_id INTEGER REFERENCES design_sessions(id) ON DELETE SET NULL,
  source_design_draft_id INTEGER REFERENCES design_drafts(id) ON DELETE SET NULL,
  source_reference_id TEXT NOT NULL DEFAULT '',
  venue_name TEXT NOT NULL DEFAULT '',
  venue_contact_name TEXT NOT NULL DEFAULT '',
  venue_contact_info TEXT NOT NULL DEFAULT '',
  venue_address TEXT NOT NULL DEFAULT '',
  activity_direction TEXT NOT NULL DEFAULT '',
  activity_start_at TEXT,
  activity_end_at TEXT,
  move_in_at TEXT,
  move_out_at TEXT,
  scale_description TEXT NOT NULL DEFAULT '',
  cooperation_mode TEXT NOT NULL DEFAULT '',
  budget_range_text TEXT NOT NULL DEFAULT '',
  known_constraints TEXT NOT NULL DEFAULT '',
  priority TEXT NOT NULL DEFAULT 'NORMAL' CHECK(priority IN ('LOW', 'NORMAL', 'HIGH', 'URGENT')),
  creation_basis TEXT NOT NULL DEFAULT '',
  confirmed_items TEXT NOT NULL DEFAULT '',
  unconfirmed_items TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  starts_at TEXT,
  target_end_at TEXT,
  paused_reason TEXT NOT NULL DEFAULT '',
  cancelled_reason TEXT NOT NULL DEFAULT '',
  health_override TEXT CHECK(health_override IN ('RED') OR health_override IS NULL),
  health_override_reason TEXT NOT NULL DEFAULT '',
  closed_at TEXT,
  closed_by_admin_id INTEGER REFERENCES admin_accounts(id) ON DELETE SET NULL,
  closure_type TEXT CHECK(closure_type IN ('COMPLETED', 'CANCELLED') OR closure_type IS NULL),
  close_notes TEXT NOT NULL DEFAULT '',
  cancellation_details TEXT NOT NULL DEFAULT '',
  close_override_reason TEXT NOT NULL DEFAULT '',
  settlement_status_note TEXT NOT NULL DEFAULT '',
  follow_up_notes TEXT NOT NULL DEFAULT '',
  archived_at TEXT,
  deleted_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS execution_projects_status_idx ON execution_projects(status, updated_at DESC);
CREATE INDEX IF NOT EXISTS execution_projects_dates_idx ON execution_projects(starts_at, target_end_at);
CREATE INDEX IF NOT EXISTS execution_projects_manager_idx ON execution_projects(manager_admin_id, status);
CREATE INDEX IF NOT EXISTS execution_projects_health_idx ON execution_projects(health, updated_at DESC);

CREATE TABLE IF NOT EXISTS execution_project_members (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES execution_projects(id) ON DELETE RESTRICT,
  user_id INTEGER NOT NULL REFERENCES admin_accounts(id) ON DELETE RESTRICT,
  role TEXT NOT NULL CHECK(role IN ('PROJECT_MANAGER', 'MEMBER', 'OBSERVER')),
  functional_label TEXT NOT NULL DEFAULT '',
  assigned_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  removed_at TEXT,
  UNIQUE(project_id, user_id)
);
CREATE INDEX IF NOT EXISTS execution_project_members_user_idx ON execution_project_members(user_id, removed_at);
CREATE INDEX IF NOT EXISTS execution_project_members_project_idx ON execution_project_members(project_id, role, removed_at);

CREATE TABLE IF NOT EXISTS execution_project_phases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES execution_projects(id) ON DELETE RESTRICT,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL,
  gate_definition TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'SKIPPED')),
  owner_id INTEGER REFERENCES admin_accounts(id) ON DELETE SET NULL,
  starts_at TEXT,
  due_at TEXT,
  completed_at TEXT,
  completed_by_admin_id INTEGER REFERENCES admin_accounts(id) ON DELETE SET NULL,
  completion_note TEXT NOT NULL DEFAULT '',
  closed_reason TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(project_id, code),
  UNIQUE(project_id, sort_order)
);
CREATE INDEX IF NOT EXISTS execution_project_phases_status_idx ON execution_project_phases(project_id, status, sort_order);

CREATE TABLE IF NOT EXISTS execution_project_milestones (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES execution_projects(id) ON DELETE RESTRICT,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL,
  acceptance_criteria TEXT NOT NULL DEFAULT '',
  is_key INTEGER NOT NULL DEFAULT 0 CHECK(is_key IN (0, 1)),
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'SKIPPED')),
  owner_id INTEGER REFERENCES admin_accounts(id) ON DELETE SET NULL,
  due_at TEXT,
  completed_at TEXT,
  completed_by_admin_id INTEGER REFERENCES admin_accounts(id) ON DELETE SET NULL,
  completion_note TEXT NOT NULL DEFAULT '',
  reopen_reason TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(project_id, code),
  UNIQUE(project_id, sort_order)
);
CREATE INDEX IF NOT EXISTS execution_project_milestones_status_idx ON execution_project_milestones(project_id, status, due_at);

CREATE TABLE IF NOT EXISTS execution_project_tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES execution_projects(id) ON DELETE RESTRICT,
  phase_id INTEGER REFERENCES execution_project_phases(id) ON DELETE SET NULL,
  milestone_id INTEGER REFERENCES execution_project_milestones(id) ON DELETE SET NULL,
  code TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  objective TEXT NOT NULL DEFAULT '',
  start_at TEXT,
  estimated_hours REAL,
  priority TEXT NOT NULL DEFAULT 'NORMAL' CHECK(priority IN ('LOW', 'NORMAL', 'HIGH', 'URGENT')),
  trigger_text TEXT NOT NULL DEFAULT '',
  preconditions TEXT NOT NULL DEFAULT '',
  inputs TEXT NOT NULL DEFAULT '',
  steps TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT', 'READY', 'IN_PROGRESS', 'WAITING_EXTERNAL', 'WAITING_INTERNAL', 'BLOCKED', 'REVIEW', 'REVISION_REQUIRED', 'DONE', 'CANCELLED')),
  owner_id INTEGER REFERENCES admin_accounts(id) ON DELETE SET NULL,
  approver_id INTEGER REFERENCES admin_accounts(id) ON DELETE SET NULL,
  sop_template_id INTEGER REFERENCES execution_sop_templates(id) ON DELETE SET NULL,
  sop_version_id INTEGER REFERENCES execution_sop_versions(id) ON DELETE SET NULL,
  due_at TEXT,
  deliverables TEXT NOT NULL DEFAULT '',
  acceptance_criteria TEXT NOT NULL DEFAULT '',
  waiting_for TEXT NOT NULL DEFAULT '',
  waiting_reason TEXT NOT NULL DEFAULT '',
  next_follow_up_at TEXT,
  blocker_reason TEXT NOT NULL DEFAULT '',
  blocker_impact TEXT NOT NULL DEFAULT '',
  result_summary TEXT NOT NULL DEFAULT '',
  no_file_evidence_reason TEXT NOT NULL DEFAULT '',
  revision_reason TEXT NOT NULL DEFAULT '',
  cancel_reason TEXT NOT NULL DEFAULT '',
  is_key INTEGER NOT NULL DEFAULT 0 CHECK(is_key IN (0, 1)),
  deleted_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TEXT,
  UNIQUE(project_id, code)
);
CREATE INDEX IF NOT EXISTS execution_project_tasks_status_idx ON execution_project_tasks(project_id, status, due_at);
CREATE INDEX IF NOT EXISTS execution_project_tasks_owner_idx ON execution_project_tasks(owner_id, status, due_at);
CREATE INDEX IF NOT EXISTS execution_project_tasks_approver_idx ON execution_project_tasks(approver_id, status);
CREATE INDEX IF NOT EXISTS execution_project_tasks_key_idx ON execution_project_tasks(project_id, is_key, due_at);

CREATE TABLE IF NOT EXISTS execution_task_collaborators (
  task_id INTEGER NOT NULL REFERENCES execution_project_tasks(id) ON DELETE RESTRICT,
  user_id INTEGER NOT NULL REFERENCES admin_accounts(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(task_id, user_id)
);

CREATE TABLE IF NOT EXISTS execution_task_dependencies (
  task_id INTEGER NOT NULL REFERENCES execution_project_tasks(id) ON DELETE RESTRICT,
  depends_on_task_id INTEGER NOT NULL REFERENCES execution_project_tasks(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(task_id, depends_on_task_id),
  CHECK(task_id != depends_on_task_id)
);
CREATE INDEX IF NOT EXISTS execution_task_dependencies_source_idx ON execution_task_dependencies(task_id);
CREATE INDEX IF NOT EXISTS execution_task_dependencies_target_idx ON execution_task_dependencies(depends_on_task_id);

CREATE TABLE IF NOT EXISTS execution_sop_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS execution_sop_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  template_id INTEGER NOT NULL REFERENCES execution_sop_templates(id) ON DELETE RESTRICT,
  version_number INTEGER NOT NULL CHECK(version_number > 0),
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT', 'PUBLISHED', 'ARCHIVED')),
  notes TEXT NOT NULL DEFAULT '',
  created_by_admin_id INTEGER REFERENCES admin_accounts(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(template_id, version_number)
);
CREATE INDEX IF NOT EXISTS execution_sop_versions_status_idx ON execution_sop_versions(template_id, status, version_number DESC);

CREATE TABLE IF NOT EXISTS execution_sop_task_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sop_version_id INTEGER NOT NULL REFERENCES execution_sop_versions(id) ON DELETE RESTRICT,
  phase_code TEXT NOT NULL,
  task_code TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL,
  is_key INTEGER NOT NULL DEFAULT 0 CHECK(is_key IN (0, 1)),
  deliverables TEXT NOT NULL DEFAULT '',
  acceptance_criteria TEXT NOT NULL DEFAULT '',
  UNIQUE(sop_version_id, task_code)
);
CREATE INDEX IF NOT EXISTS execution_sop_task_templates_phase_idx ON execution_sop_task_templates(sop_version_id, phase_code, sort_order);

CREATE TABLE IF NOT EXISTS execution_file_assets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES execution_projects(id) ON DELETE RESTRICT,
  phase_id INTEGER REFERENCES execution_project_phases(id) ON DELETE SET NULL,
  task_id INTEGER REFERENCES execution_project_tasks(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  asset_type TEXT NOT NULL DEFAULT 'OTHER',
  current_version_number INTEGER NOT NULL DEFAULT 0 CHECK(current_version_number >= 0),
  created_by_admin_id INTEGER REFERENCES admin_accounts(id) ON DELETE SET NULL,
  archived_at TEXT,
  deleted_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS execution_file_assets_project_idx ON execution_file_assets(project_id, deleted_at, updated_at DESC);
CREATE INDEX IF NOT EXISTS execution_file_assets_task_idx ON execution_file_assets(task_id, deleted_at);
CREATE INDEX IF NOT EXISTS execution_file_assets_phase_idx ON execution_file_assets(phase_id, deleted_at, updated_at DESC);

CREATE TABLE IF NOT EXISTS execution_file_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  asset_id INTEGER NOT NULL REFERENCES execution_file_assets(id) ON DELETE RESTRICT,
  version_number INTEGER NOT NULL CHECK(version_number > 0),
  storage_key TEXT NOT NULL,
  original_name TEXT NOT NULL DEFAULT '',
  mime_type TEXT NOT NULL DEFAULT 'application/octet-stream',
  size_bytes INTEGER NOT NULL DEFAULT 0 CHECK(size_bytes >= 0),
  checksum TEXT NOT NULL DEFAULT '',
  version_note TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT', 'IN_REVIEW', 'REVISION_REQUIRED', 'APPROVED', 'SUPERSEDED', 'FINAL', 'ARCHIVED')),
  uploaded_by_admin_id INTEGER REFERENCES admin_accounts(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(asset_id, version_number)
);
CREATE INDEX IF NOT EXISTS execution_file_versions_asset_idx ON execution_file_versions(asset_id, version_number DESC);
CREATE INDEX IF NOT EXISTS execution_file_versions_status_idx ON execution_file_versions(status, created_at DESC);

CREATE TABLE IF NOT EXISTS execution_task_evidence (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id INTEGER NOT NULL REFERENCES execution_project_tasks(id) ON DELETE RESTRICT,
  file_version_id INTEGER REFERENCES execution_file_versions(id) ON DELETE RESTRICT,
  external_url TEXT,
  note TEXT NOT NULL DEFAULT '',
  submission_number INTEGER NOT NULL DEFAULT 1,
  created_by_admin_id INTEGER REFERENCES admin_accounts(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK(file_version_id IS NOT NULL OR (external_url IS NOT NULL AND length(trim(external_url)) > 0) OR length(trim(note)) > 0)
);
CREATE INDEX IF NOT EXISTS execution_task_evidence_task_idx ON execution_task_evidence(task_id, created_at DESC);

CREATE TABLE IF NOT EXISTS execution_project_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES execution_projects(id) ON DELETE RESTRICT,
  record_type TEXT NOT NULL CHECK(record_type IN ('COMMUNICATION', 'DECISION', 'RISK', 'ISSUE', 'CHANGE', 'ACTIVITY')),
  title TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'OPEN',
  owner_admin_id INTEGER REFERENCES admin_accounts(id) ON DELETE SET NULL,
  occurred_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  task_id INTEGER REFERENCES execution_project_tasks(id) ON DELETE SET NULL,
  milestone_id INTEGER REFERENCES execution_project_milestones(id) ON DELETE SET NULL,
  attachment_version_ids TEXT NOT NULL DEFAULT '[]',
  payload_json TEXT NOT NULL DEFAULT '{}',
  created_by_admin_id INTEGER REFERENCES admin_accounts(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_by_admin_id INTEGER REFERENCES admin_accounts(id) ON DELETE SET NULL,
  deleted_at TEXT
);
CREATE INDEX IF NOT EXISTS execution_project_records_type_idx ON execution_project_records(project_id, record_type, created_at DESC);
CREATE INDEX IF NOT EXISTS execution_project_records_status_idx ON execution_project_records(project_id, status, occurred_at DESC);
CREATE INDEX IF NOT EXISTS execution_project_records_owner_idx ON execution_project_records(project_id, owner_admin_id, occurred_at DESC);

CREATE TABLE IF NOT EXISTS execution_task_approvals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id INTEGER NOT NULL REFERENCES execution_project_tasks(id) ON DELETE RESTRICT,
  approver_id INTEGER NOT NULL REFERENCES admin_accounts(id) ON DELETE RESTRICT,
  decision TEXT NOT NULL DEFAULT 'PENDING' CHECK(decision IN ('PENDING', 'APPROVED', 'REJECTED')),
  comment TEXT NOT NULL DEFAULT '',
  submission_number INTEGER NOT NULL DEFAULT 1,
  result_summary TEXT NOT NULL DEFAULT '',
  evidence_links TEXT NOT NULL DEFAULT '[]',
  file_version_ids TEXT NOT NULL DEFAULT '[]',
  no_file_evidence_reason TEXT NOT NULL DEFAULT '',
  submitted_by_admin_id INTEGER REFERENCES admin_accounts(id) ON DELETE SET NULL,
  decided_by_admin_id INTEGER REFERENCES admin_accounts(id) ON DELETE SET NULL,
  decided_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS execution_task_approvals_task_idx ON execution_task_approvals(task_id, created_at DESC);

CREATE TABLE IF NOT EXISTS execution_project_activity_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES execution_projects(id) ON DELETE RESTRICT,
  actor_admin_id INTEGER REFERENCES admin_accounts(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id INTEGER,
  payload_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS execution_project_activity_logs_project_idx ON execution_project_activity_logs(project_id, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS execution_project_activity_logs_entity_idx ON execution_project_activity_logs(entity_type, entity_id, created_at DESC);

CREATE TABLE IF NOT EXISTS execution_project_retrospectives (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL UNIQUE REFERENCES execution_projects(id) ON DELETE RESTRICT,
  goals_achieved TEXT NOT NULL DEFAULT '',
  schedule_variance TEXT NOT NULL DEFAULT '',
  budget_variance_text TEXT NOT NULL DEFAULT '',
  main_problems TEXT NOT NULL DEFAULT '',
  effective_sops TEXT NOT NULL DEFAULT '',
  sop_changes_suggested TEXT NOT NULL DEFAULT '',
  missed_tasks TEXT NOT NULL DEFAULT '',
  reusable_assets TEXT NOT NULL DEFAULT '',
  next_time_improvements TEXT NOT NULL DEFAULT '',
  summary TEXT NOT NULL DEFAULT '',
  created_by_admin_id INTEGER REFERENCES admin_accounts(id) ON DELETE SET NULL,
  updated_by_admin_id INTEGER REFERENCES admin_accounts(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TEXT
);
CREATE INDEX IF NOT EXISTS execution_project_retrospectives_completed_idx ON execution_project_retrospectives(completed_at, updated_at DESC);
