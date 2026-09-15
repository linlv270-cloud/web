PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS execution_admin_notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  recipient_admin_id INTEGER NOT NULL REFERENCES admin_accounts(id) ON DELETE CASCADE,
  project_id INTEGER NOT NULL REFERENCES execution_projects(id) ON DELETE CASCADE,
  task_id INTEGER REFERENCES execution_project_tasks(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  actor_admin_id INTEGER REFERENCES admin_accounts(id) ON DELETE SET NULL,
  dedupe_key TEXT NOT NULL UNIQUE,
  read_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS execution_admin_notifications_recipient_idx
  ON execution_admin_notifications(recipient_admin_id, read_at, created_at DESC);
CREATE INDEX IF NOT EXISTS execution_admin_notifications_task_idx
  ON execution_admin_notifications(task_id, created_at DESC);
