# @jiratown/plugin-pi-adapter

Pi Coding Agent adapter plugin for Jiratown. Wraps `@mariozechner/pi-coding-agent` SDK as a Jiratown agent adapter.

## Installation

```bash
bun add @jiratown/plugin-pi-adapter
```

## Prerequisites

- **Pi Coding Agent** installed (`@mariozechner/pi-coding-agent`)
- **Authentication** via `pi /login` (OAuth credentials stored in `~/.pi/agent/auth.json`)

## Features

| Feature | Description |
|---------|-------------|
| **Agent Adapter** | Full Pi SDK integration as a Jiratown AgentAdapter |
| **Model Registry** | Exposes Pi's available models (with auth check) |
| **Tool Extensions** | Translates Jiratown tools to Pi Extension API |
| **Event Handling** | Maps Pi session events to Jiratown hooks |
| **Streaming Support** | Send messages during streaming via `session.steer()` |

## Usage

### Register the Plugin

```typescript
import { piAdapterPlugin } from "@jiratown/plugin-pi-adapter";

const jt = await bootstrap({
  plugins: [piAdapterPlugin],
});
```

### Spawn a Pi Agent

```typescript
const adapter = await orchestrator.spawn({
  issue,
  repoPath: "/path/to/repo",
  harness: "pi-coding-agent",    // This harness is registered by the plugin
  model: "anthropic/claude-sonnet-4",  // Optional — uses default if omitted
});

await adapter.start();
```

### Model Selection

Models can be specified in several ways:

```typescript
// Fully qualified: "provider/model-id"
model: "anthropic/claude-sonnet-4"

// Short name (auto-resolved if unambiguous)
model: "claude-sonnet-4"

// Default (uses Pi's default model)
model: undefined
```

## Architecture

```
┌──────────────────────────────────────────────────────────┐
│                     PiAgentAdapter                      │
│                                                        │
│  ┌─────────────┐  ┌──────────────┐  ┌─────────────┐  │
│  │ Pi SDK      │  │ Extensions   │  │ Event       │  │
│  │ Session     │  │ (Tools)      │  │ Handler     │  │
│  │             │  │              │  │             │  │
│  │ create()   │  │ Jiratown     │  │ agent.idle  │  │
│  │ prompt()    │  │ tools →      │  │ status      │  │
│  │ steer()     │  │ Pi extension │  │ changes     │  │
│  │ dispose()   │  │              │  │             │  │
│  └─────────────┘  └──────────────┘  └─────────────┘  │
│                                                        │
│  Inherits: AgentAdapter (worktree, prompt, steering)   │
└──────────────────────────────────────────────────────────┘
```

### Session Lifecycle

```
1. doStart()
   ├── Create AuthStorage (reuses ~/.pi/agent/auth.json)
   ├── Create PiModelRegistry from auth
   ├── Create DefaultResourceLoader
   │   ├── Set systemPromptOverride → agent's system prompt
   │   └── Add extensionFactories → Jiratown tools as Pi extensions
   ├── Create AgentSession
   └── Subscribe to session events → handleSessionEvent()

2. sendMessage(content)
   ├── If streaming: session.steer(content)  — inject mid-stream
   └── If idle: session.prompt(content)      — new prompt

3. doStop()
   ├── Unsubscribe from events
   └── session.dispose()
```

### Tool Translation

Jiratown tools (`OrchestratorTool[]`) are translated to Pi extensions:

```typescript
// Jiratown tool → Pi extension
{
  name: "jiratown_acknowledge",
  description: "Mark notification(s) as read...",
  schema: { type: "object", properties: {...} },
  execute: async (args, ctx) => {...}
}
// ↓ converted to ↓
Pi Extension with matching name, description, parameters, and handler
```

The extension handler receives tool call arguments and delegates to the original `execute()` function with a `ToolExecutionContext` containing `issueId`, `worktreePath`, `db`, `hooks`, and `memory`.

### Event Mapping

Pi session events are mapped to Jiratown hooks:

| Pi Event | Jiratown Action |
|----------|----------------|
| Agent becomes idle | Emit `agent.idle` hook |
| Agent tool call | Emit `agent.tool_call` hook |
| Status change | Update issue status + emit `issue.status_changed` |
| Session streaming state | Update adapter `state` |

## Model Registry

The `PiAdapterModelRegistry` wraps Pi's `ModelRegistry` to provide model discovery:

```typescript
import { PiAdapterModelRegistry } from "@jiratown/plugin-pi-adapter";

const registry = PiAdapterModelRegistry.getInstance();

// All models (including unauthenticated)
const all = registry.getAll();

// Available models (authenticated only)
const available = registry.getAvailable();

// Preferred provider
const provider = registry.getPreferredProvider(); // "anthropic", etc.

// Find specific model
const model = registry.find("anthropic", "claude-sonnet-4");

// Refresh after auth changes
registry.refresh();
```

## Types

The plugin re-exports `ModelInfo` from `@jiratown/core` and provides:

| Export | Description |
|--------|-------------|
| `PiAgentAdapter` | The adapter class |
| `PiAdapterModelRegistry` | Model registry singleton |

## Files

| File | Purpose |
|------|---------|
| `index.ts` | Plugin definition — registers adapter and TUI renderer |
| `adapter.ts` | PiAgentAdapter — extends AgentAdapter with Pi SDK integration |
| `events.ts` | Pi session event handler → Jiratown hook mapping |
| `registry.ts` | PiAdapterModelRegistry — wraps Pi's model registry |
| `renderers.ts` | TUI tool call renderer for Pi-specific display |

## License

MIT
