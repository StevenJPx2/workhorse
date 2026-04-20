# Step 7: MonitorService

Polling framework. Core provides infrastructure, plugins bring the "what" to monitor.

Location: `packages/core/src/services/monitor/`

## Domain Types (colocated)

```typescript
interface Monitor {
  name: string
  type: "remote" | "local"
  interval: number                     // ms
  poll: () => Promise<MonitorResult>
}

interface MonitorResult {
  hasChanges: boolean
  data?: unknown
}

type MonitorFactory = (ctx: MonitorContext) => Monitor

interface MonitorContext {
  issueId: string
  hooks: Hooks
  memory: MemoryService
  config: Readonly<JiratownConfig>
}

interface MonitorStatus {
  name: string
  type: "remote" | "local"
  issueId: string
  state: "running" | "stopped" | "error"
  lastPoll?: Date
  lastResult?: MonitorResult
  errorCount: number
}
```

## MonitorService Class

```typescript
class MonitorService {
  private factories = new Map<string, MonitorFactory>()
  private running = new Map<string, RunningMonitor>()  // key: `${issueId}:${name}`

  constructor(private hooks: Hooks)

  registerMonitor(name: string, factory: MonitorFactory): void
  startMonitors(issueId: string, ctx: MonitorContext): void
  stopMonitors(issueId: string): void
  stopMonitor(issueId: string, name: string): void
  getRunningMonitors(issueId: string): MonitorStatus[]
  shutdown(): void
}
```

## Poll Loop

1. Call `monitor.poll()`
2. If `hasChanges` → emit `monitor.tick` hook (plugin decides what to do)
3. If error → increment `errorCount`, stop after threshold (5), emit `monitor.error`
4. Update `lastPoll`, `lastResult`
5. Wait interval, repeat

## Built-in Monitors

1. **Agent Health** — checks if agent process is alive (port of `agent-poller.ts`, registered by AgentAdapter)

No notification watcher needed — notifications are push-based (step 9 listens to `notification.created` and delivers immediately via `sendKeys`).

Plugin-contributed monitors (Jira comments, GitHub reviews/comments) are registered during plugin `setup()`.

## Tests

Use fake timers.

- Register and start a monitor, poll fires at interval
- Emits `monitor.tick` on changes
- Stops after error threshold
- `stopMonitors` / `shutdown` stop everything
- Agent health monitor detects crashed agent, emits `agent.crashed`
