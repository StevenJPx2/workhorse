# Context for AI Agents

This document provides context for AI coding agents working on Jiratown.

## What is Jiratown?

Jiratown is a terminal UI dashboard that orchestrates multiple AI coding agents (OpenCode, Claude Code) working on Jira tickets simultaneously.

## Key External Dependencies

### OpenTUI (https://github.com/anomalyco/opentui)
- Native terminal UI library (Zig core with TypeScript bindings)
- We use `@opentui/solid` for Solid.js bindings
- Docs: https://opentui.com/docs/getting-started
- Key components: `<box>`, `<text>`, `<input>`, `<select>`, `<scrollbox>`
- Key hooks: `useKeyboard`, `useRenderer`, `onResize`

### Atlassian MCP (https://github.com/atlassian/atlassian-mcp-server)
- Official **remote** MCP server for Jira/Confluence API access
- Endpoint: `https://mcp.atlassian.com/v1/mcp`
- Uses OAuth 2.1 or API tokens for authentication
- For local clients, use `mcp-remote` as a proxy
- Key tools: `getJiraIssue`, `addCommentToJiraIssue`, `transitionJiraIssue`

### GitHub MCP (https://github.com/github/github-mcp-server)
- Official **remote** MCP server for GitHub API access
- Endpoint: `https://api.githubcopilot.com/mcp/`
- Uses OAuth for authentication
- Used for PR review workflow (IN_REVIEW state)
- Key tools: `get_pull_request`, `list_pull_requests`, `create_pull_request_review`

## Architecture Decisions

1. **Solid.js over React**: OpenCode uses Solid.js, so we follow suit for consistency
2. **SQLite for state**: Single database at `~/.jiratown/jiratown.db` tracks all tickets
3. **TOML for config**: User-friendly format at `~/.jiratown/config.toml`
4. **MCP client managed internally**: Jiratown starts/stops the Atlassian MCP server
5. **Rig = Git remote URL**: Rig is auto-detected from `git remote get-url origin`, no manual config needed
6. **Context-aware**: When run from a repo, only shows that repo's tickets (filtered by rig)
7. **Non-blocking notifications**: User decides when to act on blocked agents
8. **citty + @clack/prompts**: CLI framework (citty) with beautiful interactive prompts (@clack/prompts) for setup

## File Structure Reference

```
src/
├── index.ts          # CLI entry (citty)
├── commands/         # CLI commands (setup, add, dashboard)
├── app/              # Root components and state
├── components/       # UI components
├── hooks/            # Solid.js hooks for external integrations
├── lib/              # Core logic (db, config, detect-rig, MCP client, etc.)
└── types/            # TypeScript types
```

## Implementation Notes

### MCP Client Pattern

We use **remote MCP servers** exclusively. Both Atlassian and GitHub provide hosted MCP servers.
For local clients, use `mcp-remote` as a proxy to connect to remote servers.

```typescript
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js"

// Atlassian MCP (remote)
const atlassianTransport = new StdioClientTransport({
  command: "npx",
  args: ["-y", "mcp-remote", "https://mcp.atlassian.com/v1/mcp"],
})

// GitHub MCP (remote)
const githubTransport = new StdioClientTransport({
  command: "npx",
  args: ["-y", "mcp-remote", "https://api.githubcopilot.com/mcp/"],
})

const client = new Client({ name: "jiratown", version: "1.0.0" })
await client.connect(atlassianTransport)
```

### Solid.js + OpenTUI Pattern
```tsx
import { render, useKeyboard } from "@opentui/solid"
import { createSignal } from "solid-js"

const App = () => {
  const [count, setCount] = createSignal(0)
  
  useKeyboard((key) => {
    if (key.name === "q") process.exit(0)
  })
  
  return (
    <box border padding={1}>
      <text>Count: {count()}</text>
    </box>
  )
}

render(App)
```

### Rig Detection from Git Remote
```typescript
// Detect rig from current directory's git remote
async function detectRig(): Promise<string | null> {
  // Get git root
  const gitRoot = await $`git rev-parse --show-toplevel`.text().catch(() => null)
  if (!gitRoot) return null
  
  // Get remote URL (prefer origin)
  const remoteUrl = await $`git remote get-url origin`.text().catch(() => null)
  if (!remoteUrl) return null
  
  // Normalize URL to consistent format
  // "git@github.com:user/repo.git" → "github.com/user/repo"
  // "https://github.com/user/repo.git" → "github.com/user/repo"
  return normalizeGitRemote(remoteUrl.trim())
}

function normalizeGitRemote(url: string): string {
  return url
    .replace(/^git@/, "")
    .replace(/^https?:\/\//, "")
    .replace(/:/, "/")
    .replace(/\.git$/, "")
}
```

## Related Files in dotfiles Repo

The original Jira workflow (before Jiratown) lives in the dotfiles repo:
- `configs/opencode/plugins/jira-workflow.ts` - Session state preservation plugin
- `configs/opencode/tools/jira_start-ticket.ts` - Worktree creation tool
- `configs/opencode/tools/jira_escalate.ts` - Escalation comment formatter
- `configs/opencode/tools/jira_check-response.ts` - Comment polling helper
- `configs/opencode/commands/work-ticket.md` - Full workflow command
- `configs/opencode/commands/watch-ticket.md` - Polling subtask

These can be referenced for Jira integration patterns, but Jiratown replaces this workflow with a dedicated TUI.

## Jira Cloud ID

The user's Jira instance is `adeptmind.atlassian.net` - this will be configured during setup.
