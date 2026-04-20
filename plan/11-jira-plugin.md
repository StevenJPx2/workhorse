# Step 11: Jira Plugin

All Jira functionality in a self-contained plugin. Core has zero Jira knowledge.

External dep: `mcp-remote` (Atlassian MCP OAuth)

Location: `packages/plugins/jira/`

## What It Registers

| Hook Point | Registration |
|------------|-------------|
| IssueProvider | Parser for `AM-123`, Jira URLs |
| MonitorService | Jira comment poller |
| Prompt Engineer | Jira state context block + workflow instructions |
| AgentAdapter | Atlassian MCP server config |
| Hooks | `issue.status_changed` → transition Jira ticket |

## Plugin Config

```toml
[plugins.jira]
cloud_id = "company.atlassian.net"
poll_interval = 30000
```

## Components

### AtlassianClient (class)

MCP-based (not direct REST). Connects via `mcp-remote` to `https://mcp.atlassian.com/v1/mcp`.

```typescript
class AtlassianClient {
  constructor(cloudId: string)
  async connect(): Promise<void>
  async disconnect(): Promise<void>
  async fetchIssue(ticketKey: string): Promise<JiraIssue>
  async addComment(ticketKey: string, body: string): Promise<void>
  async transitionIssue(ticketKey: string, transitionId: string): Promise<void>
  async getTransitions(ticketKey: string): Promise<JiraTransition[]>
  async editIssue(ticketKey: string, fields: Record<string, unknown>): Promise<void>
  async getCurrentUser(): Promise<{ accountId: string; displayName: string }>
}
```

### Parser

Matches `AM-123`, `PROJ-456`, Jira URLs. Calls `client.fetchIssue()`, maps to `ParsedIssue`.

### Comment Poller

Registers `"jira-comments"` monitor. Polls for new comments, creates notifications via `memory.createNotification()`.

### Prompt Enrichment

Hooks `prompt.building`. Pushes two context blocks:
- **Jira State** (priority 10): key, summary, status, priority, assignee, recent comments
- **Jira Workflow** (priority 50): instructions for using Atlassian MCP tools

### Status Sync

Hooks `issue.status_changed`. Maps `IssueStatus` → Jira transition ID, calls `client.transitionIssue()`. Ignores non-jira issues.

### MCP Server Config

Hooks `mcp.config.building`. Adds Atlassian MCP server entry.

### Mapper

`mapJiraToIssue(jira: JiraIssue): ParsedIssue` — maps Jira fields to generic issue. Stashes `cloudId`, `priority`, `status`, `comments` in `metadata`.

## Domain Types (colocated)

`JiraIssue`, `JiraComment`, `JiraTransition`.

## Auth

OAuth via `mcp-remote` browser flow. Cached in `~/.mcp-remote/`.

## Tests

- Parser: matches Jira keys/URLs, rejects non-Jira, maps correctly
- Monitor: detects new comments, deduplicates, creates notifications
- Mapper: maps all fields, handles missing optionals
- Sync: transitions on status change, ignores non-jira issues
- Prompt: enriches context, formats summary, includes instructions
