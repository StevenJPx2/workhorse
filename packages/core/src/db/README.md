# db

SQLite database via better-sqlite3 + drizzle-orm.

## Usage

```typescript
import { Database } from "#db";

const db = new Database(":memory:");  // or "/path/to/jiratown.db"

// Issues
const issue = db.issues.insert({ externalId: "PROJ-123", ... });
db.issues.getById(id);
db.issues.getByExternalId("PROJ-123");
db.issues.updateStatus(id, "in_progress");

// Events
db.events.insert({ issueId, type: "comment", message: "..." });
db.events.getForIssue(issueId);

// Notifications
db.notifications.create({ issueId, priority: "high", ... });
db.notifications.getUnread(issueId);
db.notifications.markRead(id);
db.notifications.markAcknowledged(id);

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

Migrations run automatically on `new Database()`.

## Pragmas

- `journal_mode = WAL`
- `foreign_keys = ON`
- `busy_timeout = 5000`
