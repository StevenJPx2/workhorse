# Step 10: MCP (MERGED INTO STEP 9)

> **Status: Superseded.** The functionality described here is now handled by the `OrchestratorTool` + `Adapter` pattern implemented in step 9 (`plan/09-harness.md`).
>
> Each adapter plugin (e.g., Pi, Claude Code, Opencode) translates `OrchestratorTool[]` into its harness-native tool format. For Pi, that means `ExtensionAPI.registerTool()`. For Claude Code, a future adapter would generate `.mcp.json`. For Opencode, it would generate its JS/TS plugin modules.
>
> **Core tools** (`workhorse_acknowledge`, `workhorse_update_status`, `workhorse_escalate`) live in `packages/core/src/plugins/builtin/tools/definitions.ts`.
>
> See `plan/PROGRESS.md` for the updated status.

---

# Step 10: MCP

Agent's interface back to Workhorse via stdio. 3 core tools (source-agnostic). Plugins contribute additional tools via hooks. Lives inside `workflow/harness/` because it's a harness-specific concern — each harness type configures and launches the MCP server as part of its provisioning.

Notifications are **push-based** — the agent never polls for them. Pending notifications are bundled into the initial prompt (step 8), and new ones are delivered in real-time via `sendMessage` (step 9). The agent just needs to acknowledge them.

Deps: `@modelcontextprotocol/sdk`

Location: `packages/core/src/workflow/harness/mcp/`

## Server Factory

```typescript
function createWorkhorseServer(options: {
  db: Database
  memory: MemoryService
  hooks: Hooks
  issueId: string
}): McpServer
```

## Core Tools

### `workhorse_acknowledge`
Input: `{ notificationIds: string[] }`. Marks notifications acknowledged.

### `workhorse_update_status`
Input: `{ status: IssueStatus, message?: string }`. Updates DB, logs event, emits `issue.status_changed` hook (plugins listen: Jira transitions ticket, GitHub updates labels, etc.).

### `workhorse_escalate`
Input: `{ reason: string, blocking: boolean, question?: string }`. Creates escalation notification (`priority: "blocking"` or `"high"`), emits `notification.created`.

## Plugin-Contributed Tools

Registered via `mcp.tools.registering` hook:

```typescript
ctx.hooks.on("mcp.tools.registering", ({ tools }) => {
  tools.push({
    name: "workhorse_open_pr",
    description: "Create a pull request",
    inputSchema: z.object({ title: z.string(), body: z.string(), baseBranch: z.string().optional() }),
    handler: async (input) => { /* ... */ },
  })
})
```

## CLI Entry Point

```typescript
// workflow/harness/mcp/cli.ts — accepts --issue-id, --db-path, creates server with stdio transport
```

## Tests

- Creates server with 3 core tools + plugin tools via hook
- `acknowledge`: acknowledges by IDs
- `update_status`: updates DB, logs event, emits hook
- `escalate`: creates notification, emits hook