# workhorse-plugin-github

GitHub integration plugin for Workhorse. Provides issue parsing, PR monitoring, status sync, tools, steering, and prompt enrichment.

## Installation

```bash
bun add workhorse-plugin-github
```

## Prerequisites

- **`gh` CLI** must be installed and authenticated (`gh auth login`)
- GitHub repositories must be accessible from the authenticated account

## Features

| Feature | Description |
|---------|-------------|
| **Issue Parsing** | Parse `owner/repo#45` and GitHub URLs into Workhorse issues |
| **PR Monitor** | Unified monitor for PR reviews, comments, CI checks, and mergeable state |
| **Prompt Enrichment** | Inject GitHub issue/PR state into agent system prompts |
| **Status Sync** | Sync Workhorse issue status → GitHub PR labels |
| **Tools** | `github_open_pr`, `github_add_comment`, `github_get_pr_status`, `github_get_ci_check`, `github_get_pr_reviews` |
| **Steering** | Idle agent reminders for PR reviews and CI failures |
| **Cross-plugin Sync** | React to Jira status changes (when both plugins are loaded) |

## Configuration

```toml
# ~/.workhorse.toml or .workhorse.toml

[plugins.github]
poll_interval = 30000    # PR monitor poll interval in ms (default: 30000)
```

## Usage

### Register the Plugin

```typescript
import { githubPlugin } from "workhorse-plugin-github";

const wh = await bootstrap({
  plugins: [githubPlugin],
});
```

### Issue Parsing

The plugin registers a parser that handles GitHub references:

```typescript
// These inputs are recognized:
await tracker.parseInput("octocat/hello-world#42");    // owner/repo#number
await tracker.parseInput("https://github.com/octocat/hello-world/issues/42");
await tracker.parseInput("https://github.com/octocat/hello-world/pull/42");

// The parser auto-detects whether it's an issue or PR
```

### PR Monitoring

The unified PR monitor tracks:

| Watch | Description |
|-------|-------------|
| **Reviews** | New reviews and review state changes |
| **Comments** | New issue and review comments |
| **CI Checks** | Check run status and conclusions |
| **Mergeable** | Mergeable state and merge conflicts |
| **Merged/Closed** | PR merge or close events |

Monitors start automatically when an agent spawns on a GitHub issue that has a PR:

```typescript
// Automatic — triggered by agent.create.post hook
// Only starts if the issue has metadata.prNumber
```

### Tools

#### github_open_pr

Create a pull request from the current worktree branch:

```typescript
{
  owner: "octocat",
  repo: "hello-world",
  head: "task/PROJ-123",
  base: "main",
  title: "Add priority field to tasks",
  body: "## Changes\n\n- Added priority column to issues table",
  draft: false
}
```

#### github_add_comment

Add a comment to an issue or PR:

```typescript
{
  owner: "octocat",
  repo: "hello-world",
  number: 42,
  body: "I've addressed the review feedback. Please take another look."
}
```

#### github_get_pr_status

Get a comprehensive PR status summary:

```typescript
{
  owner: "octocat",
  repo: "hello-world",
  number: 42
}

// Returns PRStatusSummary:
// {
//   state: "open",
//   draft: false,
//   mergeable: true,
//   mergeableState: "clean",
//   reviews: { approved: 1, changesRequested: 0, commented: 2, pending: 0 },
//   checks: { total: 3, passing: 3, failing: 0, pending: 0 },
//   additions: 45,
//   deletions: 12,
//   changedFiles: 3
// }
```

#### github_get_ci_check

Get the status of a specific CI check by name:

```typescript
{
  owner: "octocat",
  repo: "hello-world",
  checkName: "build",    // Case-insensitive, supports partial match
  ref: "HEAD"            // Optional: commit SHA, branch, or "HEAD" (default)
}

// Returns CICheckResult:
// {
//   found: true,
//   name: "build",
//   status: "completed",
//   conclusion: "success",
//   url: "https://github.com/octocat/hello-world/runs/123456",
//   startedAt: "2024-01-15T10:00:00Z",
//   completedAt: "2024-01-15T10:05:30Z",
//   durationSeconds: 330
// }

// If check not found, returns available checks:
// {
//   found: false,
//   name: "nonexistent",
//   status: null,
//   conclusion: null,
//   url: null,
//   startedAt: null,
//   completedAt: null,
//   durationSeconds: null,
//   availableChecks: ["build", "test", "lint", "typecheck"]
// }
```

#### github_get_pr_reviews

Get detailed PR reviews including inline code comments:

```typescript
{
  owner: "octocat",
  repo: "hello-world",
  number: 42,
  state: "changes_requested",  // Optional: filter by state (default: "all")
  includeComments: true        // Optional: include inline comments (default: true)
}

// Returns PRReviewsResult:
// {
//   totalReviews: 3,
//   summary: {
//     approved: 1,
//     changesRequested: 1,
//     commented: 1,
//     dismissed: 0,
//     pending: 0
//   },
//   reviews: [
//     {
//       id: 12345,
//       author: "reviewer1",
//       state: "CHANGES_REQUESTED",
//       body: "Please address the following issues:",
//       submittedAt: "2024-01-15T14:30:00Z",
//       comments: [
//         {
//           path: "src/utils.ts",
//           line: 42,
//           diffHunk: "@@ -40,6 +40,8 @@ function processData() {",
//           body: "This should handle the null case"
//         }
//       ]
//     }
//   ]
// }
```

### Prompt Enrichment

The plugin adds context blocks to agent prompts via the `prompt.building` hook:

- **GitHub Issue State** — Title, status, labels, assignee
- **PR State** — Reviews, checks, mergeable status (if PR exists)
- **Workflow Instructions** — Step-by-step guidance for PR workflows

### Status Sync

Workhorse issue status changes are synced to GitHub PR labels:

| Workhorse Status | GitHub Label |
|-----------------|-------------|
| `implementing` | `workhorse:implementing` |
| `in_review` | `workhorse:in-review` |
| `blocked` | `workhorse:blocked` |
| `done` | `workhorse:done` |

### Steering Rules

The plugin registers steering rules for idle agents:

1. **PR Review Reminder** — When agent is idle and has unread GitHub review notifications
2. **CI Failure Reminder** — When agent is idle and CI checks are failing

## Types

### GitHubRef

```typescript
interface GitHubRef {
  owner: string;
  repo: string;
  number: number;
  type: "issue" | "pull";
}
```

### GitHubIssue

```typescript
interface GitHubIssue {
  owner: string;
  repo: string;
  number: number;
  title: string;
  body: string | null;
  state: "open" | "closed";
  html_url: string;
  assignee: { login: string } | null;
  labels: Array<{ name: string }>;
  pull_request?: { url: string };
  created_at: string;
  updated_at: string;
}
```

### GitHubPR

```typescript
interface GitHubPR extends GitHubIssue {
  head: { ref: string; sha: string };
  base: { ref: string };
  mergeable: boolean | null;
  mergeable_state: string;
  merged: boolean;
  merged_at: string | null;
  draft: boolean;
  additions: number;
  deletions: number;
  changed_files: number;
}
```

### PRStatusSummary

```typescript
interface PRStatusSummary {
  state: "open" | "closed" | "merged";
  draft: boolean;
  mergeable: boolean | null;
  mergeableState: string;
  reviews: {
    approved: number;
    changesRequested: number;
    commented: number;
    pending: number;
  };
  checks: {
    total: number;
    passing: number;
    failing: number;
    pending: number;
  };
  additions: number;
  deletions: number;
  changedFiles: number;
}
```

## Files

| File | Purpose |
|------|---------|
| `index.ts` | Plugin definition and setup |
| `client.ts` | GitHubClient — `gh` CLI wrapper for API access |
| `gh-cli.ts` | Low-level `gh` command execution helpers |
| `parser.ts` | GitHub reference parsing (owner/repo#num, URLs) |
| `mapper.ts` | GitHubIssue/PR → Workhorse issue mapping |
| `monitor.ts` | PR monitor factory (creates MonitorOptions) |
| `monitor-notifications.ts` | PR notification detection (new reviews, comments) |
| `monitor-checks.ts` | CI check state tracking |
| `prompt.ts` | Prompt enrichment via `prompt.building` hook |
| `sync.ts` | Status sync (Workhorse → GitHub labels) |
| `steering.ts` | Steering rules for PR reviews and CI failures |
| `tools/index.ts` | Tool registration factory |
| `tools/open-pr.ts` | `github_open_pr` tool implementation |
| `tools/add-comment.ts` | `github_add_comment` tool implementation |
| `tools/get-pr-status.ts` | `github_get_pr_status` tool implementation |
| `tools/get-ci-check.ts` | `github_get_ci_check` tool implementation |
| `tools/get-pr-reviews.ts` | `github_get_pr_reviews` tool implementation |
| `tools/types.ts` | Tool-specific types |
| `renderer.ts` | TUI activity renderer |
| `hooks.ts` | Plugin-specific hook type definitions |
| `types.ts` | Domain types (GitHubIssue, GitHubPR, etc.) |

## License

MIT
