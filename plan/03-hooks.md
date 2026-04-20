# Step 3: Hooks

[mitt](https://github.com/developit/mitt) (~200 bytes) directly. No wrapper.

Location: `packages/core/src/hooks/`

## Implementation

```typescript
import mitt from "mitt"
import type { HookEventMap } from "./types"

export const hooks = mitt<HookEventMap>()
```

That's it. One instance, exported directly.

## HookEventMap (colocated here)

```typescript
// hooks/types.ts

interface HookEventMap {
  "issue.parsed": { issue: Issue; raw: unknown }
  "issue.status_changed": { issue: Issue; from: IssueStatus; to: IssueStatus }
  "prompt.building": { issueId: string; context: PromptContext }
  "prompt.built": { issueId: string; prompt: string }
  "agent.starting": { instance: AgentInstance }
  "agent.started": { instance: AgentInstance }
  "agent.stopping": { instance: AgentInstance }
  "agent.stopped": { instance: AgentInstance }
  "agent.crashed": { instance: AgentInstance; error?: Error }
  "notification.created": { notification: Notification; issueId: string }
  "monitor.registered": { name: string; type: "remote" | "local" }
  "monitor.tick": { name: string; result: unknown }
  "plugin.loaded": { name: string }
  "plugin.error": { name: string; error: Error }
  [custom: string]: unknown
}
```

- `on`, `off`, `emit`
- Wildcard `"*"` for debugging
- If a handler throws, it throws. No isolation.
- `emit()` is synchronous fire-and-forget. Handlers can be async internally but aren't awaited.
- `HookEventMap` has `[custom: string]: unknown` for plugin extensibility.

## Tests

- Registers and calls handlers
- `off()` removes handler
- Wildcard `"*"` receives all events
- `all.clear()` removes everything
