# Step 11: Jira Plugin

All Jira functionality in a self-contained plugin. Core has zero Jira knowledge.

Location: `packages/core/src/plugins/builtin/jira/`

## What It Registers

| Hook Point | Registration |
|------------|-------------|
| IssueProvider | Parser for `AM-123`, Jira URLs |
| MonitorService | Jira comment poller (started on `orchestrator.spawn.post`) |
| Prompt Engineer | Jira state context block + workflow instructions via `prompt.building` |
| Tools | Jira-specific tools: `jira_add_comment`, `jira_transition_issue` |
| Hooks | `issue.status_changed` → transition Jira ticket |

## Plugin Config

```toml
[plugins.jira]
cloud_id = "company.atlassian.net"
poll_interval = 30000
```

## Components

### AtlassianClient (class)

Direct REST API client for Jira Cloud (not MCP). Uses `fetch` via Bun's native HTTP.

```typescript
class AtlassianClient {
  constructor(cloudId: string)
  async connect(): Promise<void> // Validates auth (OAuth2 3LO or API token)
  async disconnect(): Promise<void>
  async fetchIssue(ticketKey: string): Promise<JiraIssue>
  async addComment(ticketKey: string, body: string): Promise<void>
  async transitionIssue(ticketKey: string, transitionId: string): Promise<void>
  async getTransitions(ticketKey: string): Promise<JiraTransition[]>
  async editIssue(ticketKey: string, fields: Record<string, unknown>): Promise<void>
  async getCurrentUser(): Promise<{ accountId: string; displayName: string }>
}
```

Auth is OAuth2 3LO or API token, stored in the config keychain. The Atlassian Server SDK is not used here — it is for building plugins that run inside Jira Server/DC instances, not for external REST API clients.

### Parser

Matches `AM-123`, `PROJ-456`, Jira URLs. Calls `client.fetchIssue()`, maps to `ParsedIssue`.

### Comment Poller

Registers `"jira-comments"` monitor at plugin setup. Starts monitoring on `orchestrator.spawn.post` hook. Polls for new comments, creates notifications via `memory.createNotification()`.

### Prompt Enrichment

Hooks `prompt.building`. Pushes two context blocks:
- **Jira State** (priority 10): key, summary, status, priority, assignee, recent comments
- **Jira Workflow** (priority 50): instructions for using Jira tools and transitions

### Status Sync

Hooks `issue.status_changed`. Maps `IssueStatus` → Jira transition heuristically (fetches transitions, matches by name). Calls `client.transitionIssue()`. Ignores non-jira issues.

### Tools

Registers Jira-specific tools with the orchestrator:

- `jira_add_comment(ticketKey: string, body: string)` — Add a comment to the Jira issue
- `jira_transition_issue(ticketKey: string, status: string)` — Transition a Jira issue to a new status

### Mapper

`mapJiraToIssue(jira: JiraIssue): ParsedIssue` — maps Jira fields to generic issue. Stashes `cloudId`, `priority`, `status`, `comments` in `metadata`.

## Domain Types (colocated)

`JiraIssue`, `JiraComment`, `JiraTransition`.

## Auth

OAuth 2.0 via `arctic` (`arctic.Atlassian`).

Flow:
1. Plugin setup checks keychain for existing tokens
2. If missing/expired, starts a temporary local HTTP server to catch the OAuth callback
3. Opens browser to Atlassian authorization URL (`arctic.Atlassian.createAuthorizationURL()`)
4. Receives callback, validates code (`arctic.Atlassian.validateAuthorizationCode()`)
5. Stores access token + refresh token + expiry in config keychain
6. On API calls, uses `Authorization: Bearer <accessToken>` header
7. Auto-refreshes via `arctic` when expired

Config (non-sensitive, in `~/.jiratown.toml`):
```toml
[plugins.jira]
cloud_id = "company.atlassian.net"
poll_interval = 30000
```

Credentials (stored in system keychain via `keychain.ts`):
- `jiratown:jira:client_id` — Atlassian OAuth client ID
- `jiratown:jira:client_secret` — Atlassian OAuth client secret
- `jiratown:jira:access_token` — OAuth access token
- `jiratown:jira:refresh_token` — OAuth refresh token

On first setup, the plugin checks the keychain. If credentials are missing, it prompts the user to run an auth command (or auto-starts the OAuth flow if configured to do so).

## Tests

- Parser: matches Jira keys/URLs, rejects non-Jira, maps correctly
- Monitor: detects new comments, deduplicates, creates notifications
- Mapper: maps all fields, handles missing optionals
- Sync: transitions on status change, ignores non-jira issues
- Prompt: enriches context, formats summary, includes instructions
