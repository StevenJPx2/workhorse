# workhorse-plugin-github

GitHub integration for Workhorse — enables agents to create PRs, monitor reviews/CI, and respond to feedback.

## What This Plugin Does

This plugin connects Workhorse to GitHub, providing:

- **Issue parsing** from `owner/repo#45` format and GitHub URLs
- **PR lifecycle management** — create, monitor, respond to reviews
- **CI/checks monitoring** — track status and notify agents of failures
- **Status label sync** — keep PR labels in sync with internal issue status
- **Steering rules** — guide agents to create PRs, fix CI, address reviews

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     GitHub Plugin                                │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
│  │   Parser    │  │   Monitor   │  │         Tools           │  │
│  │ owner/repo# │  │  PR status  │  │ open_pr, add_comment,   │  │
│  │   URLs      │  │  reviews,CI │  │ get_pr_status/reviews   │  │
│  └──────┬──────┘  └──────┬──────┘  └───────────┬─────────────┘  │
│         │                │                     │                 │
│         ▼                ▼                     ▼                 │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                     Steering Rules                         │  │
│  │  create-pr │ fix-ci │ address-review │ missing-pr          │  │
│  └───────────────────────────────────────────────────────────┘  │
├─────────────────────────────────────────────────────────────────┤
│                         Hooks                                    │
│  Emits: pr.opening, pr.created, pr.merged, checks.*, review.*   │
│  Listens: agent.create.post, prompt.building, issue.status_*   │
└─────────────────────────────────────────────────────────────────┘
                               │
                               ▼
                      ┌─────────────────┐
                      │  workhorse-core │
                      │ tracker, hooks, │
                      │ orchestrator,   │
                      │ monitors        │
                      └─────────────────┘
```

## What It Registers

### Parser

Handles GitHub issue references:

```typescript
// Formats supported:
"owner/repo#45"
"https://github.com/owner/repo/issues/45"
"https://github.com/owner/repo/pull/45"
```

### Monitor: `github-pr`

Polls PRs for changes every 30 seconds (configurable):

- Review status (approved, changes requested, pending)
- CI check results (success, failure, pending)
- Mergeable state
- New comments

Auto-starts when agent spawns for an issue with `prNumber` in metadata.

### Tools

| Tool | Description |
|------|-------------|
| `github_open_pr` | Create PR from current branch |
| `github_add_comment` | Add comment to issue/PR |
| `github_get_pr_status` | Get review/CI/mergeable summary |
| `github_get_ci_check` | Detailed CI check status |
| `github_get_pr_reviews` | Detailed review info with inline comments |

### Steering Rules

| Rule | Condition | Reminder |
|------|-----------|----------|
| `github:create-pr` | Has file changes, no PR | "Create a PR with your changes" |
| `github:fix-ci` | CI checks failing | "CI is failing, investigate and fix" |
| `github:address-review` | Changes requested | "Address review feedback" |
| `github:missing-pr` | Status past implementation, no PR | "You should have a PR by now" |

### Auth

Uses `external` auth type — delegates to `gh` CLI:

```bash
gh auth login  # User authenticates separately
```

The plugin calls `gh` commands under the hood.

## Hooks

### Emitted

| Hook | Payload | When |
|------|---------|------|
| `github:pr.opening` | `{ issueId, title, body, contributions: [] }` | Before PR creation (collect sections) |
| `github:pr.created` | `{ issueId, prNumber, url }` | After PR created |
| `github:pr.merged` | `{ issueId, prNumber, source }` | PR merged |
| `github:pr.closed` | `{ issueId, prNumber }` | PR closed without merge |
| `github:review.submitted` | `{ issueId, review }` | Review submitted |
| `github:checks.passed` | `{ issueId, prNumber }` | All CI checks pass |
| `github:checks.failed` | `{ issueId, prNumber, failures }` | CI checks fail |

### Listened

| Hook | Action |
|------|--------|
| `agent.create.post` | Start PR monitor if issue has `prNumber` |
| `prompt.building` | Add GitHub/PR context blocks |
| `issue.status_changed` | Sync labels to PR |

## Cross-Plugin Integration

### PR Contribution Pattern

Other plugins can contribute sections to PRs:

```typescript
// GitHub emits opening event with mutable contributions array
hooks.emit("github:pr.opening", {
  issueId,
  title: "feat: implement login",
  body: "Initial PR body",
  contributions: [],  // Other plugins push to this
});

// Jira plugin adds Related Tickets
hooks.on("github:pr.opening", (ctx) => {
  ctx.contributions.push({
    section: "Related Tickets",
    content: "| Ticket | Summary |\n| PROJ-123 | Login feature |",
    priority: 10,
  });
});

// Playwright plugin adds Screenshots
hooks.on("github:pr.opening", (ctx) => {
  ctx.contributions.push({
    section: "Screenshots",
    content: "![Login](./screenshots/login.png)",
    priority: 80,
  });
});
```

### PR Merge Triggers

Jira plugin listens for merges to auto-transition tickets:

```typescript
// GitHub emits
hooks.emit("github:pr.merged", { issueId, prNumber, source: "jira" });

// Jira plugin responds
hooks.on("github:pr.merged", async (event) => {
  if (event.source !== "jira") return;
  await transitionToQA(event.issueId);
});
```

## Configuration

```toml
[plugins.github]
pollInterval = 30000  # PR monitor interval (ms)
```

## Usage Examples

### Agent Creates PR

```typescript
// Agent calls tool
await tools.github_open_pr({
  title: "feat: implement user authentication",
  body: "Implements login flow with OAuth support",
  base: "main",
});

// Plugin:
// 1. Emits github:pr.opening (collects contributions)
// 2. Creates PR via gh CLI
// 3. Emits github:pr.created
// 4. Starts github-pr monitor
```

### Monitor Detects Review

```typescript
// Monitor polls and finds new review
// 1. Creates notification via MemoryService
// 2. Emits github:review.submitted
// 3. Next prompt.building includes review context
// 4. Steering rule fires if changes requested
```

### Prompt Enrichment

```typescript
hooks.on("prompt.building", (ctx) => {
  const pr = getPRForIssue(ctx.issueId);
  if (!pr) return;

  ctx.contextBlocks.push({
    id: "github-pr",
    title: "Pull Request Status",
    content: `
PR #${pr.number}: ${pr.title}
Reviews: ${pr.reviews.length} (${pr.approvals} approvals)
CI: ${pr.checksStatus}
Mergeable: ${pr.mergeable}
    `.trim(),
    priority: 20,
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

## Why This Architecture

1. **Decoupled tools** — Each tool is self-contained, agents can use them independently
2. **Event-driven monitoring** — Changes detected via polling → notifications → agent sees in next prompt
3. **Cross-plugin hooks** — Other plugins (Jira, Playwright) can contribute without coupling
4. **Steering guidance** — Agents don't forget to create PRs or address reviews
5. **Status sync** — Internal issue status reflected in PR labels for visibility
