# Step 10: MCP Server

Agent's interface back to Jiratown via stdio. 3 core tools (source-agnostic). Plugins contribute additional tools via hooks.

Notifications are **push-based** — the agent never polls for them. Pending notifications are bundled into the initial prompt (step 8), and new ones are delivered in real-time via `sendMessage` (step 9). The agent just needs to acknowledge them.

Deps: `@modelcontextprotocol/sdk`

Location: `packages/core/src/mcp-server/`

## Server Factory

```typescript
function createJiratownServer(options: {
  db: Database
  memory: MemoryService
  hooks: Hooks
  issueId: string
}): McpServer
```

## Core Tools

### `jiratown_acknowledge`
Input: `{ notificationIds: string[] }`. Marks notifications acknowledged.

### `jiratown_update_status`
Input: `{ status: IssueStatus, message?: string }`. Updates DB, logs event, emits `issue.status_changed` hook (plugins listen: Jira transitions ticket, GitHub updates labels, etc.).

### `jiratown_escalate`
Input: `{ reason: string, blocking: boolean, question?: string }`. Creates escalation notification (`priority: "blocking"` or `"high"`), emits `notification.created`.

## Plugin-Contributed Tools

Registered via `mcp.tools.registering` hook:

```typescript
ctx.hooks.on("mcp.tools.registering", ({ tools }) => {
  tools.push({
    name: "jiratown_open_pr",
    description: "Create a pull request",
    inputSchema: z.object({ title: z.string(), body: z.string(), baseBranch: z.string().optional() }),
    handler: async (input) => { /* ... */ },
  })
})
```

## CLI Entry Point

```typescript
// mcp-server/cli.ts — accepts --issue-id, --db-path, creates server with stdio transport
```

## Tests

- Creates server with 3 core tools + plugin tools via hook
- `acknowledge`: acknowledges by IDs
- `update_status`: updates DB, logs event, emits hook
- `escalate`: creates notification, emits hook
