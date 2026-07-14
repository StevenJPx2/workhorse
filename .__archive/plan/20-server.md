# Step 20: Server

HTTP/WebSocket server for Workhorse. Exposes core APIs over REST and real-time streams, enabling remote clients (web dashboards, mobile apps, VS Code extensions) to interact with running agents.

**Location:** `packages/server/` (package: `workhorse-server`)

**External deps:** `nitro`

- **nitro** — Universal TypeScript server framework from UnJS. Same ecosystem as `citty` (CLI), `unctx` (async context), and other UnJS tools already in Workhorse. File-based routing, auto-imports, universal deployment (Node, Bun, Deno, Cloudflare, Vercel, etc.).

## Goals

1. **REST API** — CRUD for issues, agents, notifications, config
2. **WebSocket streams** — Real-time agent output, notifications, status changes
3. **Authentication** — Token-based auth with optional API keys
4. **Plugin-extensible** — Plugins can register custom routes
5. **Headless mode** — Run Workhorse without TUI, expose only API

## Why Nitro?

| Benefit                    | Description                                                                     |
| -------------------------- | ------------------------------------------------------------------------------- |
| **UnJS ecosystem**         | Same ecosystem as `citty`, `unctx`, `defu`, `consola` already used in Workhorse |
| **File-based routing**     | Convention-over-configuration, routes are `routes/api/agents/index.ts`          |
| **Universal deployment**   | Build once, deploy anywhere (Node, Bun, Deno, Cloudflare, Vercel, AWS Lambda)   |
| **Auto-imports**           | `defineEventHandler`, `readBody`, `getQuery` available without imports          |
| **Built-in WebSocket**     | First-class WebSocket support via `defineWebSocketHandler`                      |
| **Tasks & Scheduled Jobs** | Built-in task system for background work                                        |
| **Storage abstraction**    | Unified KV storage API (useful for caching)                                     |
| **Dev experience**         | HMR in development, type-safe route params                                      |

## Design Decisions

| Decision   | Choice                                                |
| ---------- | ----------------------------------------------------- |
| Framework  | Nitro (universal, file-based routing, UnJS ecosystem) |
| WebSocket  | Nitro's built-in WebSocket support via `crossws`      |
| Auth       | Bearer tokens, optional API key fallback              |
| Versioning | URL prefix `/api/v1/` via nested route folders        |
| Errors     | RFC 7807 problem details format                       |

## File Structure

Nitro uses file-based routing. Routes in `routes/` map directly to URL paths.

```
packages/server/
├── package.json
├── nitro.config.ts           # Nitro configuration
├── tsconfig.json
├── README.md
├── routes/
│   ├── health.ts             # GET /health
│   ├── ready.ts              # GET /ready
│   ├── _ws.ts                # WebSocket handler (special Nitro convention)
│   └── api/
│       └── v1/
│           ├── issues/
│           │   ├── index.ts          # GET /api/v1/issues
│           │   ├── index.post.ts     # POST /api/v1/issues/parse
│           │   └── [id].ts           # GET/PATCH /api/v1/issues/:id
│           ├── agents/
│           │   ├── index.ts          # GET /api/v1/agents
│           │   ├── index.post.ts     # POST /api/v1/agents (spawn)
│           │   ├── [issueId]/
│           │   │   ├── index.ts      # GET /api/v1/agents/:issueId
│           │   │   ├── index.delete.ts   # DELETE /api/v1/agents/:issueId
│           │   │   └── message.post.ts   # POST /api/v1/agents/:issueId/message
│           ├── notifications/
│           │   ├── index.ts          # GET /api/v1/notifications
│           │   ├── acknowledge.post.ts   # POST /api/v1/notifications/acknowledge
│           │   └── [id]/
│           │       └── acknowledge.post.ts  # POST /api/v1/notifications/:id/acknowledge
│           ├── memory/
│           │   ├── search.post.ts    # POST /api/v1/memory/search
│           │   └── [issueId]/
│           │       ├── context.ts    # GET /api/v1/memory/:issueId/context
│           │       └── append.post.ts    # POST /api/v1/memory/:issueId/append
│           └── config/
│               ├── index.ts          # GET /api/v1/config
│               └── plugins.ts        # GET /api/v1/config/plugins
├── middleware/
│   ├── 01.auth.ts            # Auth middleware (runs on /api/**)
│   └── 02.error.ts           # Error handling middleware
├── plugins/
│   ├── workhorse.ts          # Inject WorkhorseContext into event.context
│   └── hooks.ts              # Subscribe to Workhorse hooks for WebSocket broadcasts
├── utils/
│   ├── ws-manager.ts         # WebSocket connection & subscription management
│   ├── serialize.ts          # Agent/issue serialization helpers
│   └── errors.ts             # RFC 7807 error helpers
└── __tests__/
    ├── routes.test.ts
    ├── ws.test.ts
    └── middleware.test.ts
```

## Config Schema

```typescript
// config.ts
import { z } from "zod/v4";

export const ServerConfigSchema = z.object({
  host: z.string().default("127.0.0.1"),
  port: z.number().default(3847),
  cors: z
    .object({
      origin: z.union([z.string(), z.array(z.string())]).default("*"),
      credentials: z.boolean().default(false),
    })
    .default({}),
  auth: z
    .object({
      enabled: z.boolean().default(true),
      apiKeys: z.array(z.string()).default([]),
      tokenSecret: z.string().optional(), // For JWT validation
    })
    .default({}),
  rateLimit: z
    .object({
      enabled: z.boolean().default(true),
      maxRequests: z.number().default(100),
      windowMs: z.number().default(60000), // 1 minute
    })
    .default({}),
});

export type ServerConfig = z.infer<typeof ServerConfigSchema>;
```

**TOML config:**

```toml
[server]
host = "127.0.0.1"
port = 3847

[server.cors]
origin = ["http://localhost:3000", "https://dashboard.example.com"]
credentials = true

[server.auth]
enabled = true
api_keys = ["wh_key_abc123", "wh_key_xyz789"]

[server.rate_limit]
enabled = true
max_requests = 100
window_ms = 60000
```

## Nitro Configuration

```typescript
// nitro.config.ts
import { defineNitroConfig } from "nitropack/config";

export default defineNitroConfig({
  // Enable WebSocket support
  experimental: {
    websocket: true,
  },

  // Runtime config (accessible via useRuntimeConfig())
  runtimeConfig: {
    host: "127.0.0.1",
    port: 3847,
    auth: {
      enabled: true,
      apiKeys: [],
    },
  },

  // CORS
  routeRules: {
    "/api/**": {
      cors: true,
      headers: {
        "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
        "Access-Control-Allow-Headers":
          "Authorization, X-API-Key, Content-Type",
      },
    },
  },

  // Presets for different deployment targets
  // bun, node-server, cloudflare, vercel, etc.
  preset: "bun",
});
```

## Nitro Plugin: Workhorse Context

Nitro plugins run at server startup. We use one to inject the WorkhorseContext:

```typescript
// plugins/workhorse.ts
import { type WorkhorseContext, bootstrap } from "workhorse-core";
import { githubPlugin } from "workhorse-plugin-github";
import { jiraPlugin } from "workhorse-plugin-jira";
import { piAdapterPlugin } from "workhorse-plugin-pi-adapter";

let workhorse: WorkhorseContext | null = null;

export default defineNitroPlugin(async (nitroApp) => {
  // Bootstrap Workhorse once at server startup
  workhorse = await bootstrap({
    plugins: [piAdapterPlugin, jiraPlugin, githubPlugin],
  });

  // Make available to all event handlers via event.context
  nitroApp.hooks.hook("request", (event) => {
    event.context.workhorse = workhorse;
  });

  // Cleanup on shutdown
  nitroApp.hooks.hook("close", async () => {
    await workhorse?.shutdown();
  });
});

// Type augmentation for event.context
declare module "h3" {
  interface H3EventContext {
    workhorse: WorkhorseContext;
  }
}
```

## Nitro Plugin: WebSocket Broadcasts

Subscribe to Workhorse hooks and broadcast to WebSocket clients:

```typescript
// plugins/hooks.ts
import { wsManager } from "../utils/ws-manager";

export default defineNitroPlugin((nitroApp) => {
  // Wait for workhorse plugin to initialize
  nitroApp.hooks.hook("request", (event) => {
    const { hooks } = event.context.workhorse;

    // Only subscribe once
    if ((hooks as any).__wsSubscribed) return;
    (hooks as any).__wsSubscribed = true;

    hooks.on("agent.output", (data) => {
      wsManager.broadcast("agents", "agent.output", data);
    });

    hooks.on("notification.created", (data) => {
      wsManager.broadcast("notifications", "notification.created", data);
    });

    hooks.on("orchestrator.spawn.post", ({ adapter }) => {
      wsManager.broadcast("agents", "agent.spawned", {
        issueId: adapter.issueId,
        harness: adapter.harness,
      });
    });

    hooks.on("orchestrator.stop.post", ({ adapter }) => {
      wsManager.broadcast("agents", "agent.stopped", {
        issueId: adapter.issueId,
      });
    });

    hooks.on("issue.status_changed", (data) => {
      wsManager.broadcast("issues", "issue.status_changed", data);
    });
  });
});
```

## WebSocket Handler

Nitro has first-class WebSocket support via `defineWebSocketHandler`:

```typescript
// routes/_ws.ts
import { wsManager } from "../utils/ws-manager";

export default defineWebSocketHandler({
  open(peer) {
    const connId = crypto.randomUUID();
    peer.ctx.connId = connId;
    wsManager.addConnection(connId, peer);
    console.log(`WebSocket connected: ${connId}`);
  },

  message(peer, message) {
    const connId = peer.ctx.connId as string;
    const msg = JSON.parse(message.text());

    switch (msg.type) {
      case "subscribe":
        wsManager.subscribe(connId, msg.channels);
        peer.send(
          JSON.stringify({ type: "subscribed", channels: msg.channels }),
        );
        break;

      case "unsubscribe":
        wsManager.unsubscribe(connId, msg.channels);
        peer.send(
          JSON.stringify({ type: "unsubscribed", channels: msg.channels }),
        );
        break;

      case "ping":
        peer.send(JSON.stringify({ type: "pong" }));
        break;

      case "send_message":
        // Get workhorse from global (set by plugin)
        const workhorse = (globalThis as any).__workhorse;
        workhorse?.orchestrator
          .sendMessage(msg.issueId, msg.content)
          .catch((err: Error) => {
            peer.send(
              JSON.stringify({
                type: "error",
                code: "SEND_FAILED",
                message: err.message,
              }),
            );
          });
        break;
    }
  },

  close(peer) {
    const connId = peer.ctx.connId as string;
    wsManager.removeConnection(connId);
    console.log(`WebSocket disconnected: ${connId}`);
  },
});
```

## WebSocket Manager

```typescript
// utils/ws-manager.ts
import type { Peer } from "crossws";

interface Connection {
  peer: Peer;
  subscriptions: Set<string>;
}

class WebSocketManager {
  private connections = new Map<string, Connection>();

  addConnection(id: string, peer: Peer): void {
    this.connections.set(id, { peer, subscriptions: new Set() });
  }

  removeConnection(id: string): void {
    this.connections.delete(id);
  }

  subscribe(id: string, channels: string[]): void {
    const conn = this.connections.get(id);
    if (conn) {
      channels.forEach((ch) => conn.subscriptions.add(ch));
    }
  }

  unsubscribe(id: string, channels: string[]): void {
    const conn = this.connections.get(id);
    if (conn) {
      channels.forEach((ch) => conn.subscriptions.delete(ch));
    }
  }

  broadcast(channel: string, event: string, data: unknown): void {
    const message = JSON.stringify({ type: "event", channel, event, data });

    for (const conn of this.connections.values()) {
      // Check if subscribed to channel or channel:issueId
      const issueId = (data as any)?.issueId;
      const shouldSend =
        conn.subscriptions.has(channel) ||
        (issueId && conn.subscriptions.has(`${channel}:${issueId}`));

      if (shouldSend) {
        conn.peer.send(message);
      }
    }
  }

  closeAll(): void {
    for (const conn of this.connections.values()) {
      conn.peer.close();
    }
    this.connections.clear();
  }
}

export const wsManager = new WebSocketManager();
```

## REST API Routes

Nitro uses file-based routing with `defineEventHandler`. Each file exports a handler.

### Issues

```typescript
// routes/api/v1/issues/index.ts
// GET /api/v1/issues - List issues
export default defineEventHandler(async (event) => {
  const { workhorse } = event.context;
  const query = getQuery(event);

  const status = query.status as string | undefined;
  const limit = Number(query.limit || 50);
  const offset = Number(query.offset || 0);

  const issues = await workhorse.db.issues.findMany({
    where: status ? { status } : undefined,
    limit,
    offset,
    orderBy: { createdAt: "desc" },
  });

  return { issues, pagination: { limit, offset } };
});
```

```typescript
// routes/api/v1/issues/[id].ts
// GET /api/v1/issues/:id - Get issue
// PATCH /api/v1/issues/:id - Update issue
export default defineEventHandler(async (event) => {
  const { workhorse } = event.context;
  const id = getRouterParam(event, "id")!;

  if (event.method === "GET") {
    const issue = await workhorse.db.issues.findByExternalId(id);
    if (!issue) {
      throw createError({ statusCode: 404, message: "Issue not found" });
    }
    return issue;
  }

  if (event.method === "PATCH") {
    const body = await readBody(event);
    const issue = await workhorse.db.issues.update(id, body);
    return issue;
  }
});
```

```typescript
// routes/api/v1/issues/parse.post.ts
// POST /api/v1/issues/parse - Parse issue identifier
export default defineEventHandler(async (event) => {
  const { workhorse } = event.context;
  const { input } = await readBody(event);

  const parsed = await workhorse.tracker.parse(input);
  return parsed;
});
```

### Agents

```typescript
// routes/api/v1/agents/index.ts
// GET /api/v1/agents - List running agents
export default defineEventHandler((event) => {
  const { workhorse } = event.context;
  const agents = workhorse.orchestrator.getAll().map(serializeAgent);
  return { agents };
});
```

```typescript
// routes/api/v1/agents/index.post.ts
// POST /api/v1/agents - Spawn agent
export default defineEventHandler(async (event) => {
  const { workhorse } = event.context;
  const body = await readBody(event);

  // Parse the issue first
  const parsedIssue = await workhorse.tracker.parse(body.issue);

  const adapter = await workhorse.orchestrator.spawn({
    issue: parsedIssue,
    harness: body.harness,
    model: body.model,
    baseBranch: body.baseBranch ?? "main",
    repoPath: body.repoPath ?? process.cwd(),
    prompt: body.prompt,
  });

  setResponseStatus(event, 201);
  return serializeAgent(adapter);
});
```

```typescript
// routes/api/v1/agents/[issueId]/index.ts
// GET /api/v1/agents/:issueId - Get agent status
export default defineEventHandler((event) => {
  const { workhorse } = event.context;
  const issueId = getRouterParam(event, "issueId")!;

  const agent = workhorse.orchestrator.getAgent(issueId);
  if (!agent) {
    throw createError({ statusCode: 404, message: "Agent not found" });
  }
  return serializeAgent(agent);
});
```

```typescript
// routes/api/v1/agents/[issueId]/index.delete.ts
// DELETE /api/v1/agents/:issueId - Stop agent
export default defineEventHandler(async (event) => {
  const { workhorse } = event.context;
  const issueId = getRouterParam(event, "issueId")!;
  const query = getQuery(event);
  const removeWorktree = query.removeWorktree === "true";

  await workhorse.orchestrator.stop(issueId, { removeWorktree });
  return { success: true };
});
```

```typescript
// routes/api/v1/agents/[issueId]/message.post.ts
// POST /api/v1/agents/:issueId/message - Send message to agent
export default defineEventHandler(async (event) => {
  const { workhorse } = event.context;
  const issueId = getRouterParam(event, "issueId")!;
  const { content } = await readBody(event);

  await workhorse.orchestrator.sendMessage(issueId, content);
  return { success: true };
});
```

```typescript
// utils/serialize.ts
import type { AgentAdapter } from "workhorse-core";

export function serializeAgent(agent: AgentAdapter) {
  return {
    issueId: agent.issueId,
    harness: agent.harness,
    state: agent.state,
    worktreePath: agent.worktreePath,
    isRunning: agent.isRunning(),
  };
}
```

### Notifications

```typescript
// routes/api/v1/notifications/index.ts
// GET /api/v1/notifications - List notifications
export default defineEventHandler(async (event) => {
  const { workhorse } = event.context;
  const query = getQuery(event);

  const notifications = await workhorse.memory.notifications.list({
    issueId: query.issueId as string | undefined,
    status: query.status as "pending" | "acknowledged" | undefined,
    limit: Number(query.limit || 50),
  });

  return { notifications };
});
```

```typescript
// routes/api/v1/notifications/acknowledge.post.ts
// POST /api/v1/notifications/acknowledge - Batch acknowledge
export default defineEventHandler(async (event) => {
  const { workhorse } = event.context;
  const { ids } = await readBody(event);

  await workhorse.memory.notifications.acknowledge(ids);
  return { success: true, count: ids.length };
});
```

```typescript
// routes/api/v1/notifications/[id]/acknowledge.post.ts
// POST /api/v1/notifications/:id/acknowledge - Acknowledge single
export default defineEventHandler(async (event) => {
  const { workhorse } = event.context;
  const id = getRouterParam(event, "id")!;

  await workhorse.memory.notifications.acknowledge([id]);
  return { success: true };
});
```

### Memory

```typescript
// routes/api/v1/memory/[issueId]/context.ts
// GET /api/v1/memory/:issueId/context - Get L1 context
export default defineEventHandler(async (event) => {
  const { workhorse } = event.context;
  const issueId = getRouterParam(event, "issueId")!;

  const context = await workhorse.memory.l1.getContext(issueId);
  return { context };
});
```

```typescript
// routes/api/v1/memory/search.post.ts
// POST /api/v1/memory/search - Semantic search (L2)
export default defineEventHandler(async (event) => {
  const { workhorse } = event.context;
  const { query, issueId, limit = 10 } = await readBody(event);

  const results = await workhorse.memory.l2.search(query, { issueId, limit });
  return { results };
});
```

```typescript
// routes/api/v1/memory/[issueId]/append.post.ts
// POST /api/v1/memory/:issueId/append - Append to L1 context
export default defineEventHandler(async (event) => {
  const { workhorse } = event.context;
  const issueId = getRouterParam(event, "issueId")!;
  const { content } = await readBody(event);

  await workhorse.memory.l1.append(issueId, content);
  return { success: true };
});
```

### Config

```typescript
// routes/api/v1/config/index.ts
// GET /api/v1/config - Get current config (redacted)
export default defineEventHandler((event) => {
  const { workhorse } = event.context;
  const config = workhorse.config;

  // Redact sensitive fields
  return {
    ...config,
    plugins: Object.fromEntries(
      Object.entries(config.plugins ?? {}).map(([k, v]) => [
        k,
        redactSensitive(v as Record<string, unknown>),
      ]),
    ),
  };
});

function redactSensitive(
  obj: Record<string, unknown>,
): Record<string, unknown> {
  const sensitiveKeys = ["token", "secret", "key", "password", "apiKey"];
  return Object.fromEntries(
    Object.entries(obj).map(([k, v]) => [
      k,
      sensitiveKeys.some((s) => k.toLowerCase().includes(s)) ? "[REDACTED]" : v,
    ]),
  );
}
```

```typescript
// routes/api/v1/config/plugins.ts
// GET /api/v1/config/plugins - List enabled plugins
export default defineEventHandler((event) => {
  const { workhorse } = event.context;

  const plugins = workhorse.plugins.list().map((p) => ({
    name: p.manifest.name,
    version: p.manifest.version,
    description: p.manifest.description,
    capabilities: p.manifest.capabilities,
  }));

  return { plugins };
});
```

### Health Checks

```typescript
// routes/health.ts
// GET /health - Health check (no auth required)
export default defineEventHandler(() => {
  return { status: "ok" };
});
```

````typescript
// routes/ready.ts
// GET /ready - Readiness check (no auth required)
export default defineEventHandler(async (event) => {
  const { workhorse } = event.context;
  const ready = await workhorse.db.isConnected();

  if (!ready) {
    setResponseStatus(event, 503);
  }
  return { ready };
});

## WebSocket Protocol

### Message Types

```typescript
// ws/protocol.ts
export type ClientMessage =
  | { type: "subscribe"; channels: string[] }
  | { type: "unsubscribe"; channels: string[] }
  | { type: "ping" }
  | { type: "send_message"; issueId: string; content: string };

export type ServerMessage =
  | { type: "subscribed"; channels: string[] }
  | { type: "unsubscribed"; channels: string[] }
  | { type: "pong" }
  | { type: "error"; code: string; message: string }
  | { type: "event"; channel: string; event: string; data: unknown };

// Channels:
// - "agents" — all agent events
// - "agents:{issueId}" — specific agent events
// - "notifications" — all notifications
// - "notifications:{issueId}" — specific issue notifications
// - "issues" — all issue changes
````

### WebSocket Handler

```typescript
// ws/index.ts
import type { Context } from "hono";
import type { WorkhorseContext } from "workhorse-core";

import { ClientMessage, ServerMessage } from "./protocol";

interface Connection {
  id: string;
  ws: WebSocket;
  subscriptions: Set<string>;
}

export function createWebSocketHandler(workhorse: WorkhorseContext) {
  const connections = new Map<string, Connection>();

  function upgrade(c: Context) {
    const { upgradeWebSocket } = c.env;

    return upgradeWebSocket((ws) => {
      const connId = crypto.randomUUID();
      const conn: Connection = {
        id: connId,
        ws,
        subscriptions: new Set(),
      };
      connections.set(connId, conn);

      ws.onmessage = (event) => {
        const msg = JSON.parse(event.data) as ClientMessage;
        handleMessage(conn, msg);
      };

      ws.onclose = () => {
        connections.delete(connId);
      };
    });
  }

  function handleMessage(conn: Connection, msg: ClientMessage): void {
    switch (msg.type) {
      case "subscribe":
        msg.channels.forEach((ch) => conn.subscriptions.add(ch));
        send(conn, { type: "subscribed", channels: msg.channels });
        break;

      case "unsubscribe":
        msg.channels.forEach((ch) => conn.subscriptions.delete(ch));
        send(conn, { type: "unsubscribed", channels: msg.channels });
        break;

      case "ping":
        send(conn, { type: "pong" });
        break;

      case "send_message":
        workhorse.orchestrator
          .sendMessage(msg.issueId, msg.content)
          .catch((err) => {
            send(conn, {
              type: "error",
              code: "SEND_FAILED",
              message: err.message,
            });
          });
        break;
    }
  }

  function send(conn: Connection, msg: ServerMessage): void {
    conn.ws.send(JSON.stringify(msg));
  }

  function broadcast(event: string, data: unknown): void {
    const [category, issueId] = parseEvent(event);

    for (const conn of connections.values()) {
      // Check if connection is subscribed to this event
      const shouldSend =
        conn.subscriptions.has(category) ||
        (issueId && conn.subscriptions.has(`${category}:${issueId}`));

      if (shouldSend) {
        send(conn, { type: "event", channel: category, event, data });
      }
    }
  }

  function closeAll(): void {
    for (const conn of connections.values()) {
      conn.ws.close();
    }
    connections.clear();
  }

  return { upgrade, broadcast, closeAll };
}

function parseEvent(event: string): [string, string | undefined] {
  // "agent.output" -> ["agents", undefined]
  // "notification.created" with issueId -> ["notifications", issueId]
  const mapping: Record<string, string> = {
    "agent.output": "agents",
    "agent.spawned": "agents",
    "agent.stopped": "agents",
    "notification.created": "notifications",
    "issue.status_changed": "issues",
  };
  return [mapping[event] ?? "unknown", (event as any).issueId];
}
```

## Middleware

Nitro middleware are files in `middleware/` that run before route handlers. Files are sorted alphabetically, so prefix with numbers for ordering.

### Authentication

```typescript
// middleware/01.auth.ts
// Runs on /api/** routes only
export default defineEventHandler((event) => {
  // Skip auth for health checks
  if (event.path === "/health" || event.path === "/ready") return;

  // Skip non-API routes
  if (!event.path.startsWith("/api/")) return;

  const config = useRuntimeConfig(event);
  if (!config.auth.enabled) return;

  const authHeader = getHeader(event, "Authorization");
  const apiKey = getHeader(event, "X-API-Key");

  // Check API key
  if (apiKey && config.auth.apiKeys.includes(apiKey)) {
    return; // Continue to route handler
  }

  // Check Bearer token
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    if (config.auth.apiKeys.includes(token)) {
      return; // Continue to route handler
    }
  }

  throw createError({
    statusCode: 401,
    statusMessage: "Unauthorized",
    data: {
      type: "https://api.workhorse.dev/errors/unauthorized",
      title: "Unauthorized",
      detail: "Invalid or missing authentication",
    },
  });
});
```

### Error Handling (RFC 7807)

```typescript
// middleware/02.error.ts
import { WorkhorseError } from "workhorse-core";

export default defineEventHandler((event) => {
  // This middleware sets up error handling for the request
  event.context._errorHandler = true;
});

// Error handler hook in nitro.config.ts
// Or use onError in nitro.config.ts:
```

```typescript
// nitro.config.ts (add to existing config)
export default defineNitroConfig({
  // ... other config

  hooks: {
    error(error, { event }) {
      if (error instanceof WorkhorseError) {
        return {
          type: `https://api.workhorse.dev/errors/${error.code}`,
          title: error.name,
          status: error.status ?? 500,
          detail: error.message,
          hint: error.hint,
        };
      }

      return {
        type: "https://api.workhorse.dev/errors/internal",
        title: "Internal Server Error",
        status: 500,
        detail: error instanceof Error ? error.message : "Unknown error",
      };
    },
  },
});
```

Alternatively, use a custom error utility:

```typescript
// utils/errors.ts
import { WorkhorseError } from "workhorse-core";

export function createProblemError(
  statusCode: number,
  code: string,
  message: string,
  hint?: string,
) {
  return createError({
    statusCode,
    statusMessage: message,
    data: {
      type: `https://api.workhorse.dev/errors/${code}`,
      title: code.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
      status: statusCode,
      detail: message,
      hint,
    },
  });
}

export function handleError(err: unknown) {
  if (err instanceof WorkhorseError) {
    throw createProblemError(
      err.status ?? 500,
      err.code,
      err.message,
      err.hint,
    );
  }
  throw err;
}
```

## Plugin Integration

Plugins can extend the server with custom routes by placing files in a special directory or via hooks:

### Option 1: Plugin Route Directory

Plugins can export route handlers that get registered at server startup:

```typescript
// In workhorse-plugin-my-feature/src/routes/status.ts
export default defineEventHandler((event) => {
  return { status: "my-feature is running" };
});
```

```typescript
// In workhorse-plugin-my-feature/src/index.ts
import { definePlugin } from "workhorse-core";

export default definePlugin({
  manifest: {
    name: "my-feature",
    version: "1.0.0",
    capabilities: {
      routes: ["/api/v1/my-feature"], // Declare route prefix
    },
  },
  setup(ctx) {
    // Routes are auto-registered from plugin's routes/ directory
  },
});
```

### Option 2: Programmatic Route Registration

For dynamic routes, use the `server.routes.registering` hook:

```typescript
// In plugin setup
import { definePlugin, useWorkhorse } from "workhorse-core";

export default definePlugin({
  manifest: { name: "my-plugin", version: "1.0.0" },
  setup() {
    const { hooks } = useWorkhorse();

    // Register routes when server is setting up
    hooks.on("server.routes.registering", ({ router }) => {
      router.get(
        "/api/v1/my-plugin/status",
        defineEventHandler(() => {
          return { hello: "world" };
        }),
      );

      router.post(
        "/api/v1/my-plugin/action",
        defineEventHandler(async (event) => {
          const body = await readBody(event);
          // ... do something
          return { success: true };
        }),
      );
    });
  },
});
```

## Usage

### Development

```bash
cd packages/server
bun run dev    # Starts Nitro dev server with HMR
```

### Production Build

```bash
bun run build  # Builds for configured preset (bun by default)
bun run start  # Runs production server
```

### Standalone Server Entry

The Nitro plugin handles bootstrapping, but you can also create a custom entry:

```typescript
// packages/server/server.ts (optional custom entry)
// Nitro handles this automatically via plugins/workhorse.ts
```

### With TUI/CLI

The server can run alongside the TUI. Configure in workhorse config:

```toml
[server]
enabled = true
port = 3847

[server.auth]
api_keys = ["wh_key_abc123"]
```

```typescript
// In TUI index.ts
import { bootstrap } from "workhorse-core";

const workhorse = await bootstrap({ plugins: [...] });

// Server is started automatically if server.enabled = true
// Nitro handles the lifecycle
```

### Deployment Presets

Nitro supports multiple deployment targets via presets:

```typescript
// nitro.config.ts
export default defineNitroConfig({
  // Local development
  preset: "bun", // or "node-server"

  // Serverless
  // preset: "vercel",
  // preset: "cloudflare",
  // preset: "netlify",
  // preset: "aws-lambda",

  // Edge
  // preset: "cloudflare-pages",
  // preset: "vercel-edge",
  // preset: "deno-deploy",
});
```

## API Reference

### Endpoints

| Method | Path                                    | Description                    |
| ------ | --------------------------------------- | ------------------------------ |
| GET    | `/health`                               | Health check                   |
| GET    | `/ready`                                | Readiness check (DB connected) |
| GET    | `/api/v1/issues`                        | List issues                    |
| GET    | `/api/v1/issues/:id`                    | Get issue details              |
| POST   | `/api/v1/issues/parse`                  | Parse issue identifier         |
| PATCH  | `/api/v1/issues/:id`                    | Update issue                   |
| GET    | `/api/v1/agents`                        | List running agents            |
| GET    | `/api/v1/agents/:issueId`               | Get agent status               |
| POST   | `/api/v1/agents`                        | Spawn agent                    |
| POST   | `/api/v1/agents/:issueId/message`       | Send message to agent          |
| DELETE | `/api/v1/agents/:issueId`               | Stop agent                     |
| GET    | `/api/v1/notifications`                 | List notifications             |
| POST   | `/api/v1/notifications/:id/acknowledge` | Acknowledge notification       |
| POST   | `/api/v1/notifications/acknowledge`     | Batch acknowledge              |
| GET    | `/api/v1/memory/:issueId/context`       | Get L1 context                 |
| POST   | `/api/v1/memory/search`                 | Semantic search                |
| POST   | `/api/v1/memory/:issueId/append`        | Append to context              |
| GET    | `/api/v1/config`                        | Get config (redacted)          |
| GET    | `/api/v1/config/plugins`                | List plugins                   |
| WS     | `/ws`                                   | WebSocket connection           |

### WebSocket Channels

| Channel                   | Events                                           |
| ------------------------- | ------------------------------------------------ |
| `agents`                  | `agent.output`, `agent.spawned`, `agent.stopped` |
| `agents:{issueId}`        | Same, filtered by issue                          |
| `notifications`           | `notification.created`                           |
| `notifications:{issueId}` | Same, filtered by issue                          |
| `issues`                  | `issue.status_changed`                           |

## package.json

```json
{
  "name": "workhorse-server",
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "nitro dev",
    "build": "nitro build",
    "start": "node .output/server/index.mjs",
    "test": "bun test",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "workhorse-core": "workspace:*",
    "workhorse-plugin-pi-adapter": "workspace:*",
    "workhorse-plugin-jira": "workspace:*",
    "workhorse-plugin-github": "workspace:*",
    "nitro": "^2",
    "h3": "^1",
    "zod": "^3"
  },
  "devDependencies": {
    "@types/bun": "latest",
    "typescript": "^5"
  }
}
```

## Tasks

- [ ] Create `packages/server/` package structure
- [ ] Set up `nitro.config.ts` with WebSocket support and presets
- [ ] Implement Nitro plugin for WorkhorseContext injection (`plugins/workhorse.ts`)
- [ ] Implement Nitro plugin for hook subscriptions (`plugins/hooks.ts`)
- [ ] Implement auth middleware (`middleware/01.auth.ts`)
- [ ] Implement WebSocket manager (`utils/ws-manager.ts`)
- [ ] Implement WebSocket handler (`routes/_ws.ts`)
- [ ] Implement REST routes:
  - [ ] Health checks (`routes/health.ts`, `routes/ready.ts`)
  - [ ] Issues (`routes/api/v1/issues/`)
  - [ ] Agents (`routes/api/v1/agents/`)
  - [ ] Notifications (`routes/api/v1/notifications/`)
  - [ ] Memory (`routes/api/v1/memory/`)
  - [ ] Config (`routes/api/v1/config/`)
- [ ] Add hook for plugins to register custom routes (`server.routes.registering`)
- [ ] Add rate limiting (optional, via Nitro's built-in or custom middleware)
- [ ] Add OpenAPI spec generation (optional, via `nitro-openapi`)
- [ ] Write tests for routes and WebSocket
- [ ] Update PROGRESS.md

## Future Enhancements

- **OpenAPI documentation** — Auto-generate via `nitro-openapi` or `unhead`
- **GraphQL endpoint** — For complex queries (alternative to REST)
- **SSE fallback** — Via `eventStream()` from h3 for environments without WebSocket
- **Metrics endpoint** — Prometheus-compatible `/metrics` via Nitro tasks
- **Admin UI** — Built-in dashboard via Nitro's static asset serving
- **Multi-tenant support** — Isolated contexts per API key
- **Rate limiting** — Via `unstorage` + sliding window algorithm
- **Caching** — Via Nitro's built-in cache API with `defineCachedEventHandler`
- **Background tasks** — Via Nitro's scheduled tasks for cleanup, health checks
