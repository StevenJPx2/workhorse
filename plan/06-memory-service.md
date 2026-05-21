# Step 6: MemoryService

Two tiers: L1 (context.md per worktree) + L2 (retriv hybrid search). Plus system events and notifications.

Deps: `retriv`, `sqlite-vec`, `@huggingface/transformers`

Location: `packages/core/src/workflow/services/memory/`

## MemoryService Class

```typescript
class MemoryService {
  constructor(db: Database, hooks: Hooks);

  // L1: context.md
  readSessionMemory(worktreePath: string): Promise<SessionMemory | null>;
  writeSessionMemory(
    worktreePath: string,
    memory: SessionMemory,
  ): Promise<void>;
  createSessionMemory(
    worktreePath: string,
    issue: Issue,
  ): Promise<SessionMemory>;
  hasSessionMemory(worktreePath: string): Promise<boolean>;

  // L2: retriv
  index(documents: MemoryDocument[]): Promise<void>;
  search(query: string, options?: MemorySearchOptions): Promise<SearchResult[]>;
  remove(ids: string[]): Promise<void>;

  // System events (DB + hooks)
  emitEvent(
    issueId: string,
    type: IssueEventType,
    message: string,
    metadata?: Record<string, unknown>,
  ): Promise<void>;

  // Notifications (DB + hooks)
  createNotification(input: CreateNotificationInput): Promise<Notification>;
  getUnreadNotifications(issueId: string): Promise<Notification[]>;
  generateSystemInbox(notifications: Notification[]): string;
  markRead(id: string): Promise<void>;
  acknowledge(ids: string[]): Promise<void>;

  // Lifecycle
  initialize(): Promise<void>;
  shutdown(): Promise<void>;
}
```

## Domain Types (colocated)

```typescript
interface SearchResult {
  id: string;
  score: number;
  content?: string;
  metadata?: Record<string, unknown>;
}

interface MemoryDocument {
  id: string;
  content: string;
  metadata: {
    issueId?: string;
    type: MemoryDocumentType;
    source?: string;
    [key: string]: unknown;
  };
}

type MemoryDocumentType =
  | "session_memory"
  | "issue_context"
  | "pr_context"
  | "decision"
  | "code_context"
  | (string & {});

interface MemorySearchOptions {
  limit?: number;
  filter?: {
    issueId?: string;
    type?: MemoryDocumentType;
    source?: string;
    [key: string]: unknown;
  };
  returnContent?: boolean;
}
```

## L1: context.md (ralph-style append-only)

File at `<worktree>/.workhorse/context.md`. Append-only — each agent session appends an entry. Patterns section at top is the only rewritable part.

```markdown
# AM-123: Add priority field to tasks

## Patterns

- This codebase uses drizzle ORM for all DB access
- Always run `bun run typecheck` before committing

## Sessions

### 2025-07-15T10:30:00Z — Initial implementation

Status: implementing

- Analyzed the issue requirements
- Created migration for priority column
- **Learnings:**
  - Drizzle migrations need `bun run db:generate` then `bun run db:migrate`
- **Files changed:** src/models/task.ts, drizzle/0002_add_priority.sql

---
```

Parsed into:

```typescript
interface SessionMemory {
  title: string;
  patterns: string[];
  sessions: SessionEntry[];
  latestStatus: IssueStatus;
}

interface SessionEntry {
  timestamp: Date;
  status: IssueStatus;
  summary: string[];
  learnings: string[];
  filesChanged: string[];
}
```

## L2: retriv

```typescript
const retriv = createRetriv({
  driver: sqlite({
    path: "~/.workhorse/memory.db",
    embeddings: transformersJs({ model: "Xenova/all-MiniLM-L6-v2" }),
  }),
  chunking: autoChunker(),
  categories: (doc) => doc.metadata?.type || "other",
});
```

Separate SQLite DB (`memory.db`) from operational `workhorse.db`.

## System Inbox

```xml
<system_inbox>
  <notification id="..." priority="..." source="...">
    <title>...</title>
    <body>...</body>
  </notification>
</system_inbox>
```

## Hook Integration

- `issue.status_changed` → update session memory
- `emitEvent()` → insert DB + emit hook
- `createNotification()` → insert DB + emit `notification.created` (Harness listens to this and pushes to agent via `sendKeys`)

## Tests

- L1: create, append, parse (patterns, sessions, status), handle missing file
- L2: index/search/remove, filter by metadata, hybrid search
- Notifications: create, dedup, mark read/acknowledged, `generateSystemInbox` format
- Events: emit stores in DB + fires hook
