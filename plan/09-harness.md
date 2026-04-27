# Step 9: Orchestrator

Agent-agnostic orchestrator. Takes Jiratown's internal representation, manages worktrees and agent lifecycles. Adapters are pluggable — registered via plugins.

Location: `packages/core/src/workflow/orchestrator/`

Deps: None (adapters bring their own dependencies via plugins)

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
│       ├── plugin.ts             # corePlugin (tools)
│       └── pi-adapter/           # piAdapterPlugin (registers PiAgentAdapter)
│           ├── index.ts          # Plugin definition
│           ├── adapter.ts        # PiAgentAdapter class
│           └── events.ts         # Pi SDK event handling
│
└── workflow/
    └── orchestrator/
        ├── README.md
        ├── index.ts              # Public exports
        ├── orchestrator.ts       # Main HarnessOrchestrator class
        ├── spawn.ts              # Agent spawn logic (uses registered adapter class)
        └── types/
            ├── index.ts          # Re-exports
            ├── agent.ts          # AgentAdapter abstract class, AgentHarness, AgentState
            ├── adapter-context.ts # AdapterContext (passed to adapter constructor)
            ├── tools.ts          # OrchestratorTool, ToolExecutionContext, ToolResult
            └── spawn.ts          # SpawnOptions, StopOptions
```

## Domain Types

```typescript
type AgentHarness = string  // Validated at runtime against registered adapters
type AgentState = "starting" | "running" | "stopping" | "stopped" | "crashed"

interface SpawnOptions {
  issue: Issue
  prompt?: string           // Overrides PromptEngineer output if provided
  harness?: AgentHarness    // Uses config default if not specified
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

## AgentAdapter Abstract Class

Each adapter extends this abstract base class. The base handles common construction (`issueId`, `worktreePath`, `state` init) and stores `ctx` as a protected field. Subclasses only implement harness-specific logic.

```typescript
// workflow/orchestrator/types/agent.ts
abstract class AgentAdapter {
  get issueId(): string { return this.ctx.issue.externalId }
  get worktreePath(): string { return this.ctx.worktreePath }
  state: AgentState = "stopped"
  abstract readonly harness: AgentHarness

  constructor(protected readonly ctx: AdapterContext) {}

  abstract start(): Promise<void>
  abstract sendMessage(content: string): Promise<void>
  abstract stop(): Promise<void>
  abstract isRunning(): boolean
}

// Context passed to adapter constructor
interface AdapterContext {
  issue: Issue
  worktreePath: string
  systemPrompt: string
  initialMessage: string
  tools: OrchestratorTool[]
  db: Database
  hooks: Emitter<HookEventMap>
  memory: MemoryService
  model?: string
}
```

## HarnessOrchestrator Class

```typescript
class HarnessOrchestrator {
  private agents = new Map<string, AgentAdapter>()
  private tools = new Map<string, OrchestratorTool>()
  private adapters = new Map<string, typeof AgentAdapter>()

  constructor(
    private db: Database,
    private hooks: Emitter<HookEventMap>,
    private memory: MemoryService,
    private config: Readonly<JiratownConfig>
  )

  // Adapter registration — plugins call this during setup
  registerAdapter(harness: string, adapterClass: typeof AgentAdapter): void
  
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
5. Build hybrid prompt via `PromptEngineer.buildHybridPrompt()` with `{ resume, tools }`
6. Look up adapter class: `const AdapterClass = this.adapters.get(harness)`
7. Instantiate adapter: `const adapter = new AdapterClass(adapterCtx)`
8. Start adapter: `await adapter.start()`
9. Store adapter in map, update issue status in DB
10. Emit `orchestrator.spawn.post` hook

```typescript
// spawn.ts
const harness = options.harness ?? config.agent.harness
const AdapterClass = this.adapters.get(harness)
if (!AdapterClass) {
  throw new Error(`No adapter registered for harness: ${harness}`)
}

const adapter = new AdapterClass({
  issue,
  worktreePath: worktree.path,
  systemPrompt,
  initialMessage,
  tools: this.getTools(),
  db: this.db,
  hooks: this.hooks,
  memory: this.memory,
  model: options.model,
})
await adapter.start()
```

## Stop Flow

1. Emit `orchestrator.stop.pre` hook
2. Call `adapter.stop()`
3. Optionally remove worktree via `lib/git/worktree.ts`
4. Emit `orchestrator.stop.post` hook

## Pluggable Adapters

Adapters are entirely plugin-based. The orchestrator only knows about the `AgentAdapter` interface — it has no knowledge of specific implementations like pi-coding-agent.

### Registering an Adapter

Plugins register adapter classes via `ctx.orchestrator.registerAdapter()`:

```typescript
// plugins/builtin/pi-adapter/index.ts
import { definePlugin } from "#plugins"
import { PiAgentAdapter } from "./adapter.ts"

export const piAdapterPlugin = definePlugin({
  manifest: {
    name: "builtin-pi-adapter",
    version: "1.0.0",
    description: "Pi Coding Agent adapter",
    capabilities: { adapters: ["pi-coding-agent"] },
  },
  setup(ctx) {
    ctx.orchestrator.registerAdapter("pi-coding-agent", PiAgentAdapter)
  },
})
```

### Plugin Manifest Capabilities

```typescript
// plugins/types.ts
capabilities: z.object({
  parsers: z.array(z.string()).optional(),
  monitors: z.array(z.string()).optional(),
  tools: z.array(z.string()).optional(),
  adapters: z.array(z.string()).optional(),
}).optional()
```

### Config Schema

Harness is a string validated at runtime against registered adapters:

```typescript
// config/schema.ts
harness: z.string().default("pi-coding-agent")

// config/types.ts
type AgentHarness = string
```

## Example: Pi Adapter Plugin

The builtin pi-adapter plugin shows the pattern for implementing an adapter:

```typescript
// plugins/builtin/pi-adapter/adapter.ts
import {
  type AgentSession,
  createAgentSession,
  DefaultResourceLoader,
  SessionManager,
} from "@mariozechner/pi-coding-agent"
import type { AgentAdapter, AdapterContext, AgentState } from "#workflow/orchestrator"

export class PiAgentAdapter extends AgentAdapter {
  readonly harness = "pi-coding-agent"

  private session: AgentSession | null = null

  async start(): Promise<void> {
    this.state = "starting"

    // Translate OrchestratorTool[] → pi ExtensionFactory
    const extensionFactory = this.createExtensionFromTools()

    const loader = new DefaultResourceLoader({
      cwd: this.worktreePath,
      systemPromptOverride: () => this.ctx.systemPrompt,
      extensionFactories: [extensionFactory],
    })
    await loader.reload()

    const { session } = await createAgentSession({
      cwd: this.worktreePath,
      resourceLoader: loader,
      sessionManager: SessionManager.create(this.worktreePath),
    })
    this.session = session

    // Bridge pi events → Jiratown hooks
    this.subscribeToEvents()

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

  private createExtensionFromTools() {
    const { tools } = this.ctx
    const execCtx = {
      issueId: this.issueId,
      worktreePath: this.worktreePath,
      db: this.ctx.db,
      hooks: this.ctx.hooks,
      memory: this.ctx.memory,
    }
    
    return (pi: ExtensionAPI) => {
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

  private subscribeToEvents() {
    this.session?.subscribe((event) => {
      if (event.type === "message_update") {
        const delta = event.assistantMessageEvent
        if (delta.type === "text_delta") {
          this.ctx.hooks.emit("agent.output", { issueId: this.issueId, delta: delta.delta })
        }
      }
      if (event.type === "tool_execution_start") {
        this.ctx.hooks.emit("agent.tool_call", { issueId: this.issueId, tool: event.toolName, args: event.args })
      }
    })
  }
}
```

## Example: Third-Party Adapter Plugin

```typescript
// @jiratown/opencode-adapter (hypothetical npm package)
import { definePlugin, type AdapterContext, type AgentAdapter, type AgentState } from "@jiratown/core"
import { OpencodeSDK } from "opencode-sdk"

class OpencodeAdapter extends AgentAdapter {
  readonly harness = "opencode"

  async start(): Promise<void> { /* ... */ }
  async sendMessage(content: string): Promise<void> { /* ... */ }
  async stop(): Promise<void> { /* ... */ }
  isRunning(): boolean { /* ... */ }
}

export default definePlugin({
  manifest: {
    name: "opencode-adapter",
    version: "1.0.0",
    capabilities: { adapters: ["opencode"] },
  },
  setup(ctx) {
    ctx.orchestrator.registerAdapter("opencode", OpencodeAdapter)
  },
})
```

## Core Tools Plugin

Core Jiratown tools are registered via a builtin plugin, keeping the orchestrator tool-agnostic:

```typescript
// plugins/builtin/plugin.ts
export const corePlugin = definePlugin({
  manifest: {
    name: "builtin-tools",
    version: "1.0.0",
    description: "Core Jiratown agent tools",
    capabilities: { tools: ["jiratown_acknowledge", "jiratown_update_status", "jiratown_escalate"] },
  },
  setup(ctx) {
    ctx.orchestrator.registerTool(acknowledgeTool)
    ctx.orchestrator.registerTool(updateStatusTool)
    ctx.orchestrator.registerTool(escalateTool)
  },
})
```

## Bootstrap

```typescript
// bootstrap.ts
plugins.register(loggerPlugin)
plugins.register(corePlugin)        // Register core tools
plugins.register(piAdapterPlugin)   // Register pi-coding-agent adapter
await plugins.setup()
```

## PromptEngineer Extension

Add `buildHybridPrompt()` to `workflow/tracker/engineer.ts`:

```typescript
interface HybridPromptOptions extends BuildPromptOptions {
  tools?: OrchestratorTool[]  // Tools to render in system prompt
}

interface HybridPrompt {
  systemPrompt: string    // Issue context, tools, instructions, memory
  initialMessage: string  // Task description, notifications
}

async buildHybridPrompt(issue: Issue, options?: HybridPromptOptions): Promise<HybridPrompt>
```

The system prompt includes a "## Available Tools" section rendered from `options.tools`. This ensures the agent knows what tools exist regardless of which harness runs it.

## Hook Events

```typescript
// lib/hooks/types.ts
"orchestrator.spawn.pre":  { issue: Issue; options: SpawnOptions }
"orchestrator.spawn.post": { adapter: AgentAdapter }
"orchestrator.stop.pre":   { adapter: AgentAdapter }
"orchestrator.stop.post":  { adapter: AgentAdapter }

// Bridged from adapter implementations
"agent.output":    { issueId: string; delta: string }
"agent.tool_call": { issueId: string; tool: string; args: unknown }
"agent.crashed":   { issueId: string; error: Error }
```

## Notification Delivery (push-based)

The orchestrator constructor subscribes to `notification.created` hook:

```typescript
constructor(...) {
  this.hooks.on("notification.created", async ({ notification, issueId }) => {
    const agent = this.agents.get(issueId)
    if (agent?.state === "running") {
      const inbox = generateSystemInbox([notification])
      await agent.sendMessage(inbox)
    }
  })
}
```

## lib/git/worktree.ts

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

## Benefits

1. **Extensible**: Third-party harnesses via npm packages
2. **Consistent**: Same registration pattern as tools (`registerTool` / `registerAdapter`)
3. **Type-safe**: `AgentAdapter` abstract class enforces correct implementation
4. **Fail-fast**: Clear error at spawn time if harness not registered
5. **Clean separation**: Orchestrator has no knowledge of specific adapters

## Tests

- `lib/git/worktree`: create/remove/list/get (real git ops in temp dirs)
- `orchestrator`: spawn flow emits correct hooks, stop flow cleans up, notification delivery via `sendMessage`
- `orchestrator.registerAdapter`: class registration and instantiation
- `spawn with registered adapter`: adapter constructor receives correct AdapterContext
- `spawn with unknown harness`: throws clear error
