# Step 9: Orchestrator

Agent-agnostic orchestrator. Takes Jiratown's internal representation, manages worktrees and agent processes via pi-coding-agent SDK. Extensible via hooks.

Location: `packages/core/src/workflow/orchestrator/`

Deps: `@mariozechner/pi-coding-agent`

Git worktree utilities live in `lib/git/worktree.ts` (general-purpose, reusable).

## File Structure

```
packages/core/src/
├── lib/
│   └── git/
│       ├── index.ts              # Public exports
│       └── worktree.ts           # createWorktree, removeWorktree, listWorktrees, getWorktree
│
├── plugins/
│   └── builtin/
│       └── tools.ts              # coreToolsPlugin (acknowledge, update_status, escalate)
│
└── workflow/
    └── orchestrator/
        ├── README.md
        ├── index.ts              # Public exports
        ├── types.ts              # AgentAdapter, SpawnOptions, OrchestratorTool, etc.
        ├── orchestrator.ts       # Main HarnessOrchestrator class
        └── adapters/
            ├── types.ts          # AdapterContext (shared context for adapter construction)
            └── pi/
                └── adapter.ts    # PiAgentAdapter extends AgentAdapter
```

## Domain Types

```typescript
type AgentHarness = "pi-coding-agent" | (string & {})
type AgentState = "starting" | "running" | "stopping" | "stopped" | "crashed"

interface SpawnOptions {
  issue: Issue
  prompt?: string           // Overrides PromptEngineer output if provided
  harness?: AgentHarness    // Defaults to "pi-coding-agent"
  model?: string
  repoPath: string
  baseBranch?: string
}

// Harness-agnostic tool interface — plugins register once, adapters translate
interface OrchestratorTool {
  name: string
  description: string       // Rendered in system prompt so agent knows tool exists
  schema: JSONSchema
  execute: (args: unknown, ctx: ToolExecutionContext) => Promise<ToolResult>
}

interface ToolExecutionContext {
  issueId: string
  worktreePath: string
  db: Database
  hooks: Emitter<HookEventMap>
  memory: MemoryService
}

interface ToolResult {
  success: boolean
  output?: string
  error?: string
}
```

## AgentAdapter Interface

Each adapter is a class instantiated per issue — combines tracking data and control methods:

```typescript
interface AgentAdapter {
  readonly issueId: string
  readonly harness: AgentHarness
  readonly worktreePath: string
  state: AgentState
  
  start(): Promise<void>
  sendMessage(content: string): Promise<void>
  stop(): Promise<void>
  isRunning(): boolean
}

// Context passed to adapter constructor
interface AdapterContext {
  issue: Issue
  worktreePath: string
  systemPrompt: string       // From PromptEngineer.buildHybridPrompt() — includes tool descriptions
  initialMessage: string     // From PromptEngineer.buildHybridPrompt()
  tools: OrchestratorTool[]  // Core + plugin tools — adapter translates to native format
  db: Database
  hooks: Emitter<HookEventMap>
  memory: MemoryService
}
```

## HarnessOrchestrator Class

```typescript
class HarnessOrchestrator {
  private agents = new Map<string, AgentAdapter>()
  private tools = new Map<string, OrchestratorTool>()

  constructor(
    private db: Database,
    private hooks: Emitter<HookEventMap>,
    private memory: MemoryService,
    private tracker: { engineer: PromptEngineer },
    private config: Readonly<JiratownConfig>
  )

  // Tool registration — plugins call this, harness-agnostic
  registerTool(tool: OrchestratorTool): void
  getTools(): OrchestratorTool[]

  // Agent lifecycle
  async spawn(options: SpawnOptions): Promise<AgentAdapter>
  async stop(issueId: string, options?: { removeWorktree?: boolean }): Promise<void>
  async sendMessage(issueId: string, content: string): Promise<void>
  getAgent(issueId: string): AgentAdapter | undefined
  getAll(): AgentAdapter[]
  async shutdown(): Promise<void>
}
```

## Spawn Flow

1. Emit `orchestrator.spawn.pre` hook (plugins can modify options or abort)
2. Create git worktree via `lib/git/worktree.ts` (or reuse existing)
3. Detect resume: check if `.jiratown/session/` exists in worktree
4. Get all registered tools via `this.getTools()`
5. Build hybrid prompt via `PromptEngineer.buildHybridPrompt()` with `{ resume, tools }` — includes tool descriptions in system prompt
6. Instantiate adapter: `const adapter = new PiAgentAdapter(ctx)` (harness selection via switch on `options.harness`)
7. Start adapter: `await adapter.start()`
8. Store adapter in map, update issue status in DB
9. Emit `orchestrator.spawn.post` hook

## Stop Flow

1. Emit `orchestrator.stop.pre` hook
2. Call `adapter.stop()`
3. Optionally remove worktree via `lib/git/worktree.ts`
4. Emit `orchestrator.stop.post` hook

## PiAgentAdapter (`adapters/pi/adapter.ts`)

Uses `@mariozechner/pi-coding-agent` SDK directly (no subprocess, no TUI, no headless-terminal). There is no terminal to observe — all output is accessed via `session.subscribe()`.

Pi's `SessionManager` is pointed at `.jiratown/session/` inside the worktree so session JSONL files persist there. The agent can resume across restarts via pi's own session continuity. The session summary at the top of the JSONL serves as L1 context readable by both Jiratown and the agent itself.

`session.subscribe()` is used to:
- Bridge key pi events into Jiratown hook events (`agent.output`, `agent.tool_call`)
- Append a `SessionEntry` to `.jiratown/context.md` (L1 memory) at `agent_end`

The adapter **translates** `OrchestratorTool[]` into pi's native extension format:

```typescript
import { createAgentSession, DefaultResourceLoader, SessionManager } from "@mariozechner/pi-coding-agent"

class PiAgentAdapter implements AgentAdapter {
  readonly harness = "pi-coding-agent" as const
  readonly issueId: string
  readonly worktreePath: string
  state: AgentState = "stopped"

  private session: Session | null = null

  constructor(private ctx: AdapterContext) {
    this.issueId = ctx.issue.externalId
    this.worktreePath = ctx.worktreePath
  }

  async start(): Promise<void> {
    this.state = "starting"

    // Translate OrchestratorTool[] → pi ExtensionFactory
    const extensionFactory = createExtensionFromTools(this.ctx.tools, {
      issueId: this.issueId,
      worktreePath: this.worktreePath,
      db: this.ctx.db,
      hooks: this.ctx.hooks,
      memory: this.ctx.memory,
    })

    const loader = new DefaultResourceLoader({
      cwd: this.worktreePath,
      systemPromptOverride: () => this.ctx.systemPrompt,
      extensionFactories: [extensionFactory],
    })
    await loader.reload()

    const { session } = await createAgentSession({
      cwd: this.worktreePath,
      resourceLoader: loader,
      sessionManager: SessionManager.create(this.worktreePath, {
        sessionDir: ".jiratown/session",
      }),
    })
    this.session = session

    // Bridge pi events → Jiratown hooks + L1 memory
    session.subscribe((event) => {
      if (event.type === "message_update") {
        const delta = event.assistantMessageEvent
        if (delta.type === "text_delta") {
          this.ctx.hooks.emit("agent.output", { issueId: this.issueId, delta: delta.delta })
        }
      }
      if (event.type === "tool_execution_start") {
        this.ctx.hooks.emit("agent.tool_call", { issueId: this.issueId, tool: event.toolName, args: event.args })
      }
      if (event.type === "agent_end") {
        // Append session entry to .jiratown/context.md
        const l1 = this.ctx.memory.l1.get(this.issueId)
        const sessionData = await l1.load()
        sessionData.entries.push({ type: "session", timestamp: new Date().toISOString(), summary: "..." })
        await l1.save(sessionData)
      }
    })

    this.state = "running"
    await session.prompt(this.ctx.initialMessage)
  }

  async sendMessage(content: string): Promise<void> {
    if (!this.session) throw new Error("Session not started")
    if (this.session.isStreaming) {
      await this.session.steer(content)
    } else {
      await this.session.prompt(content)
    }
  }

  async stop(): Promise<void> {
    this.state = "stopping"
    this.session?.dispose()
    this.session = null
    this.state = "stopped"
  }

  isRunning(): boolean {
    return this.session?.isStreaming ?? false
  }
}

// Translate OrchestratorTool[] → pi ExtensionFactory
function createExtensionFromTools(tools: OrchestratorTool[], execCtx: ToolExecutionContext) {
  return function(pi: ExtensionAPI) {
    for (const tool of tools) {
      pi.registerTool({
        name: tool.name,
        description: tool.description,
        schema: tool.schema,
        execute: async (args) => {
          const result = await tool.execute(args, execCtx)
          if (!result.success) throw new Error(result.error ?? "Tool execution failed")
          return result.output ?? ""
        }
      })
    }
  }
}
```

## Core Tools Plugin

Core Jiratown tools are registered via a builtin plugin (like `loggerPlugin`), keeping the orchestrator tool-agnostic:

```typescript
// plugins/builtin/tools.ts
export const coreToolsPlugin = definePlugin({
  manifest: {
    name: "builtin-tools",
    version: "1.0.0",
    description: "Core Jiratown agent tools",
    capabilities: { tools: ["jiratown_acknowledge", "jiratown_update_status", "jiratown_escalate"] },
  },
  setup(ctx) {
    ctx.orchestrator.registerTool({
      name: "jiratown_acknowledge",
      description: "Mark notification(s) as read. Call after processing system inbox messages.",
      schema: { type: "object", properties: { notificationIds: { type: "array", items: { type: "string" } } } },
      execute: async (args, toolCtx) => {
        // Mark notifications as read in memory service
        return { success: true, output: "Notifications acknowledged" }
      }
    })
    
    ctx.orchestrator.registerTool({
      name: "jiratown_update_status",
      description: "Update the issue status (e.g., 'in-progress', 'blocked', 'done').",
      schema: { type: "object", properties: { status: { type: "string" } } },
      execute: async (args, toolCtx) => {
        // Update issue status in DB, emit hook
        return { success: true, output: `Status updated to ${args.status}` }
      }
    })
    
    ctx.orchestrator.registerTool({
      name: "jiratown_escalate",
      description: "Escalate to a human when blocked or need clarification. Creates a notification.",
      schema: { type: "object", properties: { message: { type: "string" }, blocking: { type: "boolean" } } },
      execute: async (args, toolCtx) => {
        // Create escalation notification
        return { success: true, output: "Escalation created" }
      }
    })
  },
})

// bootstrap.ts
plugins.register(loggerPlugin)
plugins.register(coreToolsPlugin)  // Register core tools
await plugins.setup()
```

## Plugin Tool Registration

Plugins register tools via `ctx.orchestrator.registerTool()` in their `setup()` function:

```typescript
// Example plugin with custom tool
export default definePlugin({
  manifest: {
    name: "my-plugin",
    version: "1.0.0",
    capabilities: { tools: ["my_plugin_tool"] },
  },
  setup(ctx) {
    ctx.orchestrator.registerTool({
      name: "my_plugin_tool",
      description: "Does something useful for the agent",
      schema: { type: "object", properties: { input: { type: "string" } } },
      execute: async (args, toolCtx) => {
        // toolCtx has issueId, worktreePath, db, hooks, memory
        return { success: true, output: "Result" }
      }
    })
  },
})
```

Requires adding `orchestrator` to `JiratownContext`:

```typescript
// context/types.ts
interface JiratownContext {
  // ... existing fields ...
  readonly orchestrator: HarnessOrchestrator
}
```

Benefits:
1. **Plugins don't know about pi** — they use the unified `OrchestratorTool` interface
2. **Tool descriptions in system prompt** — `PromptEngineer` renders them so agent knows what's available
3. **Adapters translate** — pi adapter wraps tools in `ExtensionFactory`, future adapters do their own thing

## PromptEngineer Extension

Add `buildHybridPrompt()` to `workflow/tracker/engineer.ts`:

```typescript
interface HybridPromptOptions extends BuildPromptOptions {
  tools?: OrchestratorTool[]  // Tools to render in system prompt
}

interface HybridPrompt {
  systemPrompt: string    // Issue context, tools, instructions, memory — goes to pi systemPromptOverride
  initialMessage: string  // Task description, notifications — goes to session.prompt()
}

async buildHybridPrompt(issue: Issue, options?: HybridPromptOptions): Promise<HybridPrompt>
```

The system prompt includes a "## Available Tools" section rendered from `options.tools`:

```typescript
private renderToolsSection(tools: OrchestratorTool[]): string {
  if (!tools.length) return ""
  
  const lines = ["## Available Tools", ""]
  for (const tool of tools) {
    lines.push(`### ${tool.name}`)
    lines.push(tool.description)
    lines.push("")
  }
  return lines.join("\n")
}
```

This ensures the agent knows what tools exist regardless of which harness runs it. The harness then makes those tools actually callable.

## Hook Events

Add to `lib/hooks/types.ts`:

```typescript
"orchestrator.spawn.pre":  { issue: Issue; options: SpawnOptions }
"orchestrator.spawn.post": { adapter: AgentAdapter }
"orchestrator.stop.pre":   { adapter: AgentAdapter }
"orchestrator.stop.post":  { adapter: AgentAdapter }

// Bridged from pi session.subscribe()
"agent.output":    { issueId: string; delta: string }
"agent.tool_call": { issueId: string; tool: string; args: unknown }
"agent.crashed":   { issueId: string; error: Error }
```

Consolidated: `agent.starting`/`agent.stopping`/`agent.started`/`agent.stopped` are all replaced by the orchestrator hooks above. `agent.crashed` is emitted when the adapter detects unexpected termination.

## Notification Delivery (push-based)

The orchestrator constructor subscribes to `notification.created` hook:

```typescript
constructor(...) {
  this.hooks.on("notification.created", async ({ notification }) => {
    const agent = this.agents.get(notification.issueId)
    if (agent?.state === "running") {
      const inbox = generateSystemInbox([notification])  // from services/memory/inbox.ts
      await agent.sendMessage(inbox)
    }
  })
}
```

The agent never polls — notifications are pushed in real-time via `session.steer()`. Pending notifications at spawn time are already bundled into the initial message by `PromptEngineer`.

## lib/git/worktree.ts

Port of `session/worktree/` from the old codebase. Stateless functions, no MCP config writing (that was old Claude Code concern):

```typescript
createWorktree(repoPath, issueId, issueType?, baseBranch?): Promise<WorktreeInfo | null>
removeWorktree(repoPath, issueId, deleteBranch?): Promise<boolean>
listWorktrees(repoPath): Promise<WorktreeInfo[]>
getWorktree(repoPath, issueId): Promise<WorktreeInfo | null>

interface WorktreeInfo {
  path: string
  branch: string
  issueId: string
  head: string
}
```

## Tests

- `lib/git/worktree`: create/remove/list/get (real git ops in temp dirs)
- `adapters/pi/extension`: each tool executes correctly with mock db/hooks
- `adapters/pi/agent`: spawn calls pi SDK with correct system prompt + initial message
- `orchestrator`: spawn flow emits correct hooks, stop flow cleans up, notification delivery via `sendMessage`
