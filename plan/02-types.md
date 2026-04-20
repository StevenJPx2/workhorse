# Step 2: Types

Shared types used across 3+ modules. Domain-specific types are colocated with their owning module.

Location: `packages/core/src/types/`

## Issue

```typescript
interface Issue {
  id: string
  externalId: string              // "AM-123", "owner/repo#45"
  source: string                  // plugin-defined: "jira", "github", etc.
  title: string
  description: string
  status: IssueStatus
  issueType: string               // plugin-defined: "bug", "feature", etc.
  url?: string
  assignee?: string
  labels?: string[]
  metadata: Record<string, unknown>
  createdAt: Date
  updatedAt: Date
}

type IssueStatus =
  | "pending" | "queued" | "planning" | "implementing"
  | "blocked" | "pr_created" | "in_review" | "done"
```

`source` and `issueType` are plain strings — plugins define their own literal types and narrow at their boundary. Core doesn't pretend to know what sources or issue types exist.

`IssueStatus` stays as a union because it's core workflow state that every module depends on.

## IssueEvent

```typescript
interface IssueEvent {
  id: string
  issueId: string
  type: string                    // plugin-extensible
  message: string
  metadata?: Record<string, unknown>
  createdAt: Date
}
```

## Notification

```typescript
interface Notification {
  id: string
  issueId: string
  source: string                  // plugin-defined: "jira_comment", "github_review", etc.
  sourceId?: string
  priority: NotificationPriority
  status: NotificationStatus
  title: string
  body: string
  metadata?: Record<string, unknown>
  createdAt: Date
  readAt?: Date
  acknowledgedAt?: Date
}

type NotificationPriority = "blocking" | "high" | "normal" | "low"
type NotificationStatus = "unread" | "read" | "acknowledged"
```

`NotificationPriority` and `NotificationStatus` stay as unions — core workflow logic depends on them. `source` is a plain string owned by plugins.

## Colocated Types (reference)

| Type | Module | Step |
|------|--------|------|
| `HookEventMap` | Hooks | 3 |
| `Plugin`, `PluginManifest`, `PluginContext` | Plugins | 4 |
| `AgentInstance`, `AgentHarness`, `AgentState` | AgentAdapter | 9 |
| `PromptContext`, `PromptContextBlock`, `SessionMemory`, `SessionEntry` | IssueProvider | 8 |
| `IssueParser`, `ParsedIssue` | IssueProvider | 8 |
| `MemoryDocument`, `SearchResult`, `MemorySearchOptions` | MemoryService | 6 |
| `Monitor`, `MonitorResult`, `MonitorFactory`, `MonitorContext` | MonitorService | 7 |

## Zod Schemas

For types that cross boundaries (config, MCP inputs): `IssueStatusSchema`, `NotificationPrioritySchema`. `PluginManifestSchema` lives in `plugins/`.

## Tests

- Zod schemas validate/reject correctly
