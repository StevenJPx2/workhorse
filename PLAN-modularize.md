# Plan: Modularize Workhorse Architecture

## Package Naming Decision

`@workhorse/workflow` (not `@workhorse/agent`) because:
- The package's primary purpose is workflow execution
- `agent()` is used within workflows (not standalone)
- `workflow()` and `agent()` are tightly coupled (agents run inside workflows)
- `@workhorse/agent` would imply agents work independently of workflows

## Target Architecture

```
@workhorse/api         # plugin contract: tool(), agent(), types
@workhorse/workflow    # workflow execution: ctx.run(), routing, WorkflowContext
@workhorse/auth        # authentication: bearer tokens, OAuth
@workhorse/db          # database: D1, tickets, scripts, escalations, traces
@workhorse/server      # HTTP routes (imports auth + db)
plugins/*              # github, todo, search, browser, etc.
workflows/*            # coding, etc.
worker                 # entry point + vite + wrangler + deployment
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

### 6. Worker is thin shell + vite + wrangler

```ts
// worker/src/index.ts
import { createServer } from "@workhorse/server";
import { coding } from "@workhorse/workflow-coding";

export default createServer({
  workflows: [coding],
});
```

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
**Extract from:** `worker/src/router.ts`, `worker/src/routes/*`

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
**Becomes thin shell:**

```ts
import { createServer } from "@workhorse/server";
import { coding } from "@workhorse/workflow-coding";

export default createServer({
  workflows: [coding],
});
```

**Plus:**
- `vite.config.ts` (discovers workflows/)
- `wrangler.toml` (Cloudflare Worker config)
- Deployment scripts

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

## Migration Order

### Phase 1: Extract packages (no behavior change)
1. Create `@workhorse/auth` (extract auth logic)
2. Create `@workhorse/db` (extract db.ts)
3. Create `@workhorse/server` (extract router.ts + routes/)
4. Worker imports from new packages (no logic change)

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

### Phase 5: Refactor worker
1. Remove workflow execution logic from worker
2. Remove plugin composition from worker (workflows own plugins)
3. Add vite config for workflow discovery
4. Simplify worker to thin shell

### Phase 6: Cleanup
1. Remove dead code from worker
2. Update tests
3. Update documentation

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
