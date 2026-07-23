-- Authoritative D1 schema (mirrors prod, created out-of-band there). Applied to
-- LOCAL D1 for the deploy-free wrangler-dev eval loop:
--   wrangler d1 execute workhorse --local --file=schema.sql
-- Prod was seeded via the D1 API; keep this file in sync when tables change.

CREATE TABLE IF NOT EXISTS tickets (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  repo TEXT NOT NULL,
  prompt TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  plan TEXT,
  result TEXT,
  error TEXT,
  branch TEXT,
  pr_url TEXT,
  run_id TEXT,
  workflow TEXT,
  wf_instance TEXT,
  heal_attempts INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status);
CREATE INDEX IF NOT EXISTS idx_tickets_repo ON tickets(repo);
CREATE INDEX IF NOT EXISTS idx_tickets_updated ON tickets(updated_at);

CREATE TABLE IF NOT EXISTS escalations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_id TEXT NOT NULL,
  run_id TEXT NOT NULL,
  trigger_kind TEXT NOT NULL,
  detail TEXT NOT NULL,
  stage TEXT,
  to_model TEXT,
  at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_esc_ticket ON escalations(ticket_id, run_id);

CREATE TABLE IF NOT EXISTS traces (
  ticket_id TEXT NOT NULL,
  run_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  archived_at TEXT NOT NULL,
  PRIMARY KEY (ticket_id, run_id)
);

CREATE TABLE IF NOT EXISTS notifications (
  ticket_id TEXT NOT NULL,
  seq INTEGER NOT NULL,
  source TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'comment',
  body TEXT NOT NULL,
  author TEXT,
  urgent INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  read_at TEXT,
  PRIMARY KEY (ticket_id, seq)
);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications (ticket_id, read_at);

CREATE TABLE IF NOT EXISTS scripts (
  scope TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  code TEXT NOT NULL,
  args TEXT NOT NULL DEFAULT '[]',
  status_gates TEXT NOT NULL DEFAULT '[]',
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (scope, name)
);
