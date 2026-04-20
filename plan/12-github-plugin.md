# Step 12: GitHub Plugin

All GitHub functionality in a self-contained plugin. Contributes `jiratown_open_pr` tool. GitHub issue parsing is a **new capability**.

External deps: `gh` CLI, `mcp-remote` (GitHub MCP OAuth)

Location: `packages/plugins/github/`

## What It Registers

| Hook Point | Registration |
|------------|-------------|
| IssueProvider | Parser for `owner/repo#45`, GitHub issue URLs |
| MCP Server | `jiratown_open_pr` tool via `mcp.tools.registering` |
| MonitorService | PR review poller + PR comment poller |
| Prompt Engineer | PR state context block + workflow instructions |
| AgentAdapter | GitHub MCP server config |

## Plugin Config

```toml
[plugins.github]
auto_poll_reviews = true
review_poll_interval = 30000
comment_poll_interval = 30000
```

## Components

### Issue Parser (NEW)

Matches `owner/repo#45`, GitHub issue URLs. Fetches via `gh api`, maps to `ParsedIssue`.

### `jiratown_open_pr` Tool

Registered via `mcp.tools.registering` hook. Flow:
1. Look up issue for worktree/branch
2. `gh pr create` from worktree
3. Parse PR URL → `owner/repo/number`
4. Update issue in DB (`pr_url`, `pr_number`, status → `pr_created`)
5. Emit `issue.status_changed`
6. Start PR monitors if `auto_poll_reviews` enabled

### PR Review Poller

`"github-reviews"` monitor. Polls via `gh api`. `CHANGES_REQUESTED` → `priority: "high"`, others → `"normal"`.

### PR Comment Poller

`"github-comments"` monitor. Merges review comments + issue comments. Creates notifications with `path`/`line` metadata.

### API Fetchers (all via `gh api`)

```typescript
async function fetchPRContext(owner, repo, prNumber): Promise<PRContext>
async function fetchGitHubReviews(owner, repo, prNumber): Promise<GitHubReview[]>
async function fetchGitHubComments(owner, repo, prNumber): Promise<GitHubComment[]>
async function fetchGitHubIssue(owner, repo, number): Promise<GitHubIssueData>
```

### Prompt Enrichment

Hooks `prompt.building`. Pushes two context blocks:
- **PR State** (priority 10): number, title, state, review decision, mergeable, change stats, CI checks, reviews, recent comments
- **PR Workflow** (priority 50): use `jiratown_open_pr` not `gh pr create`, check notifications for feedback

### MCP Server Config

Hooks `mcp.config.building`. Adds GitHub MCP server entry (`https://mcp.github.com/mcp`).

### Mapper

`mapGitHubToIssue(gh: GitHubIssueData): ParsedIssue` — maps GitHub fields to generic issue. `externalId` format: `owner/repo#number`.

## Domain Types (colocated)

`GitHubIssueData`, `GitHubReview`, `GitHubComment`, `PRContext`, `PRReview`, `PRComment`.

## Auth

Two paths:
1. **GitHub MCP** — OAuth via `mcp-remote`, cached in `~/.mcp-remote/`
2. **`gh` CLI** — requires `gh auth login` separately, verified at plugin setup

## Tests

- Parser: matches `owner/repo#45` and URLs, rejects non-GitHub, maps correctly
- `open_pr`: runs `gh pr create` (mocked), updates DB, emits hooks, starts monitors
- Review poller: detects reviews, `CHANGES_REQUESTED` high priority, deduplicates
- Comment poller: merges comment types, includes file/line metadata
- API: `fetchPRContext` returns full state (mocked `gh`)
- Mapper: maps fields, maps labels → issueType
- Prompt: enriches with PR state, includes workflow instructions
