# types

Shared domain types and Zod schemas.

## Types

| Type                   | Description                              |
|------------------------|------------------------------------------|
| `Issue`                | Core issue entity (id, externalId, title, status, etc.) |
| `IssueStatus`          | `"todo" \| "in_progress" \| "blocked" \| "review" \| "done"` |
| `IssueEvent`           | Event log entry (comment, status_change, etc.) |
| `Notification`         | System notification with priority/status |
| `NotificationPriority` | `"low" \| "medium" \| "high" \| "urgent"` |
| `NotificationStatus`   | `"unread" \| "read" \| "acknowledged"` |
| `AgentInstance`        | Running agent metadata (issueId, pid, worktree) |

## Schemas

Zod schemas for runtime validation:

```typescript
import { IssueStatusSchema, NotificationPrioritySchema } from "#types";

IssueStatusSchema.parse("in_progress");  // ✓
IssueStatusSchema.parse("invalid");      // throws
```

## Files

- `issue.ts` — `Issue`, `IssueStatus`
- `event.ts` — `IssueEvent`
- `notification.ts` — `Notification`, `NotificationPriority`, `NotificationStatus`
- `agent.ts` — `AgentInstance`
- `schemas.ts` — Zod schemas for all enums
