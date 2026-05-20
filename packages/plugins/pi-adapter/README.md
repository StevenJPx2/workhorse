# workhorse-plugin-pi-adapter

Pi Coding Agent adapter for Workhorse — enables using the Pi SDK as an agent harness with security constraints.

## What This Plugin Does

This plugin adapts the [Pi Coding Agent SDK](https://github.com/anthropics/pi-coding-agent) to work as a Workhorse agent adapter. It:

- **Wraps Pi SDK** as a `AgentAdapter` implementation
- **Enforces path restrictions** — agents can only access their worktree
- **Integrates Workhorse tools** — Pi can use tools registered by other plugins
- **Provides model registry** — discovers available models from Pi SDK

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     Pi Adapter Plugin                            │
├─────────────────────────────────────────────────────────────────┤
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                   PiAgentAdapter                          │   │
│  │  extends AgentAdapter                                     │   │
│  │                                                           │   │
│  │  ┌─────────────────┐  ┌────────────────────────────────┐ │   │
│  │  │  Pi SDK Session │  │  Path-Restricted Tools         │ │   │
│  │  │  (createAgent)  │  │  ReadTool, WriteTool, EditTool │ │   │
│  │  │                 │  │  BashTool, GrepTool, GlobTool  │ │   │
│  │  └─────────────────┘  └────────────────────────────────┘ │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │              PiAdapterModelRegistry                       │   │
│  │  Wraps Pi SDK's model discovery                           │   │
│  └──────────────────────────────────────────────────────────┘   │
├─────────────────────────────────────────────────────────────────┤
│  TUI Renderer: pi-tools (Read/Write/Edit/Bash activity)        │
└─────────────────────────────────────────────────────────────────┘
                               │
                               ▼
          ┌─────────────────────────────────────────┐
          │  workhorse-core (AgentAdapter base)     │
          │  - Provides: issue, worktreePath, tools │
          │  - Manages: lifecycle, steering rules   │
          └─────────────────────────────────────────┘
```

## What It Registers

### Adapter: `pi-coding-agent`

```typescript
class PiAgentAdapter extends AgentAdapter {
  readonly harness = "pi-coding-agent";

  static displayName = "Pi Coding Agent";
  static icon = "🥧";
  static registry = PiAdapterModelRegistry.getInstance();
}
```

### TUI Renderer: `pi-tools`

Renders file operation activities for the TUI:

- Read operations → file icon + path
- Write operations → pencil icon + path
- Edit operations → edit icon + path + diff summary
- Bash commands → terminal icon + command
- Grep/Glob → search icon + pattern

## Security: Path Restrictions

All file operations are constrained to the agent's worktree:

```typescript
// Tool creation with path restrictions
const readTool = createReadTool(worktreePath, {
  operations: createRestrictedReadOperations({
    rootDir: worktreePath,
  }),
});

const bashTool = createBashTool(worktreePath, {
  operations: createRestrictedBashOperations({
    rootDir: worktreePath,
    allowTmp: true, // Also allows /tmp/ for temp files
  }),
});
```

**How it works:**

```typescript
function isPathAllowed(path: string, options: PathValidationOptions): boolean {
  const normalizedPath = normalize(resolve(path));

  // Must be under root directory
  if (normalizedPath.startsWith(options.rootDir)) return true;

  // Or in additional allowed directories
  return options.additionalAllowedDirs?.some((dir) => normalizedPath.startsWith(dir)) ?? false;
}
```

**Why this matters:**

- Agents work in isolated worktrees (`../repo-worktrees/PROJ-123`)
- Without restrictions, agent could access main repo, other worktrees, system files
- Path validation prevents escape attacks via symlinks, `..`, etc.

## Model Registry

Wraps Pi SDK's model discovery:

```typescript
class PiAdapterModelRegistry extends ModelRegistry {
  getAll(): ModelInfo[] {
    return getPiRegistry()
      .getAll()
      .map((model) => ({
        provider: model.provider,
        id: model.id,
        name: model.name,
        contextWindow: model.contextWindow,
        capabilities: model.capabilities,
      }));
  }

  getAvailable(): ModelInfo[] {
    // Only models with configured API keys
    return this.getAll().filter((m) => hasApiKey(m.provider));
  }

  getPreferredProvider(): string {
    // Priority: anthropic > openai > first available
    if (hasApiKey("anthropic")) return "anthropic";
    if (hasApiKey("openai")) return "openai";
    return this.getAvailable()[0]?.provider ?? "anthropic";
  }
}
```

## Workhorse Tool Integration

Workhorse tools (from other plugins) are exposed to Pi via extension:

```typescript
protected override async doStart(): Promise<void> {
  const loader = new DefaultResourceLoader({
    cwd: this.worktreePath,
    extensionFactories: [
      createExtensionFromTools(this.tools, {
        issueId: this.issueId,
        worktreePath: this.worktreePath,
        db: this.db,
        hooks: this.hooks,
      }),
    ],
  });

  const { session } = await createAgentSession({
    cwd: this.worktreePath,
    resourceLoader: loader,
    customTools: [
      // Path-restricted versions of built-in tools
      createReadTool(this.worktreePath, { ... }),
      createWriteTool(this.worktreePath, { ... }),
      createEditTool(this.worktreePath, { ... }),
      createBashTool(this.worktreePath, { ... }),
    ],
  });

  this.session = session;
}
```

**How tools flow:**

```
┌─────────────────────┐
│  GitHub Plugin      │──registers──▶ github_open_pr, github_add_comment
│  Jira Plugin        │──registers──▶ jira_add_comment, jira_transition
│  Playwright Plugin  │──registers──▶ playwright_navigate, playwright_screenshot
└─────────────────────┘
           │
           ▼
┌─────────────────────┐
│  Orchestrator       │ collects all tools
│  .registerTool()    │
└─────────────────────┘
           │
           ▼ (adapter receives tools array)
┌─────────────────────┐
│  PiAgentAdapter     │ wraps as Pi Extension
│  createExtension()  │
└─────────────────────┘
           │
           ▼
┌─────────────────────┐
│  Pi SDK Session     │ agent can call any tool
└─────────────────────┘
```

## Agent Lifecycle

```typescript
// 1. Orchestrator spawns adapter
const adapter = await orchestrator.spawn({
  issueId: "issue-123",
  harness: "pi-coding-agent",
  model: "claude-sonnet-4",
});

// 2. Initialize (creates worktree, builds prompt)
// Called automatically by spawn()

// 3. Start agent
await adapter.start();
// Creates Pi session with restricted tools
// Sends initial prompt with issue context

// 4. Send messages
adapter.sendMessage("Please also add error handling");
// Appends to Pi session

// 5. Stop agent
await adapter.stop();
// Terminates Pi session
// Agent state → "stopped"
```

## Configuration

No additional configuration needed — uses Pi SDK defaults with path enforcement.

Model selection happens at spawn time:

```typescript
await orchestrator.spawn({
  harness: "pi-coding-agent",
  model: "claude-sonnet-4", // or "gpt-4", etc.
});
```

## Dependencies on Core

| Import                               | Usage                                 |
| ------------------------------------ | ------------------------------------- |
| `AgentAdapter`                       | Base class for adapter implementation |
| `ModelRegistry`                      | Model discovery interface             |
| `AgentState`                         | Lifecycle state enum                  |
| `OrchestratorTool`                   | Tool interface                        |
| `assertPathAllowed`, `isPathAllowed` | Security utilities                    |
| `WorkhorseContext`                   | Service access                        |

## Why This Architecture

1. **Adapter pattern** — Pi SDK has its own paradigm; adapter translates to Workhorse's
2. **Security first** — Path restrictions prevent agents from escaping worktree
3. **Tool composability** — Any plugin's tools automatically available to Pi agent
4. **Model abstraction** — ModelRegistry provides consistent interface across harnesses
5. **Activity rendering** — TUI can visualize what Pi is doing via renderer hook
