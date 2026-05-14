# workhorse-plugin-jira

Jira Cloud integration for Workhorse — enables agents to work on Jira tickets with auto-transitions, comments, and cross-plugin coordination.

## What This Plugin Does

This plugin connects Workhorse to Jira Cloud, providing:

- **Ticket parsing** from `PROJ-123` keys and Jira URLs
- **Status transitions** — auto-move tickets through workflow
- **Comment monitoring** — detect feedback and notify agents
- **Cross-plugin sync** — transition tickets when GitHub PRs merge
- **Steering rules** — remind agents to update Jira after code changes

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                       Jira Plugin                                │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
│  │   Parser    │  │   Monitor   │  │         Tools           │  │
│  │  PROJ-123   │  │  Comments   │  │ add_comment, transition │  │
│  │  URLs       │  │  (polling)  │  │ get_comments            │  │
│  └──────┬──────┘  └──────┬──────┘  └───────────┬─────────────┘  │
│         │                │                     │                 │
│         ▼                ▼                     ▼                 │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                     Steering Rules                         │  │
│  │  update-after-impl │ transition-after-merge │ feedback     │  │
│  └───────────────────────────────────────────────────────────┘  │
├─────────────────────────────────────────────────────────────────┤
│                    Request/Consumer Pattern                      │
│  ┌─────────────────┐          ┌─────────────────────────────┐   │
│  │   Sync Layer    │ ──emit─▶ │    Hook Consumer Layer      │   │
│  │ (status sync)   │          │ (executes Jira API calls)   │   │
│  └─────────────────┘          └─────────────────────────────┘   │
├─────────────────────────────────────────────────────────────────┤
│  Hooks Emitted: transition.requested, issue.transitioned, ...   │
│  Hooks Listened: prompt.building, github:pr.merged, ...         │
└─────────────────────────────────────────────────────────────────┘
                               │
                               ▼
                      ┌─────────────────┐
                      │  workhorse-core │
                      └─────────────────┘
```

## What It Registers

### Parser

Handles Jira ticket references:

```typescript
// Formats supported:
"PROJ-123"
"https://company.atlassian.net/browse/PROJ-123"
```

Fetches full ticket details including description, comments, status, assignee.

### Monitor: `jira-comments`

Polls tickets for new comments every 30 seconds (configurable):

- Detects comments added after agent started
- Creates notifications for agent inbox
- Filters out bot-generated comments (via metadata footer)

### Tools

| Tool | Description |
|------|-------------|
| `jira_add_comment` | Add comment to ticket |
| `jira_transition_issue` | Change ticket status (In Progress, Done, etc.) |
| `jira_get_comments` | Get recent comments |

### Steering Rules

| Rule | Condition | Reminder |
|------|-----------|----------|
| `jira:update-after-implementation` | Status is "implementing", file changes exist | "Update Jira with your progress" |
| `jira:transition-after-merge` | PR merged, ticket not in QA/Done | "Transition ticket to appropriate status" |
| `jira:address-feedback` | Unread notifications exist | "Check inbox for feedback" |

### Auth

Uses API token authentication with guided setup:

```
1. User visits Atlassian API tokens page
2. Creates token with appropriate permissions
3. Enters token in TUI setup wizard
4. Plugin stores securely via keychain
```

## Hooks

### Emitted

| Hook | Payload | When |
|------|---------|------|
| `jira:transition.requested` | `{ issueId, targetStatus }` | Request to change status |
| `jira:assign.requested` | `{ issueId, accountId }` | Request to assign ticket |
| `jira:issue.transitioned` | `{ issueId, from, to }` | After successful transition |
| `jira:issue.assigned` | `{ issueId, assignee }` | After successful assignment |
| `jira:comment.added` | `{ issueId, comment }` | Comment added to ticket |

### Listened

| Hook | Action |
|------|--------|
| `prompt.building` | Add Jira state context (status, assignee, labels) |
| `issue.status_changed` | Sync internal status → Jira transitions |
| `jira:transition.requested` | Execute transition via Jira API |
| `jira:assign.requested` | Execute assignment via Jira API |
| `github:pr.merged` | Transition to QA, assign to reporter |
| `github:pr.opening` | Add Related Tickets section to PR |

## Request/Consumer Pattern

The plugin uses a decoupled pattern where sync logic emits requests and separate consumers execute them:

```typescript
// Sync layer detects status change
hooks.on("issue.status_changed", ({ issue, to }) => {
  if (issue.source !== "jira") return;

  // Emit request (doesn't execute directly)
  hooks.emit("jira:transition.requested", {
    issueId: issue.externalId,
    targetStatus: mapStatusToJira(to),
  });
});

// Consumer layer handles requests
hooks.on("jira:transition.requested", async (event) => {
  const transitions = await client.getTransitions(event.issueId);
  const target = transitions.find(t => t.to.name === event.targetStatus);
  if (target) {
    await client.transitionIssue(event.issueId, target.id);
    hooks.emit("jira:issue.transitioned", { ... });
  }
});
```

**Why this pattern:**
- Testability — can test sync logic without mocking Jira API
- Extensibility — other plugins could intercept/modify requests
- Auditing — all state changes flow through observable hooks

## Cross-Plugin Integration

### GitHub PR Merge → Jira Transition

```typescript
hooks.on("github:pr.merged", async (event) => {
  if (event.source !== "jira") return;

  const issue = await db.issues.findById(event.issueId);
  const jiraTicket = await client.fetchIssue(issue.externalId);

  // Auto-transition to QA
  const qaTransition = findQATransition(await client.getTransitions(ticketKey));
  if (qaTransition) {
    await client.transitionIssue(ticketKey, qaTransition.id);
  }

  // Assign back to reporter for verification
  if (jiraTicket.fields.reporter) {
    await client.editIssue(ticketKey, {
      assignee: { accountId: jiraTicket.fields.reporter.accountId },
    });
  }
});
```

### Contribute to GitHub PRs

```typescript
hooks.on("github:pr.opening", async (ctx) => {
  const issue = await db.issues.findById(ctx.issueId);
  if (issue.source !== "jira") return;

  const ticket = await client.fetchIssue(issue.externalId);

  ctx.contributions.push({
    section: "Related Tickets",
    content: `
| Ticket | Summary | Status |
|--------|---------|--------|
| [${ticket.key}](${ticketUrl}) | ${ticket.fields.summary} | ${ticket.fields.status.name} |
    `.trim(),
    priority: 10,
  });
});
```

## Configuration

```toml
[plugins.jira]
pollInterval = 30000  # Comment monitor interval (ms)
```

Jira Cloud connection details are stored securely via keychain after setup.

## Usage Examples

### Agent Transitions Ticket

```typescript
// Agent calls tool
await tools.jira_transition_issue({
  status: "In Progress",
});

// Plugin:
// 1. Looks up available transitions
// 2. Finds matching transition
// 3. Executes via Jira API
// 4. Emits jira:issue.transitioned
```

### Comment Notification

```typescript
// Monitor polls and finds new comment
// 1. Filters out bot comments (isWorkhorseGenerated)
// 2. Creates notification: "New comment from @john: ..."
// 3. Next prompt includes notification in inbox
// 4. Steering rule fires if unread notifications exist
```

### Prompt Enrichment

```typescript
hooks.on("prompt.building", async (ctx) => {
  const issue = await db.issues.findById(ctx.issueId);
  if (issue.source !== "jira") return;

  const ticket = await client.fetchIssue(issue.externalId);

  ctx.contextBlocks.push({
    id: "jira-state",
    title: "Jira Ticket",
    content: `
Ticket: ${ticket.key}
Status: ${ticket.fields.status.name}
Assignee: ${ticket.fields.assignee?.displayName || "Unassigned"}
Labels: ${ticket.fields.labels.join(", ") || "None"}
    `.trim(),
    priority: 15,
  });
});
```

## Dependencies on Core

| Import | Usage |
|--------|-------|
| `definePlugin` | Plugin definition |
| `IssueParserOptions` | Parser interface |
| `MonitorOptions` | Monitor interface |
| `OrchestratorTool` | Tool interface |
| `SteeringRuleConfigInput` | Steering rule definition |
| `WorkhorseContext` | Service access |
| `PromptContextBlock` | Prompt enrichment |
| `isWorkhorseGenerated` | Filter bot comments |
| `storeCredential`, `getCredential` | Secure token storage |

## Why This Architecture

1. **Request/consumer decoupling** — Sync logic separate from API calls for testability
2. **Cross-plugin coordination** — GitHub PR events trigger Jira actions automatically
3. **Bidirectional sync** — Internal status ↔ Jira status stay aligned
4. **Notification system** — Comments don't get lost, agents see them in inbox
5. **Steering reminders** — Agents don't forget to update Jira during work
