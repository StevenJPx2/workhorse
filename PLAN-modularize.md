# Plan: Modularize Workhorse Architecture

## Overview
This plan refactors Workhorse from a monolithic worker into a modular architecture where each concern is a separate package. The worker becomes a thin shell that composes everything together.

**Key technologies:**
- **Alchemy** — Infrastructure-as-Effects for Cloudflare deployment
- **Drizzle** — TypeScript ORM for D1 database
- **Valibot** — Schema validation for agent outputs
- **Effect** — Type-safe functional programming (used by Alchemy)

**Architecture principles:**
- Each package has a single responsibility
- Packages are composable and testable in isolation
- The worker is just the deployment boundary
- Workflows own their dependencies (plugins)
- Infrastructure is code (Alchemy), not config (wrangler.toml)

## References
- [Alchemy](https://alchemy.run) — Infrastructure-as-Effects for Cloudflare
- [Alchemy Docs](https://alchemy.run/what-is-alchemy) — What is Alchemy?
- [Alchemy GitHub](https://github.com/alchemy-run/alchemy) — Source code
- [Alchemy GitHub Action](https://github.com/alchemy-run/alchemy#github-action) — Automated deployment
- [Drizzle ORM](https://orm.drizzle.team) — TypeScript ORM with D1 support
- [Drizzle D1 Guide](https://orm.drizzle.team/docs/get-started/d1-new) — Get started with D1
- [Valibot](https://valibot.dev) — TypeScript schema validation
- [Cloudflare D1](https://developers.cloudflare.com/d1/) — Serverless SQL database
- [Cloudflare Workers](https://developers.cloudflare.com/workers/) — Serverless platform
- [Cloudflare AI Search](https://developers.cloudflare.com/ai-search/) — Semantic search (replaces Magic Context)

## Target Architecture

```
@workhorse/api         # plugin contract: tool(), agent(), types
@workhorse/workflow    # core workflow execution: ctx.run(), routing, WorkflowContext
@workhorse/sandbox     # sandbox I/O + Code Mode (agent-run, codemode)
@workhorse/agents      # agent management + fleet chat (agents, chat)
@workhorse/events      # event store + notification bus (events, notifications)
@workhorse/tickets     # ticket filing + self-healing (tickets, heal)
@workhorse/db          # database: D1 (Drizzle), tickets, scripts, escalations, traces
@workhorse/auth        # authentication: bearer tokens, OAuth
@workhorse/server      # HTTP routes + plugin composition (router, routes/*, plugins, refs, semindex, triggers)
plugins/*              # github, todo, search, browser, etc.
workflows/*            # coding, etc.
worker                 # entry point + alchemy + vite + deployment
```

## Key Design Decisions

### 1. `agent()` defines an agent for a workflow stage

```ts
import { agent } from "@workhorse/workflow";
import { read, grep, find, ls, bash } from "@workhorse/plugin-core";
import { browser_open, browser_screenshot, browser_record } from "@workhorse/plugin-browser";

const prWriter = agent({
  name: "pr-writer",
  model: "anthropic/claude-sonnet-4-6",
  instructions: "Update the PR body for the just-completed todo...",
  output: PR_WRITER_OUTPUT,  // valibot schema for entire output
  tools: (ctx) => {
    const tools = [read, grep, find, ls, bash];

    if (ctx.input.uiChanges) {
      tools.push(browser_open, browser_screenshot, browser_record);
    }

    return tools;
  },
  thinking: "low",
});
```

### 2. Tools are imported directly from plugins (not string references)

```ts
// Plugins export individual tools
export const browser_open = tool({ name: "browser_open", ... });
export const browser_screenshot = tool({ name: "browser_screenshot", ... });

// Agents import them directly
import { browser_open } from "@workhorse/plugin-browser";
```

### 3. `ctx.run()` executes an agent with explicit input

```ts
const impl = await ctx.run(prWriter, {
  input: { uiChanges: impl.output.control.uiChanges },
  upstream: [brief, plan],
});
```

**Signature:**
```ts
interface WorkflowContext {
  run(agent: AgentFactory, options?: {
    input?: Record<string, unknown>;
    upstream?: StageResult[];
  }): Promise<StageResult>;
}
```

### 4. Stage output is a valibot schema (runtime + compile-time)

```ts
import * as v from "valibot";

const PR_WRITER_OUTPUT = v.object({
  control: v.object({
    // any control fields for this stage
  }),
  analysis: v.string(),
});

const IMPLEMENT_OUTPUT = v.object({
  control: v.object({
    todoId: v.string(),
    uiChanges: v.boolean(),
    todosRemaining: v.number(),
  }),
  analysis: v.string(),
});
```

**StageResult is typed:**
```ts
interface StageResult {
  stageId: string;
  output: v.InferOutput<typeof stageOutput>;  // typed per stage
  stats?: { ... };
}
```

### 5. Each workflow is a package in `workflows/`

```
workflows/
  coding/
    package.json        # depends on @workhorse/workflow, @workhorse/api, plugins
    index.ts            # workflow definition
    agents/
      enricher.ts
      planner.ts
      coder.ts
      reviewer.ts
      writer.ts
      therapist.ts
```

**Each workflow package.json:**
```json
{
  "name": "@workhorse/workflow-coding",
  "dependencies": {
    "@workhorse/workflow": "workspace:*",
    "@workhorse/api": "workspace:*",
    "@workhorse/plugin-github": "workspace:*",
    "@workhorse/plugin-todo": "workspace:*",
    "@workhorse/plugin-browser": "workspace:*"
  }
}
```

### 6. gh-image for PR image uploads

PR writer uses `gh-image` (GitHub CLI extension) to embed screenshots in PR descriptions. Images are stored in GitHub's user-attachments (private to the repo, no external hosting needed).

**PR writer agent tools:**
```ts
const prWriter = agent({
  name: "pr-writer",
  tools: (ctx) => {
    const tools = [read, grep, find, ls, bash];

    if (ctx.input.uiChanges) {
      tools.push(browser_screenshot, browser_record, gh_image);
    }

    return tools;
  },
});
```

**`gh_image` tool:**
```ts
const gh_image = tool({
  name: "gh_image",
  description: "Upload an image to GitHub's user-attachments for embedding in PRs",
  input: v.object({ path: v.string() }),
  run: async ({ input }) => {
    const result = await sandbox.exec(`gh image ${input.path} --repo ${repo}`);
    return result.stdout; // Returns: ![name](https://github.com/user-attachments/assets/...)
  },
});
```

**What this replaces:**
- `imgup` for PR image uploads (no external hosting needed)
- `upload_image` for PRs (gh-image is GitHub-native)

**What stays:**
- `upload_image` (imgup) — for external image sharing
- `upload_text` (paste.rs, etc.) — for external text hosting

**Sandbox changes:**
- Add `gh` CLI + `gh-image` extension to Dockerfile
- Remove `imgup` from Dockerfile (no Python, no uv)
- Simpler sandbox image

### 7. AI Search replaces Magic Context

Magic Context (per-repo agent memory) is replaced by Cloudflare AI Search. This removes the local embedding model (~90MB ONNX) from the sandbox image and eliminates context.db persistence/restoration.

**What AI Search provides:**
- Per-repo memory (namespace by `mc:<owner/repo>`)
- Fleet-wide institutional knowledge (distilled traces)
- Hybrid vector+keyword search
- Cloudflare-managed (no maintenance)

**What gets removed:**
- Magic Context from sandbox image
- `restoreMemory()` / `persistMemory()` from agent-run.ts
- Local embedding model (~90MB ONNX)
- context.db persistence/restoration

**What stays:**
- `semindex` — plugin tooling for semantic search across registries (different concern)
- `search_fleet_knowledge` — fleet-wide trace search (already uses AI Search)

**Domain-specific features for codebase intelligence:**
- `search_code` — semantic search across source files
- `search_history` — search git history
- `search_tests` — search test results
- `search_docs` — search documentation
- `search_patterns` — search for patterns/conventions

### 8. Worker is thin shell + alchemy + vite + Dockerfile

```ts
// worker/src/index.ts
import { createServer } from "@workhorse/server";
import { coding } from "@workhorse/workflow-coding";

export default createServer({
  workflows: [coding],
});
```

**Worker structure:**
```
worker/
  src/
    index.ts
  sandbox/
    agent-browser.sh   # Browser wrapper (or move to plugins/browser)
    install.mjs        # Pi installer
    pi.json            # Pi packages
  Dockerfile           # Container image build (moved from sandbox/)
  alchemy.run.ts       # Infrastructure as code
  vite.config.ts       # Discovers workflows/
  package.json
```

**Dockerfile references:**
```dockerfile
COPY worker/sandbox/agent-browser.sh /usr/local/bin/agent-browser-wrapper
COPY worker/sandbox /opt/agent/sandbox
COPY workflows/coding/agents/*.md /root/.pi/agent/agents/
```

**Plus:**
- GitHub Actions (automated deployment)

## Package Breakdown

### `@workhorse/api` (refactor)
**Add:** `agent()` helper (like `tool()`)

**Exports:**
```ts
export function agent(spec: AgentSpec): AgentFactory;
export function tool(spec: ToolSpec): ToolFactory;
// ... existing exports
```

### `@workhorse/workflow` (refactor)
**Add:** Execution logic from `worker/src/workflow-run.ts`, `worker/src/flue-session.ts`

**Exports:**
```ts
export function workflow(spec: WorkflowSpec): WorkflowDef;
export function agent(spec: AgentSpec): AgentFactory;
export interface WorkflowContext {
  run(agent: AgentFactory, options?: {
    input?: Record<string, unknown>;
    upstream?: StageResult[];
  }): Promise<StageResult>;
  // ... existing
}
export interface StageResult {
  stageId: string;
  output: Record<string, unknown>;  // validated against stage's output schema
  stats?: { ... };
}
// ... existing exports (compile, validate, etc.)
```

### `@workhorse/sandbox` (new)
**Extract from:** `worker/src/agent-run.ts`, `worker/src/codemode.ts`

**Exports:**
```ts
export function sandboxDriver(env: Env, sandboxId: string): Driver;
export function injectAuth(env: Env, sandboxId: string, accessToken: string): Promise<void>;
export function injectBrowserConfig(env: Env, sandboxId: string): Promise<void>;
export function injectTicketContext(env: Env, sandboxId: string, ticketId: string, repo: string): Promise<void>;
export function restoreDepCache(env: Env, sandboxId: string, repo: string): Promise<string>;
export function saveDepCache(env: Env, sandboxId: string, repo: string): Promise<boolean>;
export function prepareWorkspace(env: Env, sandboxId: string, repo: string): Promise<void>;
export function checkoutTicketBranch(env: Env, sandboxId: string, repo: string, branch: string, githubToken: string): Promise<void>;
export function deliverBranch(env: Env, sandboxId: string, ticketId: string, repo: string, title: string): Promise<{ branch: string; diff: string; pushed: boolean }>;
export class ToolBridge extends WorkerEntrypoint<Env, ToolBridgeProps> { ... }
export function runCode(env: Env, props: ToolBridgeProps, code: string, args?: Record<string, string>): Promise<RunCodeResult>;
```

### `@workhorse/agents` (new)
**Extract from:** `worker/src/agents.ts`, `worker/src/chat.ts`

**Exports:**
```ts
export interface AgentBlock { ... }
export function getAgentBlock(env: Env, name: string): Promise<AgentBlock | null>;
export function listAgentBlocks(env: Env): Promise<AgentBlock[]>;
export function putAgentBlock(env: Env, block: Omit<AgentBlock, "updatedAt">): Promise<string | null>;
export function deleteAgentBlock(env: Env, name: string): Promise<void>;
export function seedAgentBlocks(env: Env): Promise<string[]>;
export function installAgentBlocks(env: Env, sandboxId: string): Promise<void>;
export function runFleetChat(env: Env, selfOrigin: string, messages: Array<{ role: string; content: string }>): Promise<{ ok: true; reply: string } | { ok: false; error: string; status: number }>;
```

### `@workhorse/events` (new)
**Extract from:** `worker/src/events.ts`, `worker/src/notifications.ts`

**Exports:**
```ts
// Events
export function appendEvents(env: Env, events: ExternalEvent[]): Promise<void>;
export function unconsumedEvents(env: Env, ticketId: string): Promise<ExternalEvent[]>;
export function consumeEvents(env: Env, ticketId: string): Promise<void>;
export function wakeTicket(env: Env, ticketId: string, attempts?: number): Promise<void>;

// Steering
export function appendSteer(env: Env, ticketId: string, message: string): Promise<void>;
export function pendingSteers(env: Env, ticketId: string): Promise<string[]>;
export function consumeSteers(env: Env, ticketId: string): Promise<void>;

// Notifications
export interface Notification { ... }
export function notify(env: Env, n: { ticketId: string; source: string; kind?: string; body: string; author?: string; urgent?: boolean }): Promise<Notification>;
export function unreadNotifications(env: Env, ticketId: string): Promise<Notification[]>;
export function listNotifications(env: Env, ticketId: string, limit?: number): Promise<Notification[]>;
export function markNotificationsRead(env: Env, ticketId: string, upToSeq: number): Promise<void>;
export function renderNotifications(items: Notification[]): string;
```

### `@workhorse/tickets` (new)
**Extract from:** `worker/src/tickets.ts`, `worker/src/heal.ts`

**Exports:**
```ts
export function fileTicket(env: Env, body: Partial<TicketParams> & { selfOrigin?: string }): Promise<FileTicketResult>;
export function resolveAttachments(env: Env, selfOrigin: string, attachments: Array<{ kind: string; ref: string }>): Promise<string>;
export function healTicket(env: Env, ticketId: string): Promise<{ ok: boolean; reason?: string; instance?: string }>;
```

### `@workhorse/auth` (new)
**Extract from:** `worker/src/index.ts` (auth logic)

**Exports:**
```ts
export function authenticate(request: Request, env: Env): AuthResult;
export interface AuthResult { master: boolean; scoped: boolean; }
```

### `@workhorse/db` (new)
**Extract from:** `worker/src/db.ts`, `worker/src/tickets.ts`

**Exports:**
```ts
// Tickets
export function getTicket(env: Env, id: string): Promise<TicketRecord | null>;
export function insertTicket(env: Env, rec: TicketRecord): Promise<void>;
export function patchTicket(env: Env, id: string, patch: Partial<TicketRecord>): Promise<...>;
export function listTickets(env: Env, status?: string): Promise<TicketRecord[]>;

// Scripts
export function getScript(env: Env, scope: string, name: string): Promise<ScriptRecord | null>;
export function listScripts(env: Env, repo?: string): Promise<ScriptRecord[]>;
export function upsertScript(env: Env, s: ScriptRecord): Promise<void>;
export function deleteScript(env: Env, scope: string, name: string): Promise<boolean>;
export function validateScript(s: unknown): string | null;

// Escalations
export function insertEscalation(env: Env, e: Escalation): Promise<void>;

// Traces
export function insertTraceIndex(env: Env, t: Trace): Promise<void>;
export function listTraceIndex(env: Env, ticketId: string): Promise<Trace[]>;
```

### `@workhorse/server` (new)
**Extract from:** `worker/src/router.ts`, `worker/src/routes/*`, `worker/src/plugins.ts`, `worker/src/refs.ts`, `worker/src/semindex.ts`, `worker/src/triggers.ts`

**Imports:** `@workhorse/auth`, `@workhorse/db`

**Exports:**
```ts
export function createServer(config: ServerConfig): ServerHandler;
export interface ServerConfig {
  workflows: WorkflowDef[];
  plugins: WorkhorsePlugin[];
}
export interface ServerHandler {
  fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response>;
  scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void>;
}
```

### `plugins/*` (refactor)
**Add:** Individual tool exports (not just `tools` array)

```ts
// plugins/browser/tools/browser_open.ts
export const browser_open = tool({ name: "browser_open", ... });

// plugins/browser/index.ts
export { browser_open, browser_screenshot, browser_record } from "./tools";
```

### `workflows/*` (new)
**Structure:**
```
workflows/
  coding/
    package.json
    index.ts
    agents/
      enricher.ts
      planner.ts
      coder.ts
      reviewer.ts
      writer.ts
      therapist.ts
```

### `worker` (refactor)
**Becomes thin shell + Dockerfile:**

```ts
import { createServer } from "@workhorse/server";
import { coding } from "@workhorse/workflow-coding";

export default createServer({
  workflows: [coding],
});
```

**Structure:**
```
worker/
  src/
    index.ts
  sandbox/
    agent-browser.sh   # Browser wrapper (or move to plugins/browser)
    install.mjs        # Pi installer
    pi.json            # Pi packages
  Dockerfile           # Container image build (moved from sandbox/)
  alchemy.run.ts       # Infrastructure as code
  vite.config.ts       # Discovers workflows/
  package.json
```

**Plus:**
- GitHub Actions (automated deployment)
- `alchemy.run.ts` (infrastructure as code)
- `vite.config.ts` (discovers workflows/)
- GitHub Actions (automated deployment)

## Coding Workflow Example

```ts
// workflows/coding/index.ts
import { workflow } from "@workhorse/workflow";
import { enricher } from "./agents/enricher";
import { planner } from "./agents/planner";
import { coder } from "./agents/coder";
import { reviewer } from "./agents/reviewer";
import { writer } from "./agents/writer";

export const coding = workflow({
  name: "coding",
  agents: [enricher, planner, coder, reviewer, writer],

  async run(ctx) {
    // 1. Enrich the task
    const brief = await ctx.run(enricher, {
      input: { task: ctx.task },
    });

    // 2. Plan the work
    const plan = await ctx.run(planner, {
      input: { task: ctx.task },
      upstream: [brief],
    });

    // 3. Per-todo loop
    let currentBody = plan.output.body;
    const completedTodos: string[] = [];

    for (const todo of plan.output.todos) {
      // 3a. Implement
      const impl = await ctx.run(coder, {
        input: { todo, body: currentBody },
        upstream: [brief, plan],
      });

      // 3b. Review (max 2 retries)
      let review = await ctx.run(reviewer, {
        upstream: [brief, plan, impl],
      });

      let retries = 0;
      while (review.output.control.verdict === "fail" && retries < 2) {
        const retry = await ctx.run(coder, {
          input: { todo, body: currentBody, feedback: review.output.analysis },
          upstream: [brief, plan, review],
        });
        review = await ctx.run(reviewer, {
          upstream: [brief, plan, retry],
        });
        retries++;
      }

      // 3c. Write PR body
      const prWrite = await ctx.run(writer, {
        input: { body: currentBody, uiChanges: impl.output.control.uiChanges },
        upstream: [brief, plan, impl, review],
      });
      currentBody = prWrite.output.body;
      completedTodos.push(todo.id);
    }

    // 4. Return final result
    return {
      outcome: "pr",
      body: currentBody,
      todosCompleted: completedTodos,
    };
  },
});
```

## Build and Deployment

### Build Process
```json
{
  "scripts": {
    "db:generate": "drizzle-kit generate",
    "db:push": "drizzle-kit push",
    "build": "alchemy build",
    "deploy": "alchemy deploy",
    "deploy:prod": "alchemy deploy --stage prod"
  }
}
```

### Deployment Order
1. `db:push` — run migrations (schema changes)
2. `build` — bundle worker with alchemy
3. `deploy` — deploy to Cloudflare

### Alchemy Infrastructure
```ts
// alchemy.run.ts
import * as Alchemy from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import * as Effect from "effect/Effect";

const DB = Cloudflare.D1.Database("workhorse");
const Worker = Cloudflare.Worker("workhorse", {
  main: "./worker/src/index.ts",
  env: { DB },
});

export default Alchemy.Stack(
  "Workhorse",
  { providers: Cloudflare.providers(), state: Cloudflare.state() },
  Effect.gen(function* () {
    const db = yield* DB;
    const worker = yield* Worker;
    return { url: worker.url };
  }),
);
```

### GitHub Actions
```yaml
# .github/workflows/deploy.yml
name: Deploy
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
      - run: bun install
      - run: bun run db:push
      - run: bun run build
      - uses: alchemy-run/alchemy@v1
        env:
          CLOUDFLARE_ACCOUNT_ID: ${{ vars.CLOUDFLARE_ACCOUNT_ID }}
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

### Package Build Concerns
| Package | Build | Deploy |
|---------|-------|--------|
| `@workhorse/api` | None (pure TS types) | N/A |
| `@workhorse/workflow` | None (pure TS types) | N/A |
| `@workhorse/auth` | None (pure TS types) | N/A |
| `@workhorse/db` | `drizzle-kit generate` | `drizzle-kit push` (migrations) |
| `@workhorse/server` | None (imported by worker) | N/A |
| `plugins/*` | None (pure TS types) | N/A |
| `workflows/*` | None (pure TS types) | N/A |
| `worker` | `alchemy build` | `alchemy deploy` |

## Migration Order

### Phase 1: Extract packages (no behavior change)
1. Create `@workhorse/auth` (extract auth logic)
2. Create `@workhorse/db` (extract db.ts, use Drizzle)
3. Create `@workhorse/sandbox` (extract agent-run.ts, codemode.ts)
4. Create `@workhorse/agents` (extract agents.ts, chat.ts)
5. Create `@workhorse/events` (extract events.ts, notifications.ts)
6. Create `@workhorse/tickets` (extract tickets.ts, heal.ts)
7. Create `@workhorse/server` (extract router.ts + routes/ + plugins.ts + refs.ts + semindex.ts + triggers.ts)
8. Worker imports from new packages (no logic change)

### Phase 2: Add agent() primitive
1. Add `agent()` to `@workhorse/api`
2. Add `workflow()` to `@workhorse/workflow`
3. Add execution logic to `@workhorse/workflow` (from workflow-run.ts, flue-session.ts)

### Phase 3: Refactor plugins
1. Add individual tool exports to each plugin
2. Keep existing `tools` array for backward compatibility

### Phase 4: Create workflow packages
1. Create `workflows/coding/` package
2. Move agents from `worker/src/agents.ts` to `workflows/coding/agents/`
3. Test each workflow in isolation

### Phase 5: Replace Magic Context with AI Search
1. Remove Magic Context from sandbox image
2. Remove `restoreMemory()` / `persistMemory()` from agent-run.ts
3. Add AI Search integration for per-repo memory
4. Add domain-specific tools (search_code, search_history, etc.)

### Phase 6: Refactor worker
1. Remove workflow execution logic from worker
2. Remove plugin composition from worker (workflows own plugins)
3. Add alchemy config for infrastructure
4. Add vite config for workflow discovery
5. Simplify worker to thin shell

### Phase 7: Cleanup
1. Remove dead code from worker
2. Remove scripts-toml.ts (unnecessary with hard-coded workflows)
3. Update tests
4. Update documentation

## Verification

1. `bun run typecheck` — all packages compile
2. `bun run test` — all tests pass
3. `bun run deploy` — worker deploys successfully
4. Manual test: create ticket, run workflow, verify PR

## Open Questions

1. How does the server discover plugins for webhook routes?
2. Should `@workhorse/db` export functions or a class?
3. Should `@workhorse/auth` export functions or a class?
4. How should vite discover workflow packages?
