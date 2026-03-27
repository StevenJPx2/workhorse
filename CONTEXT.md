# Context for AI Agents

This document provides context for AI coding agents working on Jiratown.

## What is Jiratown?

Jiratown is a terminal UI dashboard that orchestrates multiple AI coding agents (OpenCode, Claude Code) working on Jira tickets simultaneously. It's powered by Gas Town for multi-agent coordination.

## Key External Dependencies

### Gas Town (https://github.com/steveyegge/gastown)
- Multi-agent workspace manager
- CLI: `gt`
- Key commands used:
  - `gt sling <bead-id> <rig>` - Spawn a polecat (agent) to work on a bead
  - `gt agents --json` - List active agents
  - `gt feed --json` - Stream real-time agent events
  - `gt escalate` - Post blocking questions
  - `gt done` - Signal work completion
- OpenCode is a built-in agent preset (`--agent opencode`)
- Claude Code is also supported (`--agent claude`)

### Beads (https://github.com/steveyegge/beads)
- Git-backed issue tracker for agents
- CLI: `bd`
- Key commands used:
  - `bd create "Title" --labels jira:AM-123` - Create a work item
  - `bd update <id> --claim` - Claim a task
  - `bd show <id>` - Get task details

### OpenTUI (https://github.com/anomalyco/opentui)
- Native terminal UI library (Zig core with TypeScript bindings)
- We use `@opentui/solid` for Solid.js bindings
- Docs: https://opentui.com/docs/getting-started
- Key components: `<box>`, `<text>`, `<input>`, `<select>`, `<scrollbox>`
- Key hooks: `useKeyboard`, `useRenderer`, `onResize`

### Atlassian MCP
- MCP server for Jira API access
- We manage the MCP server subprocess ourselves
- Use `@modelcontextprotocol/sdk` for the client
- Key tools: `getJiraIssue`, `addCommentToJiraIssue`, `transitionJiraIssue`

## Architecture Decisions

1. **Solid.js over React**: OpenCode uses Solid.js, so we follow suit for consistency
2. **SQLite for state**: Single database at `~/.jiratown/jiratown.db` tracks all tickets
3. **TOML for config**: User-friendly format at `~/.jiratown/config.toml`
4. **MCP client managed internally**: Jiratown starts/stops the Atlassian MCP server
5. **Context-aware**: When run from a repo, only shows that repo's tickets
6. **Non-blocking notifications**: User decides when to act on blocked agents

## File Structure Reference

```
src/
├── index.ts          # CLI entry (commander)
├── main.tsx          # TUI entry (render())
├── commands/         # CLI commands (setup, add, dashboard)
├── app/              # Root components and state
├── components/       # UI components
├── hooks/            # Solid.js hooks for external integrations
├── lib/              # Core logic (db, config, MCP client, etc.)
└── types/            # TypeScript types
```

## Implementation Notes

### MCP Client Pattern
```typescript
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js"

const transport = new StdioClientTransport({
  command: "npx",
  args: ["-y", "@anthropic/mcp-atlassian"],
})
const client = new Client({ name: "jiratown", version: "1.0.0" })
await client.connect(transport)
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

### Gas Town Event Streaming
```typescript
const feed = Bun.spawn(["gt", "feed", "--json", "--rig", rigName])
const reader = feed.stdout.getReader()

while (true) {
  const { done, value } = await reader.read()
  if (done) break
  const event = JSON.parse(new TextDecoder().decode(value))
  // Handle event
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
