# @jiratown/plugin-jira

Jira Cloud integration plugin for Jiratown. Provides issue parsing, comment monitoring, status sync, tools, steering, and prompt enrichment.

## Installation

```bash
bun add @jiratown/plugin-jira
```

## Prerequisites

- **Jira Cloud** account with API access
- **OAuth credentials** stored in system keychain (via `jiratown setup` or manual keychain entry)
- Cloud ID for your Jira instance (e.g., `company.atlassian.net`)

## Features

| Feature | Description |
|---------|-------------|
| **Issue Parsing** | Parse Jira ticket keys (`PROJ-123`) and URLs into Jiratown issues |
| **Comment Monitor** | Poll for new comments and update notifications |
| **Prompt Enrichment** | Inject Jira issue state into agent system prompts |
| **Status Sync** | Sync Jiratown issue status → Jira workflow transitions |
| **Tools** | `jira_add_comment`, `jira_transition_issue`, `jira_get_comments` |
| **Steering** | Idle agent reminders for unread comments |
| **Cross-plugin Sync** | React to GitHub PR events (when both plugins are loaded) |

## Configuration

```toml
# ~/.jiratown.toml or .jiratown.toml

[plugins.jira]
cloud_id = "company.atlassian.net"    # Required — your Jira Cloud ID
poll_interval = 30000                  # Comment poll interval in ms (default: 30000)
```

## Usage

### Register the Plugin

```typescript
import { jiraPlugin } from "@jiratown/plugin-jira";

const jt = await bootstrap({
  plugins: [jiraPlugin],
});
```

### Authentication

The plugin uses OAuth credentials stored in the system keychain:

```typescript
// Credentials are retrieved via keychain at runtime
// Store them via `jiratown setup` or manually:
import { storeCredential } from "@jiratown/core";

await storeCredential("jiratown", "jira_access_token", "your-token");
await storeCredential("jiratown", "jira_refresh_token", "your-refresh-token");
```

### Issue Parsing

The plugin registers a parser that handles Jira references:

```typescript
// These inputs are recognized:
await tracker.parseInput("PROJ-123");                                        // Ticket key
await tracker.parseInput("https://company.atlassian.net/browse/PROJ-123");  // URL

// The parser fetches the full issue from Jira REST API
```

### Comment Monitoring

The comment monitor polls for new comments on issues being worked on:

- Starts automatically when an agent spawns on a Jira issue
- Emits `monitor.tick` when new comments are found
- Creates notifications for each new comment
- Deduplicates by comment ID

```typescript
// Automatic — triggered by agent.create.post hook
// The monitor polls every `poll_interval` milliseconds
```

### Tools

#### jira_add_comment

Add a comment to a Jira issue, optionally as a reply:

```typescript
{
  ticketKey: "PROJ-123",
  body: "I've pushed the changes. Please review.",
  replyToId: "comment-456"    // Optional — for threaded replies
}
```

#### jira_transition_issue

Transition a Jira issue to a new status:

```typescript
{
  ticketKey: "PROJ-123",
  status: "In Progress"       // Must match an available Jira transition
}
```

The plugin automatically fetches available transitions and matches by name.

#### jira_get_comments

Get all comments from a Jira issue:

```typescript
{
  ticketKey: "PROJ-123"
}

// Returns comments with id, author, body, timestamps, and parentId
```

### Prompt Enrichment

The plugin adds context blocks to agent prompts via the `prompt.building` hook:

- **Jira Issue State** — Title, status, priority, assignee, description
- **Workflow Instructions** — Step-by-step guidance for Jira workflows
- **Available Transitions** — List of valid status transitions

### Status Sync

Jiratown issue status changes are synced to Jira workflow transitions:

| Jiratown Status | Jira Transition (typical) |
|-----------------|--------------------------|
| `planning` | → "In Progress" |
| `implementing` | → "In Progress" |
| `in_review` | → "In Review" |
| `blocked` | → "Blocked" |
| `done` | → "Done" |

The actual transition names depend on your Jira workflow configuration. The plugin auto-discovers available transitions.

### Cross-Plugin Sync

When both the Jira and GitHub plugins are loaded, the Jira plugin reacts to GitHub events:

- **PR Opened** — Adds a comment to the Jira issue linking the PR
- **PR Merged** — Adds a comment and transitions the Jira issue
- **PR Review** — Adds a comment about review feedback

### Steering Rules

The plugin registers steering rules for idle agents:

1. **Comment Response** — When agent is idle and has unread Jira comment notifications, reminds to check for new comments
2. **Status Check** — When agent updates status, reminds to sync with Jira

## Client API

The `AtlassianClient` provides direct Jira REST API access:

```typescript
import { AtlassianClient } from "@jiratown/plugin-jira";

const client = new AtlassianClient("company.atlassian.net", credentialGetter);

// Fetch an issue
const issue = await client.fetchIssue("PROJ-123");

// Add a comment
await client.addComment("PROJ-123", "Working on this now.");

// Get available transitions
const transitions = await client.getTransitions("PROJ-123");

// Transition an issue
await client.transitionIssue("PROJ-123", "31");  // transition ID

// Edit issue fields
await client.editIssue("PROJ-123", { priority: { name: "High" } });

// Get current user
const user = await client.getCurrentUser();
```

## Types

### JiraIssue

```typescript
interface JiraIssue {
  key: string;
  self: string;
  fields: {
    summary: string;
    description?: string;
    status: { name: string; id: string };
    priority?: { name: string; id: string };
    assignee?: { displayName: string; accountId: string } | null;
    reporter?: { displayName: string; accountId: string };
    issuetype?: { name: string };
    labels?: string[];
    comment?: { comments: JiraComment[]; total: number };
    created?: string;
    updated?: string;
  };
}
```

### JiraComment

```typescript
interface JiraComment {
  id: string;
  author: { displayName: string; accountId: string };
  body: string;
  created: string;
  updated: string;
  parentId?: string;    // For threaded replies
}
```

### JiraTransition

```typescript
interface JiraTransition {
  id: string;
  name: string;
  to: { name: string; id: string };
}
```

### JiraCredentials

```typescript
interface JiraCredentials {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: Date;
}
```

## Files

| File | Purpose |
|------|---------|
| `index.ts` | Plugin definition and setup |
| `client.ts` | AtlassianClient — Jira Cloud REST API wrapper |
| `auth.ts` | Credential retrieval from system keychain |
| `parser.ts` | Jira ticket key/URL parsing |
| `mapper.ts` | JiraIssue → Jiratown issue mapping |
| `monitor.ts` | Comment monitor factory |
| `prompt.ts` | Prompt enrichment via `prompt.building` hook |
| `sync.ts` | Status sync (Jiratown → Jira transitions) |
| `cross-plugin-sync.ts` | Reactions to GitHub plugin events |
| `steering.ts` | Steering rules for comment responses |
| `tools.ts` | Tool definitions and implementations |
| `renderer.ts` | TUI activity renderer |
| `hooks.ts` | Plugin-specific hook type definitions |
| `types.ts` | Domain types (JiraIssue, JiraComment, etc.) |

## License

MIT
