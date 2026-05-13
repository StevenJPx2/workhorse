# db

SQLite database via @libsql/client + drizzle-orm.

## Usage

```typescript
import { Database } from "#db";

// Create database (async factory - libsql is async)
const db = await Database.create(":memory:");  // or "/path/to/workhorse.db"

// Issues (all methods are async)
const issue = await db.issues.insert({ externalId: "PROJ-123", ... });
await db.issues.getById(id);
await db.issues.getByExternalId("PROJ-123");
await db.issues.updateStatus(id, "in_progress");

// Events
await db.events.insert({ issueId, type: "comment", message: "..." });
await db.events.getForIssue(issueId);

// Notifications
await db.notifications.create({ issueId, priority: "high", ... });
await db.notifications.getUnread(issueId);
await db.notifications.markRead(id);
await db.notifications.markAcknowledged(id);

db.close();
```

## Structure

```
db/
├── database.ts       # Database class, migrations, controller init
├── controllers/      # IssueController, EventController, NotificationController
└── schema/           # Drizzle table definitions
    ├── issues.ts
    ├── events.ts
    └── notifications.ts
```

## Migrations

```bash
cd packages/core && bunx drizzle-kit generate
```

Migrations run automatically on `await Database.create()`.

## Pragmas

- `journal_mode = WAL`
- `foreign_keys = ON`
- `busy_timeout = 5000`

## Notes

- Uses `@libsql/client` which provides an async API (unlike better-sqlite3's sync API)
- All controller methods are async and return Promises
- File-based databases automatically create parent directories
- Supports both `file:` URLs and plain paths (converted to `file:` URLs internally)
