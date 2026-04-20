# Step 5: Database

SQLite via `bun:sqlite`. Renamed `tickets` → `issues` with `source` column.

Location: `packages/core/src/lib/db/`

## Schema

```sql
CREATE TABLE issues (
  id TEXT PRIMARY KEY,
  external_id TEXT NOT NULL,
  source TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending',
  issue_type TEXT DEFAULT 'task',
  url TEXT,
  assignee TEXT,
  labels TEXT,                     -- JSON array
  metadata TEXT DEFAULT '{}',      -- JSON object
  worktree_path TEXT,
  pr_url TEXT,
  pr_number INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(external_id, source)
);

CREATE TABLE issue_events (
  id TEXT PRIMARY KEY,
  issue_id TEXT NOT NULL REFERENCES issues(id),
  type TEXT NOT NULL,
  message TEXT NOT NULL,
  metadata TEXT DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE notifications (
  id TEXT PRIMARY KEY,
  issue_id TEXT NOT NULL REFERENCES issues(id),
  source TEXT NOT NULL,
  source_id TEXT UNIQUE,
  priority TEXT NOT NULL DEFAULT 'normal',
  status TEXT NOT NULL DEFAULT 'unread',
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  metadata TEXT DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  read_at TEXT,
  acknowledged_at TEXT
);
```

## Database Class

```typescript
class Database {
  constructor(path: string)       // ":memory:" for tests

  // Issues
  insertIssue(issue: Omit<Issue, "id" | "createdAt" | "updatedAt">): Issue
  getIssueById(id: string): Issue | undefined
  getIssueByExternalId(externalId: string, source: IssueSource): Issue | undefined
  getAllIssues(): Issue[]
  getIssuesByStatus(...statuses: IssueStatus[]): Issue[]
  updateIssue(id: string, updates: Partial<Issue>): Issue
  updateIssueStatus(id: string, status: IssueStatus): Issue
  deleteIssue(id: string): void

  // Events
  insertEvent(event: Omit<IssueEvent, "id" | "createdAt">): IssueEvent
  getEventsForIssue(issueId: string): IssueEvent[]

  // Notifications
  createNotification(input: Omit<Notification, "id" | "createdAt" | "readAt" | "acknowledgedAt" | "status">): Notification
  getUnreadNotifications(issueId: string): Notification[]
  markNotificationRead(id: string): void
  markNotificationAcknowledged(id: string): void
  acknowledgeNotifications(ids: string[]): void

  close(): void
}
```

- Constructor opens DB, runs migrations, sets WAL mode
- Migrations tracked in `_migrations` table, idempotent
- IDs: `crypto.randomUUID()`
- JSON columns (`labels`, `metadata`) serialized/deserialized in CRUD — callers use native JS types

## Tests

All use `:memory:` SQLite.

- Insert/retrieve/update/delete issues
- Unique constraint on `(external_id, source)`
- Metadata round-trips as JSON
- Events ordered by `created_at`
- Notification dedup by `source_id`, mark read/acknowledged, batch acknowledge
