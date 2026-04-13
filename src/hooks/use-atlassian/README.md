# useAtlassian Hook

Solid.js hook for integrating with Jira via the Atlassian MCP (Model Context Protocol).

## Overview

This module provides:

- **`useAtlassian`** - Reactive hook with connection state management
- **`AtlassianClient`** - Low-level MCP client for direct API access
- Full TypeScript types for Jira issues and responses

## Installation

The hook uses the Atlassian MCP via `mcp-remote`. Ensure you have `npx` available:

```bash
# mcp-remote is fetched automatically via npx
bun install @modelcontextprotocol/sdk
```

## Quick Start

```tsx
import { useAtlassian } from "@/hooks/use-atlassian";

function TicketViewer() {
  const atlassian = useAtlassian({
    cloudId: "yourcompany.atlassian.net",
    autoConnect: true,
  });

  const [ticket, setTicket] = createSignal<JiraIssue | null>(null);

  const handleFetch = async () => {
    const issue = await atlassian.fetchIssue("AM-123");
    setTicket(issue);
  };

  return (
    <box>
      <text>Status: {atlassian.isConnected() ? "Connected" : "Disconnected"}</text>
      <button onPress={handleFetch}>Fetch Ticket</button>
      <Show when={ticket()}>
        <text>{ticket()!.summary}</text>
      </Show>
    </box>
  );
}
```

## API Reference

### useAtlassian(options?)

Creates a reactive Atlassian client hook.

#### Options

| Option               | Type                                  | Default | Description                                                                           |
| -------------------- | ------------------------------------- | ------- | ------------------------------------------------------------------------------------- |
| `cloudId`            | `string \| () => string \| undefined` | -       | Jira cloud ID (e.g., `"company.atlassian.net"`). Can be a getter for lazy resolution. |
| `autoConnect`        | `boolean`                             | `false` | Connect automatically on mount                                                        |
| `onConnectionChange` | `(connected: boolean) => void`        | -       | Callback when connection status changes                                               |
| `onError`            | `(error: Error) => void`              | -       | Callback when an error occurs                                                         |

#### Return Value

| Property          | Type                                                   | Description                        |
| ----------------- | ------------------------------------------------------ | ---------------------------------- |
| `isConnected`     | `Accessor<boolean>`                                    | Whether connected to Atlassian MCP |
| `isConnecting`    | `Accessor<boolean>`                                    | Whether currently connecting       |
| `error`           | `Accessor<Error \| null>`                              | Last error if any                  |
| `connect`         | `() => Promise<void>`                                  | Manually connect                   |
| `disconnect`      | `() => Promise<void>`                                  | Disconnect from MCP                |
| `fetchIssue`      | `(key: string) => Promise<JiraIssue>`                  | Fetch a Jira issue                 |
| `addComment`      | `(key: string, body: string) => Promise<void>`         | Add a comment                      |
| `transitionIssue` | `(key: string, transitionId: string) => Promise<void>` | Transition issue status            |

### JiraIssue Type

```typescript
interface JiraIssue {
  key: string; // "AM-123"
  summary: string; // Issue title
  description: string | null;
  status: string; // "In Progress", "Done", etc.
  priority: string | null;
  assignee: string | null;
  reporter: string | null;
  issueType: string; // "Bug", "Story", "Task"
  url: string; // Full Jira URL
  projectKey: string; // "AM"
  created: string; // ISO timestamp
  updated: string; // ISO timestamp
}
```

## Usage Patterns

### Async Config Loading

When your config loads asynchronously, pass `cloudId` as a getter:

```tsx
function App() {
  const config = useConfig();

  // cloudId is undefined until config loads
  const cloudId = () => config.config()?.jira.cloud_id;

  const atlassian = useAtlassian({ cloudId, autoConnect: false });

  // fetchIssue will resolve cloudId lazily when called
  const handleAdd = async (key: string) => {
    const issue = await atlassian.fetchIssue(key);
    // ...
  };
}
```

### Manual Connection Management

```tsx
const atlassian = useAtlassian({ cloudId: "company.atlassian.net" });

// Connect when needed
onMount(async () => {
  try {
    await atlassian.connect();
    console.log("Connected!");
  } catch (error) {
    console.error("Failed to connect:", error);
  }
});

// Disconnect is automatic on cleanup, but can be called manually
onCleanup(() => atlassian.disconnect());
```

### Error Handling

```tsx
const atlassian = useAtlassian({
  cloudId: "company.atlassian.net",
  onError: (error) => {
    toast.error(`Jira error: ${error.message}`);
  },
});

// Errors are also captured in reactive state
createEffect(() => {
  const err = atlassian.error();
  if (err) {
    console.error("Atlassian error:", err);
  }
});
```

## Atlassian MCP Parameters

This client uses the Atlassian MCP which expects specific parameter names:

| Operation               | Parameters                                              |
| ----------------------- | ------------------------------------------------------- |
| `getJiraIssue`          | `cloudId`, `issueIdOrKey`                               |
| `addCommentToJiraIssue` | `cloudId`, `issueIdOrKey`, `commentBody`                |
| `transitionJiraIssue`   | `cloudId`, `issueIdOrKey`, `transition: { id: string }` |

## Testing

Run the test suite:

```bash
bun test src/hooks/use-atlassian
```

### Test Files

| File                          | Description                                          |
| ----------------------------- | ---------------------------------------------------- |
| `client.test.ts`              | Low-level client tests (MCP calls, response mapping) |
| `use-atlassian.test.ts`       | Hook tests (reactive state, lifecycle)               |
| `use-atlassian-async.test.ts` | Async cloudId resolution tests                       |

### Mocking in Tests

The MCP SDK is mocked in tests. To write your own tests:

```typescript
import { mock, beforeEach } from "bun:test";

const mockCallTool = mock(() =>
  Promise.resolve({
    content: [
      {
        type: "text",
        text: JSON.stringify({
          key: "AM-123",
          fields: {
            summary: "Test issue",
            // ... other fields
          },
          self: "https://test.atlassian.net/rest/api/3/issue/AM-123",
        }),
      },
    ],
  }),
);

mock.module("@modelcontextprotocol/sdk/client/index.js", () => ({
  Client: class MockClient {
    connect = mock(() => Promise.resolve());
    close = mock(() => Promise.resolve());
    callTool = mockCallTool;
  },
}));
```

## Architecture

```
src/hooks/use-atlassian/
├── index.ts              # Public exports
├── types.ts              # TypeScript interfaces
├── client.ts             # Low-level AtlassianClient class
├── use-atlassian.ts      # Solid.js hook
├── client.test.ts        # Client unit tests
├── use-atlassian.test.ts # Hook unit tests
├── use-atlassian-async.test.ts # Async resolution tests
└── README.md             # This file
```

## Troubleshooting

### "Jira cloud ID is not configured"

This error occurs when:

1. `cloudId` option is not provided
2. `cloudId` getter returns `undefined` or empty string
3. Config hasn't loaded yet when method is called

**Solution**: Ensure `~/.jiratown/config.toml` has:

```toml
[jira]
cloud_id = "yourcompany.atlassian.net"
```

### "Failed to parse Jira response"

The MCP returned non-JSON data, usually an error message. This can happen when:

1. The issue key doesn't exist
2. Authentication failed
3. Wrong parameter names were used

Check the error message for the raw response preview.

### "Not connected to Atlassian MCP"

You tried to call a method before connecting. Either:

1. Set `autoConnect: true` in options
2. Call `await atlassian.connect()` before other methods
3. Use methods like `fetchIssue` which auto-connect

## Related

- [Atlassian MCP Documentation](https://mcp.atlassian.com)
- [Model Context Protocol SDK](https://github.com/anthropics/mcp-sdk)
- [PLAN.md](../../../PLAN.md) - Project architecture
