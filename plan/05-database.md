# Step 5: Database

SQLite via `better-sqlite3` + Drizzle ORM. Renamed `tickets` → `issues` with `source` column.

Location: `packages/core/src/db/`

Database file: `~/.local/share/jiratown/jiratown.db` (see [Config](./01-config.md) for data directory)

**Status: ✅ Completed**

## Implementation Notes

- **Changed from `bun:sqlite` to `better-sqlite3`** for Node.js/Vitest compatibility
- **Using Drizzle ORM** with Drizzle Kit migrations (not embedded migrations)
- **Composable controller pattern**: `db.issues.insert()`, `db.events.insert()`, `db.notifications.create()`
- Controllers are internal implementation details — only `Database` class is exported from `#db`

## File Structure

```
packages/core/
├── drizzle.config.ts                     # Drizzle Kit config
├── drizzle/
│   ├── 0000_initial.sql                  # Generated migration
│   └── meta/                             # Migration metadata
└── src/db/
    ├── index.ts                          # Public export (Database class only)
    ├── schema/                           # Drizzle schema (split per table)
    │   ├── index.ts                      # Barrel export for tables and types
    │   ├── custom-types.ts               # dateText, nullableDateText column types
    │   ├── issues.ts                     # issues table + Issue, IssueStatus types
    │   ├── events.ts                     # issue_events table + IssueEvent type
    │   └── notifications.ts              # notifications table + Notification types
    ├── database.ts                       # Database class (composes controllers)
    ├── database.test.ts                  # Comprehensive tests (33 tests)
    └── controllers/
        ├── index.ts                      # Barrel export for controllers
        ├── issues.ts                     # IssueController
        ├── events.ts                     # EventController
        └── notifications.ts              # NotificationController
```

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

## Database Class API

```typescript
class Database {
  constructor(path: string)       // ":memory:" for tests

  // Composable controllers
  issues: IssueController
  events: EventController
  notifications: NotificationController

  close(): void
}

// Usage:
const db = new Database(":memory:");

// Issues
const issue = db.issues.insert({ externalId, source, title, ... });
const found = db.issues.getById(id);
const byExternal = db.issues.getByExternalId(externalId, source);
const all = db.issues.getAll();
const byStatus = db.issues.getByStatus("pending", "implementing");
const updated = db.issues.update(id, { title: "New title" });
const statusUpdated = db.issues.updateStatus(id, "done");
db.issues.delete(id);

// Events
const event = db.events.insert({ issueId, type, message });
const events = db.events.getForIssue(issueId);

// Notifications
const notif = db.notifications.create({ issueId, source, title, body, priority });
const unread = db.notifications.getUnread(issueId);
db.notifications.markRead(id);
db.notifications.markAcknowledged(id);
db.notifications.acknowledgeMany([id1, id2]);

db.close();
```

## Implementation Details

- Constructor opens DB, runs Drizzle migrations, sets WAL mode + foreign keys + busy timeout
- Migrations in `packages/core/drizzle/`, config at `packages/core/drizzle.config.ts`
- IDs: `crypto.randomUUID()`
- JSON columns (`labels`, `metadata`) use Drizzle's `text({ mode: "json" }).$type<T>()`
- Drizzle handles JSON serialization/deserialization automatically
- Date columns use custom Drizzle types (`dateText`, `nullableDateText`) for auto-conversion
- **Domain types derived from Drizzle schema** using `typeof table.$inferSelect`
- Types use `| null` for nullable columns (no row transformers needed)

## Dependencies Added

```json
{
  "dependencies": {
    "drizzle-orm": "^0.45.2",
    "better-sqlite3": "^12.9.0"
  },
  "devDependencies": {
    "drizzle-kit": "^0.31.10",
    "@types/better-sqlite3": "^7.6.13"
  }
}
```

## Type Changes

Types are now **derived from Drizzle schema** and re-exported from `packages/core/src/types/`:
- `Issue`, `IssueStatus` — from `src/db/schema/issues.ts`
- `IssueEvent` — from `src/db/schema/events.ts`
- `Notification`, `NotificationPriority`, `NotificationStatus` — from `src/db/schema/notifications.ts`

All nullable columns use `| null` (not `undefined`) to match SQLite/Drizzle semantics.

## Tests

All use `:memory:` SQLite. 33 tests total (32 passing + 1 `test.skip` for future feature).

- Insert/retrieve/update/delete issues
- Unique constraint on `(external_id, source)`
- Same `external_id` allowed with different `source`
- Update all fields individually (branch coverage)
- Metadata and labels round-trip as JSON
- Optional fields (url, assignee, labels, worktreePath, prUrl, prNumber)
- Events ordered by `created_at`
- Notification dedup by `source_id`
- Mark read/acknowledged, batch acknowledge
- Empty array handling in `acknowledgeMany([])`
- Non-existent issue handling (returns undefined / throws on update)
- Multiple in-memory databases (migration idempotency)

## Future Work

- `test.skip`: Cascade delete for issue events/notifications when issue is deleted
