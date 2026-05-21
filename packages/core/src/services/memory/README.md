# Memory Service

Two-tier memory system for Workhorse agents, combining fast session-level context with long-term semantic search.

## Overview

MemoryService is a facade providing access to three subsystems:

| Subsystem               | Purpose                         | Storage                          | Access Pattern            |
| ----------------------- | ------------------------------- | -------------------------------- | ------------------------- |
| **L1 Store**            | Session memory per worktree     | `context.md` files               | Read/write by issue ID    |
| **L2 Store**            | Semantic search across sessions | SQLite (retriv + FTS5 + vectors) | Query by natural language |
| **Memory Indexer**      | Automatic L2 population         | (uses L1 + L2 Store)             | Hooks + startup indexing  |
| **NotificationService** | Agent inbox management          | SQLite (notifications table)     | CRUD by issue ID          |

## Architecture

```
┌────────────────────────────────────────────────────────┐
│                   MemoryService                       │
│                                                      │
│  ┌──────────┐  ┌──────────┐  ┌────────────────────┐ │
│  │ L1Store  │  │  L2Store  │  │ NotificationService│ │
│  │          │  │           │  │                    │ │
│  │ context  │  │ retriv    │  │ create + dedup     │ │
│  │ .md      │  │ FTS5 +   │  │ getUnread          │ │
│  │ per      │  │ embeddings│  │ generateInbox      │ │
│  │ worktree │  │           │  │ markRead           │ │
│  └──────────┘  └──────────┘  └────────────────────┘ │
└────────────────────────────────────────────────────────┘
```

## Usage

### Creating a MemoryService

```typescript
import { MemoryService } from "#services/memory";

const memory = await MemoryService.create({
  db, // Database instance
  hooks, // HookEmitter instance
  worktreesRoot: "/path/to/worktrees",
  memoryDbPath: "/path/to/memory.db",
});
```

### L1: Session Memory

L1 stores per-worktree session context in Markdown files (`context.md`). Each worktree has its own context file containing patterns, sessions, and status.

```typescript
// Get context for an issue
const ctx = memory.l1.get("AM-123");
if (ctx) {
  const session = await ctx.read();
  console.log(session.title); // "AM-123: Add priority field"
  console.log(session.patterns); // ["Uses Zod for validation", ...]
  console.log(session.latestStatus); // "implementing"
}

// Register a new worktree
const newCtx = memory.l1.register("AM-456", "/path/to/worktree");
await newCtx.create("AM-456: New feature", "planning");

// Append a session entry
await ctx.appendSession({
  timestamp: new Date(),
  status: "implementing",
  summary: ["Added Zod schema for priority field"],
  learnings: ["Drizzle ORM supports $type<T>() for column types"],
  filesChanged: ["src/db/schema/issues.ts"],
});

// Update patterns
await ctx.updatePatterns([
  "Uses Zod for validation",
  "Database migrations via drizzle-kit",
]);

// Re-scan worktrees directory
memory.l1.refresh();
```

#### Context File Format

The `context.md` file (located at `<worktree>/.workhorse/context.md`) is a Markdown document with these sections:

```markdown
# AM-123: Add priority field to tasks

## Patterns

- Uses Zod for validation
- Database migrations via drizzle-kit

## Sessions

### Session 1 — 2025-05-11T10:30:00Z — planning

**Summary:**

- Analyzed existing schema
- Designed priority field approach

**Learnings:**

- Drizzle ORM supports $type<T>() for column types

**Files Changed:**

- src/db/schema/issues.ts

## Status: implementing
```

### L2: Semantic Search

L2 provides hybrid search combining full-text search (FTS5) with vector similarity (transformers.js embeddings via `retriv`).

```typescript
// Index documents
await memory.l2.index([
  {
    id: "session-am123-1",
    content: "Added priority field to issue schema with Zod validation",
    metadata: {
      issueId: "AM-123",
      type: "session_memory",
      source: "agent",
    },
  },
  {
    id: "decision-auth",
    content: "Decision: Use OAuth2 PKCE for Jira authentication",
    metadata: {
      type: "decision",
      source: "human",
    },
  },
]);

// Search
const results = await memory.l2.search("how does auth work?", {
  limit: 5,
  returnContent: true,
});

// Filtered search
const issueResults = await memory.l2.search("schema changes", {
  limit: 10,
  filter: {
    issueId: "AM-123",
    type: "session_memory",
  },
});

// Remove documents
await memory.l2.remove(["session-am123-1"]);

// Close
await memory.l2.close();
```

#### Document Types

| Type             | Description                                           |
| ---------------- | ----------------------------------------------------- |
| `session_memory` | Agent session summaries                               |
| `issue_context`  | Context about specific issues                         |
| `decision`       | Architectural decisions                               |
| `code_context`   | Code-related context                                  |
| _(custom)_       | Plugins can define additional types via `string & {}` |

### Memory Indexer

The Memory Indexer (`MemoryIndexer`) orchestrates data flow into L2, reading from L1 and the filesystem:

1. **Session memories** — Indexed at two points:
   - **On agent stop** (`agent.stop.post` hook) — Final indexing when agent completes
   - **On agent idle** (`agent.idle` hook) — Incremental indexing during idle periods (debounced at 5 seconds)

   The indexer reads the L1 context.md and indexes:
   - Session summary (as `session_memory`)
   - Discovered patterns (as `code_context`)
   - Learnings (as `decision`)

2. **Codebase intelligence** — On startup, indexes documentation files matching glob patterns:
   - `**/README.md`, `**/ARCHITECTURE.md`, `**/CONTRIBUTING.md`, `**/CHANGELOG.md`
   - `docs/**/*.md`
   - `.github/**/*.md`

   Excludes common directories: `node_modules`, `.git`, `dist`, `build`, `coverage`.
   Deduplication ensures files are only indexed once.

```typescript
// Index codebase intelligence manually (deduplicates automatically)
const indexed = await memory.indexer.indexCodebaseIntelligence("/path/to/repo");
console.log(`Indexed ${indexed} new files`);

// Second call skips already-indexed files
const reindexed =
  await memory.indexer.indexCodebaseIntelligence("/path/to/repo");
console.log(`Indexed ${reindexed} new files`); // 0
```

#### Document ID Prefixes

| Prefix      | Source                      |
| ----------- | --------------------------- |
| `codebase:` | Codebase intelligence files |
| `session:`  | Session memory from L1 → L2 |

### Notifications

NotificationService manages agent inboxes with deduplication, priority, and XML generation for system prompts.

```typescript
// Create a notification (deduplicates by sourceId)
const notification = await memory.notifications.create({
  issueId: "AM-123",
  source: "jira", // Source system
  sourceId: "jira-comment-456", // Dedup key
  title: "New comment",
  body: "Please review the implementation",
  priority: "high", // "blocking" | "high" | "normal" | "low"
  metadata: { author: "john.doe" },
});

// Get unread notifications
const unread = await memory.notifications.getUnread("AM-123");

// Generate XML for agent system prompt
const inboxXml = memory.notifications.generateInbox(unread);
// <system_inbox>
//   <notification id="..." priority="high" source="jira">
//     <title>New comment</title>
//     <body>Please review the implementation</body>
//   </notification>
// </system_inbox>

// Mark as read
await memory.notifications.markRead(notification.id);

// Acknowledge multiple
await memory.notifications.acknowledge([id1, id2, id3]);
```

#### Notification Lifecycle

```
  created ──► unread ──► read ──► acknowledged
                           │
                           └──► (agent reads via workhorse_acknowledge tool)
```

- **unread** — Fresh notification, included in agent's system inbox
- **read** — Agent has acknowledged the notification
- **acknowledged** — Agent has confirmed acting on the notification

#### Notification Priority

| Priority   | Description                                         |
| ---------- | --------------------------------------------------- |
| `blocking` | Agent is blocked — needs human response immediately |
| `high`     | Important update (new review, merge conflict)       |
| `normal`   | Standard notification (new comment)                 |
| `low`      | Informational (CI check passed)                     |

## Types

### SessionMemory

```typescript
interface SessionMemory {
  /** Issue title (e.g., "AM-123: Add priority field") */
  title: string;
  /** Codebase patterns discovered during work */
  patterns: string[];
  /** Chronological list of work sessions */
  sessions: SessionEntry[];
  /** Status from the most recent session */
  latestStatus: IssueStatus;
}
```

### SessionEntry

```typescript
interface SessionEntry {
  /** When this session occurred */
  timestamp: Date;
  /** Issue status at end of session */
  status: IssueStatus;
  /** Summary bullet points of work done */
  summary: string[];
  /** Learnings discovered during this session */
  learnings: string[];
  /** Files that were modified */
  filesChanged: string[];
}
```

### MemoryDocument

```typescript
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
```

### SearchResult

```typescript
interface SearchResult {
  id: string;
  score: number;
  content?: string;
  metadata?: Record<string, unknown>;
}
```

### CreateNotificationInput

```typescript
interface CreateNotificationInput {
  issueId: string;
  source: string;
  sourceId?: string; // For deduplication
  priority?: NotificationPriority;
  title: string;
  body: string;
  metadata?: Record<string, unknown>;
}
```

## Files

| File               | Purpose                                             |
| ------------------ | --------------------------------------------------- |
| `service.ts`       | MemoryService facade class                          |
| `indexer.ts`       | MemoryIndexer — automatic session/codebase indexing |
| `l1/store.ts`      | L1Store — manages context.md files across worktrees |
| `l1/context.ts`    | L1Context — CRUD for a single worktree's context.md |
| `l1/parse.ts`      | Markdown → SessionMemory parser                     |
| `l1/serialize.ts`  | SessionMemory → Markdown serializer                 |
| `l2.ts`            | L2Store — semantic search via retriv                |
| `notifications.ts` | NotificationService — notification management       |
| `inbox.ts`         | XML generation for system inbox                     |
| `types.ts`         | All type definitions                                |
| `index.ts`         | Barrel exports                                      |
