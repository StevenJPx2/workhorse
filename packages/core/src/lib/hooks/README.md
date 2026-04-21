# hooks

Event-based pub/sub via `mitt`.

## Usage

```typescript
import { hooks } from "#lib/hooks";

// Subscribe
hooks.on("issue.parsed", ({ issue, raw }) => {
  console.log("Parsed:", issue.title);
});

// Emit
hooks.emit("issue.status_changed", { issue, from: "todo", to: "in_progress" });

// Unsubscribe
hooks.off("issue.parsed", handler);

// Clear all
hooks.all.clear();
```

## Events

| Event                    | Payload                                           |
|--------------------------|---------------------------------------------------|
| `issue.parsed`           | `{ issue: Issue, raw: unknown }`                  |
| `issue.status_changed`   | `{ issue: Issue, from: IssueStatus, to }`         |
| `prompt.building`        | `{ issueId: string, context: PromptContext }`     |
| `prompt.built`           | `{ issueId: string, prompt: string }`             |
| `agent.starting`         | `{ instance: AgentInstance }`                     |
| `agent.started`          | `{ instance: AgentInstance }`                     |
| `agent.stopping`         | `{ instance: AgentInstance }`                     |
| `agent.stopped`          | `{ instance: AgentInstance }`                     |
| `agent.crashed`          | `{ instance: AgentInstance, error?: Error }`      |
| `notification.created`   | `{ notification: Notification, issueId }`         |
| `monitor.registered`     | `{ name: string, type: "remote" \| "local" }`     |
| `monitor.tick`           | `{ name: string, result: unknown }`               |
| `plugin.loaded`          | `{ name: string }`                                |
| `plugin.error`           | `{ name: string, error: Error }`                  |

Custom events allowed via `Record<string, unknown>` extension.
