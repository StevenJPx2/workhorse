# Step 9: Harness

Agent-agnostic adapter. Takes Jiratown's internal representation, generates native config for the coding harness (Claude Code / Opencode), manages worktrees and processes.

Location: `packages/core/src/workflow/harness/`

## Domain Types (colocated)

```typescript
interface AgentInstance {
  issueId: string
  harness: AgentHarness
  model?: string
  state: AgentState
  worktreePath?: string
  port?: number
  startedAt?: Date
  metadata?: Record<string, unknown>
}

type AgentHarness = "claude-code" | "opencode" | (string & {})
type AgentState = "idle" | "starting" | "running" | "stopping" | "stopped" | "crashed"

interface SpawnOptions {
  issue: Issue
  prompt: string
  harness: AgentHarness
  model?: string
  repoPath: string
  baseBranch?: string
}

interface HarnessConfig {
  files: Array<{ path: string; content: string }>
}

interface HarnessAdapter {
  generateConfig(options: HarnessConfigOptions): Promise<HarnessConfig>
  writeConfig(worktreePath: string, config: HarnessConfig): Promise<void>
  buildCommand(options: HarnessCommandOptions): string
  checkHealth(issueId: string): Promise<HealthStatus>
}
```

## Harness Class

```typescript
class Harness {
  private agents = new Map<string, AgentInstance>()

  constructor(db: Database, hooks: Hooks, memory: MemoryService, monitors: MonitorService, config: Readonly<JiratownConfig>)

  async spawn(options: SpawnOptions): Promise<AgentInstance>
  async stop(issueId: string, options?: { removeWorktree?: boolean }): Promise<void>
  async sendMessage(issueId: string, message: string): Promise<void>
  async captureOutput(issueId: string): Promise<string>
  getStatus(issueId: string): AgentInstance | undefined
  getAll(): AgentInstance[]
  async shutdown(): Promise<void>
}
```

## Spawn Flow

1. Emit `agent.starting`
2. Create worktree
3. Generate + write harness config
4. Create tmux session, send command
5. Store `AgentInstance`, register health monitor
6. Update issue in DB
7. Emit `agent.started`

## Harness Implementations

**ClaudeCodeHarness** generates: `.mcp.json`, `.claude-plugin/plugin.json`, `hooks/hooks.json`, skills, monitors.

**OpencodeHarness** generates: `opencode.json`, `.opencode/plugins/jiratown.ts`.

## Provisioning (stateless functions)

```typescript
// Worktree (port of session/worktree/)
createWorktree(repoPath, issueId, issueType, baseBranch): Promise<WorktreeInfo>
removeWorktree(worktreePath): Promise<void>
listWorktrees(repoPath): Promise<WorktreeInfo[]>

// Process (port of session/tmux/)
createSession(issueId, cwd): Promise<void>
killSession(issueId): Promise<void>
sendKeys(issueId, keys): Promise<void>
capturePane(issueId): Promise<string>
sessionExists(issueId): Promise<boolean>

// Port management (Opencode)
getPortForIssue(issueId): number
releasePort(issueId): void
```

## Notification Delivery (push-based via hook)

Listens to `notification.created` → if agent running for that issue, generates `<system_inbox>` XML and pushes immediately via `sendKeys`. The agent never polls — notifications are pushed in real-time. Pending notifications at spawn time are already bundled into the initial prompt (step 8).

## Tests

- Spawn creates worktree + session + config, emits hooks
- Stop kills session, optionally removes worktree, emits hooks
- Claude Code harness generates correct `.mcp.json`, `plugin.json`, command
- Opencode harness generates correct `opencode.json`, plugin module, command with port
- Worktree and tmux process management