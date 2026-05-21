# Step 12: GitHub Plugin

All GitHub functionality in a self-contained plugin. Provides GitHub issue parsing and the `workhorse_open_pr` tool. PR monitoring and status sync.

**External deps:** `gh` CLI (authenticated via `gh auth login`)

**Location:** `packages/plugins/github/` (standalone package: `workhorse-plugin-github`)

## What It Registers

| Hook Point      | Registration                                                         |
| --------------- | -------------------------------------------------------------------- |
| IssueParser     | Parser for `owner/repo#45`, GitHub issue URLs                        |
| MonitorService  | Unified PR monitor (reviews, comments, checks, mergeable state)      |
| Prompt Engineer | PR state context block + workflow instructions via `prompt.building` |
| Tools           | `github_open_pr`, `github_add_comment`, `github_get_pr_status`       |
| Hooks           | `issue.status_changed` → update PR labels/status                     |

## Plugin Config

```toml
[plugins.github]
poll_interval = 30000
```

## Components

### GitHubClient (class)

Wrapper around `gh` CLI for GitHub API access. All operations use `gh api` for consistency.

```typescript
class GitHubClient {
  constructor();
  async connect(): Promise<void>; // Verifies gh auth status
  async disconnect(): Promise<void>;
  async fetchIssue(
    owner: string,
    repo: string,
    number: number,
  ): Promise<GitHubIssue>;
  async fetchPR(owner: string, repo: string, number: number): Promise<GitHubPR>;
  async createPR(
    opts: CreatePROptions,
  ): Promise<{ url: string; number: number }>;
  async addComment(
    owner: string,
    repo: string,
    number: number,
    body: string,
  ): Promise<void>;
  async getPRReviews(
    owner: string,
    repo: string,
    number: number,
  ): Promise<GitHubReview[]>;
  async getPRComments(
    owner: string,
    repo: string,
    number: number,
  ): Promise<GitHubComment[]>;
  async getCheckRuns(
    owner: string,
    repo: string,
    ref: string,
  ): Promise<GitHubCheckRun[]>;
}
```

Uses `Bun.spawn(["gh", "api", ...])` for all API calls. No separate OAuth flow needed — relies on existing `gh auth login`.

### Parser

Matches:

- Short form: `owner/repo#45`
- Issue URLs: `https://github.com/owner/repo/issues/45`
- PR URLs: `https://github.com/owner/repo/pull/45`

```typescript
// parser.ts
const GITHUB_SHORT_REGEX = /^([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)#(\d+)$/;
const GITHUB_URL_REGEX = /https:\/\/github\.com\/([^/]+)\/([^/]+)\/(issues|pull)\/(\d+)/;

export function canParseGitHub(input: string): boolean { ... }
export function createGitHubParserOptions(client: GitHubClient): IssueParserOptions { ... }
```

### Mapper

`mapGitHubToIssue(gh: GitHubIssue): ParsedIssue` — maps GitHub fields to generic issue.

```typescript
// mapper.ts
export function mapGitHubToIssue(gh: GitHubIssue): ParsedIssue {
  return {
    externalId: `${gh.owner}/${gh.repo}#${gh.number}`,
    source: "github",
    title: gh.title,
    description: gh.body ?? "",
    issueType: inferIssueType(gh.labels), // bug, feature, task based on labels
    url: gh.html_url,
    assignee: gh.assignee?.login,
    labels: gh.labels.map((l) => l.name),
    metadata: {
      owner: gh.owner,
      repo: gh.repo,
      number: gh.number,
      state: gh.state,
      isPR: gh.pull_request !== undefined,
    },
  };
}
```

### Tools

```typescript
// tools.ts
export function createGitHubTools(client: GitHubClient): OrchestratorTool[];
```

**`github_open_pr`** — Create a PR from the current worktree:

1. Get issue from DB by issueId in context
2. Run `gh pr create` from worktree directory
3. Parse PR URL from output → `owner/repo/number`
4. Update issue in DB: `prUrl`, `prNumber`, status → `pr_created`
5. Emit `issue.status_changed` hook
6. Start PR monitor for this issue
7. Return success with PR URL

**`github_add_comment`** — Add a comment to an issue/PR:

- `owner`, `repo`, `number`, `body`

**`github_get_pr_status`** — Get PR status (reviews, checks, mergeable):

- `owner`, `repo`, `number`
- Returns: review state, CI status, mergeable state

### PR Monitor

Monitor ID: `"github-pr"`

Single unified monitor that polls for all PR activity: reviews, comments, and CI check status changes. Creates notifications with appropriate priorities.

```typescript
// monitor.ts
export function createGitHubPRMonitor(
  client: GitHubClient,
  interval: number,
  db: Database,
): MonitorOptions;
```

**Polls for:**

1. **Reviews** — New reviews on the PR
   - `CHANGES_REQUESTED` → `priority: "high"`
   - `APPROVED` → `priority: "normal"`
   - `COMMENTED`, `DISMISSED` → `priority: "low"`

2. **Comments** — Both review comments and issue comments
   - Review comments include `path`, `line`, `diff_hunk` metadata
   - Issue comments are general discussion
   - All comments → `priority: "normal"`

3. **Check Status Changes** — CI/CD status transitions
   - Any check fails → `priority: "high"` (includes check name, conclusion, details URL)
   - All checks pass (was failing) → `priority: "normal"` (celebration!)
   - Check starts running → `priority: "low"`

4. **Mergeable State Changes** — PR becomes unmergeable
   - Merge conflicts detected → `priority: "high"`
   - Base branch updated (needs rebase) → `priority: "normal"`

**Tracking state in metadata:**

```typescript
interface GitHubPRMonitorState {
  lastSeenReviewIds: string[];
  lastSeenCommentIds: string[];
  lastCheckConclusions: Record<string, string>; // checkName -> conclusion
  lastMergeableState: string;
}
```

Started on `orchestrator.spawn.post` for issues that have a PR.

### Prompt Enrichment

Hooks `prompt.building`. Pushes two context blocks for issues with PRs:

**PR State (priority 10):**

```markdown
**PR:** #123 - Fix the thing
**State:** open
**Reviews:** 1 approved, 1 changes requested
**Mergeable:** true
**CI Status:** passing (3/3 checks)
**+45 -12** across 5 files
```

**GitHub Workflow (priority 50):**

```markdown
You have access to GitHub tools:

- `github_open_pr(title, body, base)` — Create a PR for this branch
- `github_add_comment(owner, repo, number, body)` — Add a comment
- `github_get_pr_status(owner, repo, number)` — Check PR status

Check notifications for review feedback.
```

### Status Sync

Hooks `issue.status_changed`. For GitHub issues with PRs:

- `done` → Could close PR or add label (configurable)
- `blocked` → Add "blocked" label to PR

```typescript
// sync.ts
export function registerStatusSync(
  ctx: WorkhorseContext,
  client: GitHubClient,
): void;
```

## Domain Types (colocated)

```typescript
// types.ts

/** GitHub issue from API */
export interface GitHubIssue {
  owner: string;
  repo: string;
  number: number;
  title: string;
  body: string | null;
  state: "open" | "closed";
  html_url: string;
  assignee: { login: string } | null;
  labels: Array<{ name: string }>;
  pull_request?: { url: string }; // Present if this is a PR
  created_at: string;
  updated_at: string;
}

/** GitHub PR from API */
export interface GitHubPR extends GitHubIssue {
  head: { ref: string; sha: string };
  base: { ref: string };
  mergeable: boolean | null;
  mergeable_state: string;
  merged: boolean;
  draft: boolean;
}

/** GitHub PR review */
export interface GitHubReview {
  id: number;
  user: { login: string };
  state:
    | "APPROVED"
    | "CHANGES_REQUESTED"
    | "COMMENTED"
    | "DISMISSED"
    | "PENDING";
  body: string;
  submitted_at: string;
}

/** GitHub comment (issue or review) */
export interface GitHubComment {
  id: number;
  user: { login: string };
  body: string;
  created_at: string;
  // Review comment specific
  path?: string;
  line?: number;
  diff_hunk?: string;
}

/** Options for creating a PR */
export interface CreatePROptions {
  owner: string;
  repo: string;
  head: string; // Branch name
  base: string; // Target branch
  title: string;
  body?: string;
  draft?: boolean;
}

/** GitHub check run (CI/CD status) */
export interface GitHubCheckRun {
  id: number;
  name: string;
  status: "queued" | "in_progress" | "completed";
  conclusion:
    | "success"
    | "failure"
    | "neutral"
    | "cancelled"
    | "skipped"
    | "timed_out"
    | "action_required"
    | null;
  html_url: string;
  started_at: string | null;
  completed_at: string | null;
}
```

## Auth

Uses `gh` CLI auth exclusively. On plugin setup:

1. Run `gh auth status` to verify authentication
2. If not authenticated, throw with instructions to run `gh auth login`

No separate OAuth flow needed — delegates to gh CLI.

## Plugin Entry Point

```typescript
// index.ts
import { definePlugin } from "workhorse-core";
import { z } from "zod/v4";

import { GitHubClient } from "./client.ts";
import { createGitHubPRMonitor } from "./monitor.ts";
import { createGitHubParserOptions } from "./parser.ts";
import { registerPromptHooks } from "./prompt.ts";
import { registerStatusSync } from "./sync.ts";
import { createGitHubTools } from "./tools.ts";

export const GitHubConfigSchema = z.object({
  pollInterval: z.number().int().positive().default(30_000),
});

export type GitHubConfig = z.infer<typeof GitHubConfigSchema>;

export const githubPlugin = definePlugin({
  manifest: {
    name: "github",
    version: "1.0.0",
    description: "GitHub integration for Workhorse",
    capabilities: {
      parsers: ["github"],
      monitors: ["github-pr"],
      tools: ["github_open_pr", "github_add_comment", "github_get_pr_status"],
    },
  },
  configSchema: GitHubConfigSchema,
  setup(ctx, config) {
    const client = new GitHubClient();

    // Register issue parser for GitHub refs and URLs
    ctx.tracker.registerParser({
      ...createGitHubParserOptions(client),
      memory: ctx.memory,
      config: ctx.config,
    });

    // Register unified PR monitor (reviews, comments, checks, mergeable)
    ctx.monitors.registerMonitor(
      createGitHubPRMonitor(client, config.pollInterval, ctx.db),
    );

    // Start monitor when agent spawns on a GitHub issue with PR
    ctx.hooks.on("orchestrator.spawn.post", ({ adapter }) => {
      const issue = ctx.db.issues.getByExternalId(adapter.issueId, "github");
      if (issue?.prNumber) {
        ctx.monitors.startMonitor("github-pr", issue.id);
      }
    });

    // Register prompt enrichment
    registerPromptHooks(ctx, client);

    // Register status sync
    registerStatusSync(ctx, client);

    // Register GitHub tools with orchestrator
    for (const tool of createGitHubTools(
      client,
      ctx.db,
      ctx.hooks,
      ctx.monitors,
    )) {
      ctx.orchestrator.registerTool(tool);
    }
  },
});
```

## File Structure

```
packages/plugins/github/
├── package.json
├── src/
│   ├── index.ts          # Plugin definition, exports
│   ├── client.ts         # GitHubClient (gh CLI wrapper)
│   ├── parser.ts         # Issue parser (canParse, parse)
│   ├── mapper.ts         # mapGitHubToIssue
│   ├── monitor.ts        # Review + comment pollers
│   ├── prompt.ts         # Prompt enrichment hooks
│   ├── sync.ts           # Status sync hooks
│   ├── tools.ts          # github_open_pr, github_add_comment, github_get_pr_status
│   ├── types.ts          # Domain types
│   └── __tests__/
│       ├── client.test.ts
│       ├── parser.test.ts
│       ├── mapper.test.ts
│       ├── monitor.test.ts
│       ├── tools.test.ts
│       └── index.test.ts
└── README.md
```

## Tests

- **Parser:** matches `owner/repo#45`, issue URLs, PR URLs; rejects non-GitHub; maps correctly
- **Mapper:** maps fields, infers issueType from labels, handles null body/assignee
- **Client:** verifies auth, fetches issues/PRs, fetches checks (mocked `gh api`)
- **Tools:**
  - `open_pr`: runs `gh pr create` (mocked), updates DB, emits hooks, starts monitor
  - `add_comment`: calls API with correct args
  - `get_pr_status`: returns review summary, check status, mergeable state
- **PR Monitor:**
  - Detects new reviews, maps to priorities (high for CHANGES_REQUESTED)
  - Detects new comments (issue + review), includes file/line metadata
  - Detects check failures → high priority notification
  - Detects all checks passing (was failing) → normal priority
  - Detects merge conflicts → high priority
  - Deduplicates across polls using state tracking
- **Prompt:** enriches with PR state for GitHub issues, includes workflow instructions
- **Sync:** updates PR labels on status change, ignores non-GitHub issues
