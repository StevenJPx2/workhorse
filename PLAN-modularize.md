# Plan: Modularize Workhorse Architecture

## Overview
This plan refactors Workhorse from a monolithic worker into a modular architecture where each concern is a separate package. The worker becomes a thin shell that composes everything together.

**Key technologies:**
- **Alchemy** — Infrastructure-as-Effects for Cloudflare deployment
- **Drizzle** — TypeScript ORM for D1 database (+ Drizzle Studio as the db visual surface)
- **Valibot** — Schema validation for agent outputs
- **Effect** — Type-safe functional programming (used by Alchemy)
- **oxlint** — Fast Rust linter (correctness gate)
- **fallow** — Codebase intelligence: dead code, cycles, duplication, health score

**Architecture principles:**
- Each package has a single responsibility
- Packages are composable and testable in isolation
- The worker is just the deployment boundary
- Workflows own their dependencies (plugins)
- Infrastructure is code (Alchemy), not config (wrangler.toml)
- Dependency injection over module-level singletons (classes take deps once)

## Hygiene (enforced from phase 0 onward)

Every package carries these three, and they gate each phase:

1. **Tests** — one root `vitest.config.ts` using `projects`, so each package runs
   isolated (own root, own resolution) under a single vitest install and a single
   `bun run test`. Adding a package needs no config change; the globs pick up
   anything with tests. Shared harnesses live in **`@workhorse/test-utils`**,
   never duplicated per package:

   | subpath | provides |
   |---------|----------|
   | `/tools` | `fakeSandbox`, `fakeCore`, `fakeEnv`, `stubFetch`, `runTool` |
   | `/workflow` | `workflowHarness` — scripted stage verdicts, records call order and loop-backs |
   | `/model` | `toolSurface`, `modelClient`, `runToolChoiceEval` — live-model scoring off real tool definitions |

   **Three layers, distinct jobs** (a CLI-exec tool needs all three):

   | layer | proves | cost |
   |-------|--------|------|
   | mocked | the tool builds the command it intended | free, every CI run |
   | contract | the real binary accepts it and the response parses | needs the binary — `bun run test:contract` |
   | model | an agent can pick the tool and fill it in | needs a live model — `bun run eval:tools` |

   Mocked tests alone are not enough: six shipped browser bugs (wrong CLI
   signatures, a nonexistent flag, unparsed response envelope) were invisible to
   a `fakeSandbox` because it faithfully returned whatever the tool asked for.

2. **Observability** — traces, metrics, structured logging per package.
   Status: **not started.** Deferred to Phase 5 with the `@workhorse/workflow`
   extraction, when there are spans worth tracing. The two `@opentelemetry`
   entries in `bun.lock` are transitive (via `pi-ai` and `vitest`), not ours.
3. **Visual simulation** — a way to *see* behavior, not just assert it.

   **Repo-wide, built:** `bun run report` renders `reports/index.html` from data
   the gates already produce — per-package scores with trend sparklines and
   signed deltas, test results with failures listed, secret contract by group,
   and run history. Self-contained (inline CSS, hand-built SVG), no deps, no
   network. `reports/history.json` is tracked so the score series survives
   across machines; the rendered HTML is not.

   Two CI surfaces, because they answer different questions:

   | surface | question | cost |
   |---|---|---|
   | **Job summary** (`--markdown` → `$GITHUB_STEP_SUMMARY`) | "did anything break, and where?" | zero — renders on the run page |
   | **`quality-report` artifact** (HTML) | "what's the trend across runs?" | download + unzip |

   The digest leads with named failures and packages that MOVED, collapsing the
   20-row full table behind `<details>` — 20 rows of "100.0 A" is noise when
   nothing changed. Trends degrade from SVG to unicode blocks (`▁▂▃▄▅▆▇█`) on the
   same fixed 0–100 domain. Both use `if: always()`, since the report matters
   most when something failed.

   **Per-package, still to build:**
   - `@workhorse/workflow` — render a run's stage graph + transitions from a recorded run
   - `@workhorse/db` — **Drizzle Studio** (`drizzle-kit studio`) is the visual surface
   - `@workhorse/server` — route/request inspection

**Toolchain gates** (root scripts):
```json
{
  "lint": "oxlint packages plugins worker evals",
  "health": "node scripts/health.mjs",
  "health:update": "node scripts/health.mjs --update",
  "audit": "fallow audit",
  "check": "bun run lint && bun run typecheck && bun run health",
  "secrets": "node scripts/secrets.mjs",
  "secrets:missing": "node scripts/secrets.mjs --missing",
  "test": "vitest run",
  "test:contract": "BROWSER_CONTRACT=1 vitest run plugins/browser/tools/__tests__/contract.test.ts",
  "eval:tools": "TOOL_SURFACE_EVAL=1 vitest run --project evals"
}
```

`fallow audit` gates only what a PR changed (pass/warn/fail verdict) — the CI gate.
`bun run check` is the local pre-commit gate.

### Secret contract

`secrets.json` declares every secret and var: its group, purpose, **what breaks
without it**, and where to obtain it. It never contains values. `bun run secrets`
audits the deployed worker against it (the Cloudflare API returns names only).

It catches three failure modes that reading code cannot:

| check | why it matters |
|-------|----------------|
| **drift** | declared but not deployed, or deployed but undeclared |
| **partial** | an all-or-nothing group with *some* members set |
| **guidance** | `--missing` prints purpose, blast radius, and the exact command |

**Partial configuration is the dangerous state.** A Slack signing secret without
a bot token means the surface verifies deliveries it cannot reply to — worse than
being switched off, because it looks configured. So `slack` and `jira` are marked
`allOrNothing`.

The audit found a real orphan on first run: `SCRAPFLY_KEY` was still deployed
after the Scrapfly unblocker tier was removed in `d342d1a` — a live credential
for a feature that no longer exists. Deleted.

Bindings (KV, D1, R2, DO, Workflow, AI, Vectorize) are deliberately **not** in
the manifest: they are declared in `wrangler.jsonc` and provisioned by the
platform, so tracking them here would be duplicate bookkeeping. The script
filters them out of the `Env` cross-check by type.

### Per-package health harness

`scripts/health.mjs` runs `fallow health` scoped to **each workspace package**
and gates every one against a floor recorded in `health-baseline.json`. This is
how the plan's "assess and clean each package before starting the next" rule is
enforced mechanically rather than by discipline.

```
bun run health                    # table + gate
bun run health:update             # lock in improvements as the new floor
node scripts/health.mjs --only db # scope to one package
node scripts/health.mjs --json    # machine-readable (CI)
```

Rules:
- A package **below** its floor fails the gate (regression).
- A package **above** its floor prints the gain and suggests `--update`.
- A **new** package (no recorded floor) must score ≥ **90** — freshly written
  code has no excuse for debt.

A package whose entry points aren't a standard package main (e.g. `evals`,
whose entries are `*.eval.ts`) gets a package-local `.fallowrc.json`; fallow
auto-discovers it when scoped.

Scores are computed with `fallow --production`, which excludes test files — so
adding coverage can never read as adding debt.

**Current per-package floors** (`health-baseline.json`):

| Package | Score | Package | Score |
|---------|-------|---------|-------|
| evals | 100 A | plugins/knowledge | 100 A |
| packages/api | 100 A | plugins/ntfy | 100 A |
| packages/semindex | 100 A | plugins/paste | 100 A |
| packages/test-utils | 100 A | plugins/scripts | 100 A |
| packages/workflow | 99.7 A | plugins/search | 100 A |
| plugins/aft | 100 A | plugins/slack | 90 A |
| plugins/browser | 100 A | plugins/tickets | 100 A |
| plugins/github | 90 A | plugins/todo | 100 A |
| plugins/imgup | 100 A | ui | 87.2 A |
| plugins/jira | 90 A | **worker** | **62.3 C** |

`worker` is the outlier at 62.3 (circular deps −25, unit size −10) — and it is
precisely what Phase 5 dissolves into packages. Its floor is recorded so it
cannot get *worse* while the earlier phases run.

**Phase 0 baseline (done):** oxlint + fallow installed; 10 oxlint errors fixed;
14 unused dependencies removed (10 stale `@flue/runtime` declarations left over
from the api decoupling, plus `@workhorse/api` in packages/workflow,
`@workhorse/workflow` in evals, `@vue-flow/controls` in ui, `agents` in worker).
Health score: **40 F → 61 C**. Remaining deductions are the ones modularization
itself is meant to fix: circular deps (-23.4), unit size (-10.0).

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
- [Drizzle Studio](https://orm.drizzle.team/docs/drizzle-kit-studio) — Visual database browser
- [oxlint](https://oxc.rs/docs/guide/usage/linter) — Rust-based linter
- [fallow](https://docs.fallow.tools) — Codebase intelligence (dead code, cycles, health)
- [imgup](https://github.com/DeadNews/images-upload-cli) — Multi-host image upload CLI (imgbb primary)
- [Vitest](https://vitest.dev) — Test runner

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
  // A bare string is shorthand for { primary }. See §2 for fallback/promotion.
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

### 2. Model policy: promotion on capability, fallback on availability

An agent declares a model **policy**, not a model string. Two orthogonal axes,
and conflating them is expensive:

| axis | trigger | moves to | cost |
|------|---------|----------|------|
| **fallback** | the provider failed — 429, 401/403, 5xx, network | same capability, different provider/credential | unchanged |
| **promotion** | the *agent* failed — budget spent, no `submit_work`, self-declared stuck | higher capability | higher |

```ts
const prCoder = agent({
  name: "pr-coder",
  model: {
    primary: "anthropic/claude-sonnet-4-6",
    // AVAILABILITY: same model, other credentials. Tried in order.
    fallback: ["opencode/claude-sonnet-4-6", "bedrock/claude-sonnet-4-6"],
    // CAPABILITY: a bigger model, only when the work itself stalls.
    promote: {
      to: "anthropic/claude-opus-4-1",
      when: { tokenBudget: 120_000, retriesWithoutSubmit: 2 },
    },
  },
  // ...
});
```

**Order matters: exhaust fallback before promoting.** A 429 is not a capability
problem — promoting on a throttle pays for a bigger model to solve a problem it
cannot fix. Fallback first (free), promotion only when the agent genuinely
cannot finish.

**When every leg is throttled, park — don't degrade.** The durable spine sleeps
and retries (bounded by `MAX_THROTTLE_PARKS`) rather than dropping to a weaker
model. Waiting produces a correct run late; degrading produces a broken run now.

**A fallback leg must be validated for tool-calling before it is added.** This is
a constraint learned the hard way: opencode-zen's free models were wired in as a
fallback and proved unusable for agentic stages — they returned ~1 output token
and no tool calls, so a stage ended "without `submit_work`" instead of doing the
work. That is why the leg chain in `flue-session.ts` currently has exactly **one**
leg. A model that cannot drive tools is not a fallback; it is a silent failure.

**Promotion is designed but unbuilt.** The groundwork exists — the D1
`escalations` table carries `to_model`, and the escalation trigger enum is
already `"fallback" | "promotion" | "steer"` — but only `fallback` is ever
emitted today. Wiring promotion means: track per-stage token spend, count
`submit_work` misses, and re-run the stage one model up while recording the
`fromModel → toModel` movement.

**Thresholds should be mined, not guessed.** Escalations are archived into the
per-run trace, so evals can measure *which stages actually needed a bigger
model* and set `promote.when` from evidence.

### 3. Tools are imported directly from plugins (not string references)

```ts
// Plugins export individual tools
export const browser_open = tool({ name: "browser_open", ... });
export const browser_screenshot = tool({ name: "browser_screenshot", ... });

// Agents import them directly
import { browser_open } from "@workhorse/plugin-browser";
```

### 4. `ctx.run()` executes an agent with explicit input

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

### 5. Stage output is a valibot schema (runtime + compile-time)

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

### 6. Each workflow is a package in `workflows/`

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

### 7. imgbb (via imgup) for PR image uploads

`upload_image` is the single vehicle for embedding screenshots and GIFs in PR
descriptions, with **imgbb first** in the host chain. imgbb is API-keyed
(`IMGBB_KEY`) and proved reliable where the keyless hosts throttle datacenter
IPs; the keyless hosts stay as fallbacks for when no key is configured.

```ts
// plugins/imgup/tools/upload_image.ts
const DEFAULT_HOSTS = ["imgbb", "imgbox", "pixhost", "catbox"];
```

**PR writer agent tools:**
```ts
const prWriter = agent({
  name: "pr-writer",
  tools: (ctx) => {
    const tools = [read, grep, find, ls, bash];

    if (ctx.input.uiChanges) {
      tools.push(browser_screenshot, browser_record, upload_image);
    }

    return tools;
  },
});
```

**Key injection:** `injectImgupConfig` writes `IMGBB_KEY` to
`/root/.config/imgup/.env` at prepare (the path imgup reads on Unix), alongside
the existing browser/ticket-context injections. It no-ops when the key is
unset, so a run never fails on its absence.

**One vehicle, not two.** The GitHub user-attachments path (`gh-image`) was
evaluated and rejected — the pipeline did not work reliably. There is no
separate "PR images" tool: `upload_image` serves PR embeds and external sharing
alike, and `upload_text` covers text hosting.

**Sandbox:** `imgup` stays in the Dockerfile. No `gh-image` extension.

### 8. Tools stay GRANULAR; token cost is solved by semantic selection

**Many small, precisely-named tools — not few tools with `action` picklists.**

This was measured, not assumed. Consolidating 34 tools into 14 saved ~1170
prompt tokens per turn and cost **~12 percentage points of tool-choice
accuracy** (`bun run eval:tools`, deepseek-v4-flash, 14 tasks × 3 runs, real
definitions on both sides):

| surface | tools | accuracy | surface tokens |
|---------|-------|----------|----------------|
| granular | 13 | **100.0%** | 2047 |
| consolidated | 4 | 88.1% | 873 |

Two failure modes, neither visible to token arithmetic:

1. **Cross-tool confusion.** `fill` and `press` went to `browser` instead of
   `browser_interact`. That split is *required* by the capability gate, so it
   cannot be merged away to fix the confusion.
2. **Action-within-tool confusion.** "Check for compile errors" chose
   `action: "outline"` instead of `"inspect"` — 0/3. A granular tool NAME
   encodes the intent; a picklist defers it to a second decision the model gets
   wrong.

**Consolidation solved the token problem in the wrong layer.** A tool's name is
the primary retrieval signal a model uses; merging tools destroys it. The right
layer is *selection*: keep granular names and show the agent only the few tools
that matter for the current step.

**Three layers, each with a distinct job:**

| layer | mechanism | what it does |
|-------|-----------|--------------|
| **capability** | stage allowlist | the security boundary — a read-only stage can never be handed a write tool |
| **selection** | semantic index over the allowed set | the token boundary — top-N relevant tools per step |
| **documentation** | `docs` + `help: true` | detail on demand, off the per-turn budget |

The allowlist runs first and is absolute; selection only ever narrows what the
allowlist already permits, so it can never widen capability.

**`@workhorse/semindex` is the generic index builder** — one `defineIndex()`
serving any registry: **tools**, **skills**, **scripts**, workflows. Cloudflare
Vectorize + Workers AI embeddings, hosted, no local model. The
[toolpick](https://github.com/pontusab/toolpick) pattern is the reference for
the tool case: index name + description + parameters, hybrid keyword+semantic
search per step, page to a fresh set on a miss, expose everything as a fallback
so the agent never gets stuck.

**Every tool carries mandatory `docs`.** `tool()` type-requires the field and
auto-injects a `help` flag, so `{ help: true }` returns the full reference
without executing. The one-paragraph `description` is paid every turn; `docs` is
paid only when asked. This is how granular tools stay cheap *and* well
documented — 31 tools, ~5000 tokens of documentation, none of it in the default
prompt.

### 9. The browser runs HEADFUL on a virtual display

Bot-detection vendors deny headless Chrome outright. Measured against
talbots.com (PerimeterX), 3 trials per mode:

| mode | result |
|------|--------|
| headless (local Chrome) | **blocked 3/3** — "Access to this page has been denied." |
| headless (Kernel cloud) | **blocked** — identical PX interstitial |
| **headful** | **passes 3/3** — 11.7KB of content, 122 interactive refs |

**Headful Chrome requires an X display on Linux.** Without `DISPLAY` it does not
launch at all — verified in a container: `chromium.launch({ headless: false })`
fails with "Target page, context or browser has been closed", and succeeds under
Xvfb. So the sandbox image installs `xvfb`, and the wrapper starts one virtual
display per container and points Chrome at it.

**Headful is set by env var, not by the `--headed` flag.** `batch` SILENTLY
DROPS `--headed` — proven by launchHash: `batch --bail "open <url> --headed"`
produces the *identical* hash to a headless launch, and the page comes back
blocked. `AGENT_BROWSER_HEADED=1` is read at launch regardless of subcommand, so
it survives batch. This matters because `browser_open` uses batch for open+wait,
which is exactly where the flag form would have failed silently.

```bash
# sandbox/agent-browser.sh
Xvfb :99 -screen 0 1920x1080x24 -nolisten tcp &   # once per container
export DISPLAY=:99
export AGENT_BROWSER_HEADED=1
exec agent-browser --namespace workhorse --json "$@"
```

The wrapper only exports `DISPLAY` once the X lock file appears. Pointing Chrome
at a dead display is *worse* than headless — it cannot launch at all, whereas
headless at least works on sites that don't bot-check.

**Kernel is not needed.** It was evaluated for exactly this problem and is
blocked identically to local headless. Local Chrome + Xvfb costs no credential
in the sandbox and no per-run fee.

### 10. AI Search replaces Magic Context

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

### 11. Worker is thin shell + alchemy + vite + Dockerfile

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

### `@workhorse/test-utils` (built)

The platform's testing layer, domain-separated by subpath so a package pulls
only the harness it needs. Test-only — never imported by runtime code.

**Exports:**
```ts
// @workhorse/test-utils/tools
export function fakeSandbox(options?): FakeSandbox;   // in-memory FS, scriptable exec, records commands
export function fakeCore(overrides?): FakeCore;       // all Core methods, benign defaults, records args
export function fakeEnv(overrides?): Env;             // unstubbed bindings throw, naming themselves
export function stubFetch(routes): void;              // per-URL routing; an unrouted call fails loudly
export function runTool(factory, input, opts?): Promise<{ output, sandbox, core }>;

// @workhorse/test-utils/workflow
export function workflowHarness(script, opts?): { ctx, calls, visits };
export function failingStageHarness(stage, kind, message): { ctx };

// @workhorse/test-utils/model
export function toolSurface(factories): ModelTool[];  // real valibot schemas -> model-facing JSON Schema
export function modelClient(options): ModelClient;    // opencode-go by default (flat rate)
export function runToolChoiceEval(options): Promise<SurfaceResult[]>;
```

`/workflow` is **structurally typed** — it does not import `@workhorse/workflow`,
or that package's own tests would create a cycle.

`/model` derives its surface from **real** `ToolFactory` definitions, so a
model-facing test can never drift from the tools that ship.

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

## Workflow Builder Pattern

`workflow()` is a **builder** that executes the `run()` function once with a **discovery context** to build the workflow graph, then again with a **real context** for execution.

**No explicit `agents` array.** Agents are imported and used directly inside `run()`.

**How it works:**

1. **Discovery phase** — `workflow()` calls `run()` with a mock `ctx`. Each `ctx.run(agent, options)` records:
   - The agent
   - Its dependencies (`upstream` array)
   - A unique stage ID

2. **Graph construction** — The recorded calls build the workflow graph: nodes are agents, edges are `upstream` dependencies.

3. **Execution phase** — The same `run()` function is called with a real `ctx`. `ctx.run()` now executes the agent and returns real results.

**Benefits:**
- No `agents` array (implicit roster)
- Readable workflow definition (explicit `ctx.run()` calls)
- Graph discovery for UI visualization
- Type-safe

**Caveat:** Loops and conditionals only show the structure discovered in the first iteration. This is enough for the graph view.

**Example:**

```ts
const coding = workflow({
  name: "coding",
  async run(ctx) {
    const brief = await ctx.run(enricher, { input: { task: ctx.task } });
    const plan = await ctx.run(planner, { input: { task: ctx.task }, upstream: [brief] });

    for (const todo of plan.output.todos) {
      const impl = await ctx.run(coder, { input: { todo }, upstream: [brief, plan] });
      const review = await ctx.run(reviewer, { upstream: [brief, plan, impl] });

      if (review.output.control.verdict === "pass") {
        await ctx.run(writer, { input: { uiChanges: impl.output.control.uiChanges }, upstream: [brief, plan, impl, review] });
      }
    }
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
| `@workhorse/test-utils` | None (pure TS, test-only) | Never deployed |
| `@workhorse/workflow` | None (pure TS types) | N/A |
| `@workhorse/auth` | None (pure TS types) | N/A |
| `@workhorse/db` | `drizzle-kit generate` | `drizzle-kit push` (migrations) |
| `@workhorse/server` | None (imported by worker) | N/A |
| `plugins/*` | None (pure TS types) | N/A |
| `workflows/*` | None (pure TS types) | N/A |
| `worker` | `alchemy build` | `alchemy deploy` |

## Migration Order (hybrid)

**Why hybrid:** pure extraction-first moves ~11 files "with no behavior change,"
then later phases rewrite much of what was moved (`ctx.run()` replaces
`ctx.stage()`, AI Search rips `restoreMemory`/`persistMemory` out of
agent-run.ts, plugin composition dissolves) — moving code twice. So: extract
only the **low-churn, stable** packages first, then build the new primitives,
then extract the rest around the shape that proved out.

**Every phase must end green on:** `bun run check` (oxlint → typecheck → fallow
health), `bun run test`, and the phase's own visual-simulation surface.

### Phase 0: Toolchain baseline ✅ DONE
1. ✅ Install oxlint + fallow at the workspace root
2. ✅ Fix all oxlint correctness errors (10 found, 10 fixed)
3. ✅ Remove unused dependencies (15 removed, incl. `@flue/cli` — the plan
   rejected `flue build`, so the CLI was pure weight)
4. ✅ Root scripts: `lint`, `lint:fix`, `health`, `health:update`, `audit`,
   `dead`, `check`
5. ✅ **Per-package health harness** (`scripts/health.mjs` +
   `health-baseline.json`) — the mechanism that enforces "clean each package
   before starting the next"
6. ✅ Break the `knowledge` plugin import cycle (75 → 100) by extracting the
   read path into a leaf `search.ts`
7. ✅ Delete interpreter-era dead types from `packages/workflow`
   (`RunState`, `StageDriveReport`, `StageState`, `StageStatus` — the pi-subprocess
   fields `pid`/`eventsOffset` outlived the engine that used them) → 63.6 → 90
8. ✅ GitHub Actions PR gate (`.github/workflows/ci.yml`) — two jobs:
   - **check**: lint → typecheck → test → per-package health → secret contract
   - **audit**: `fallow audit` scoped to the PR diff, gating on findings the
     changeset *introduced* (inherited debt doesn't block, so a PR touching
     `worker/` isn't held hostage by the circular deps Phase 5 fixes)

   Deliberately excluded: contract suites (need real binaries + Xvfb/Chrome),
   the model eval (needs a key and hundreds of live calls), and deploy (Phase 7).

   `bun run secrets` had to learn a CI mode first: without wrangler auth the
   deployed secret list is unreadable, and treating "can't see it" as "not set"
   would have failed the build on every required secret. It now gates on the
   static manifest-vs-`Env` check only and marks presence as `?`.

### Phase 0.5: Test foundation ✅ DONE

Built ahead of the package work, because every later phase gates on `bun run test`
and the harnesses had to exist before there was anything to test with them.

1. ✅ `@workhorse/test-utils` — `/tools`, `/workflow`, `/model` subpaths
2. ✅ Root `vitest.config.ts` with `projects` (plugins, packages, worker, evals)
3. ✅ Health harness switched to `fallow --production` so tests never skew scores
4. ✅ Colocated `__tests__` for the browser, aft, and todo tool surfaces
5. ✅ **Contract suite** — the real `agent-browser` CLI against a real page,
   which found six shipped bugs a `fakeSandbox` could not see
6. ✅ **Model eval** — live tool-choice scoring, which reversed the tool
   consolidation decision
7. ✅ Colocated tests for every remaining tool surface (github, tickets, search,
   scripts, knowledge, imgup, paste) — **445 tests**
8. ✅ Contract suites for the CLI-exec archetypes (`imgup`, `aft`)

**The aft contract suite found that all five `aft_*` tools are inert.** `aft` is
a **JSON-RPC-over-stdin server**, not an argv CLI. Our helper shells out as
`aft outline --json <file>`; the real binary ignores argv, reads a request from
stdin, sees it closed, and exits **0 with empty stdout** — so the helper reports
success and each tool returns `"(no output)"`. A silent no-op, not a crash, which
is why it went unnoticed.

Compounding it: `aftPlugin` is **not registered** in `worker/src/plugins.ts`, so
the tools are unreachable anyway — while `TOOL_CATALOG` still advertises
`aft_outline`/`aft_zoom`/`aft_search`/`aft_edit` to `find_tool`, meaning an agent
can discover tools it cannot call.

The real protocol (verified against aft 0.42.0):
```
stdin  {"id":"1","command":"outline","file":"<path>"}
stdout {"id":"1","success":true,"text":"..."}
```
- ids must be **strings** (a numeric id is a parse error)
- `method` is an accepted alias for `command`; passing both is a parse error
- params are **top-level**, not nested under `input`
- commands are `outline` / `zoom` / `inspect` / `configure` — there is **no
  `search` or `edit`**, so two of our five tools have no counterpart
- `inspect` requires a prior `configure` call

Fixing this is its own task: a stdin/JSON-RPC transport in `plugins/aft/tools/_shared.ts`,
plugin registration, and dropping or re-mapping `aft_search`/`aft_edit`.

### Phase 1: Stable packages (won't be reshaped later)
1. Create `@workhorse/db` — Drizzle schema + migrations + **class with DI**
   - `class Db { constructor(private env: Env) }` — one drizzle instance, injected
   - Drizzle Studio as the visual simulation surface
   - Vitest suite against a local D1/SQLite
2. Create `@workhorse/auth` — **class with DI** (`class Auth { constructor(env) }`)
3. Worker imports both; no other logic changes
4. Gate: `bun run check` + `bun run test` + Drizzle Studio opens and shows tables

### Phase 2: New primitives
1. Add `agent()` to `@workhorse/api`
2. Add `workflow()` builder to `@workhorse/workflow` (discovery + execution phases)
3. Port execution logic (workflow-run.ts, flue-session.ts) onto `ctx.run()`
4. Visual simulation: render a discovered workflow graph from a dry-run
5. Gate: graph render matches the hand-drawn coding pipeline

### Phase 3: Plugins export individual tools
1. Add individual tool exports to each plugin (`export const browser_open = ...`)
2. Remove the `tools` array once nothing reads it (greenfield — no back-compat shims)
3. Gate: `fallow dead-code` shows no orphaned tool factories

### Phase 4: First workflow package
1. Create `workflows/coding/` with agents as TS modules
2. Move personas from `sandbox/agents/*.md` to `workflows/coding/agents/*.ts`
3. Prove the whole shape end-to-end on one real ticket → PR
4. Gate: eval case passes against the `coding-raw` baseline

### Phase 5: Extract the rest (now that the shape is proven)
1. `@workhorse/sandbox` (agent-run, codemode)
2. `@workhorse/agents` (agents, chat)
3. `@workhorse/events` (events, notifications)
4. `@workhorse/tickets` (tickets, heal)
5. `@workhorse/server` (router, routes/, plugins, refs, semindex, triggers)
6. Gate: `fallow health` circular-deps deduction drops (this is the phase that fixes it)

### Phase 6: AI Search replaces Magic Context
1. Remove Magic Context from the sandbox image
2. Remove `restoreMemory()` / `persistMemory()`
3. Add AI Search integration for per-repo memory
4. Add codebase-intelligence tools (search_code, search_history, search_tests, search_docs)

### Phase 7: Worker becomes the deployment boundary
1. Move `sandbox/Dockerfile` → `worker/Dockerfile` (+ `worker/sandbox/`)
2. Add `alchemy.run.ts`; delete `wrangler.jsonc`
3. Add vite config for workflow discovery
4. GitHub Actions: push→prod, PR→preview, PR-close→destroy
5. Reduce `worker/src/index.ts` to `createServer({ workflows })`

### Phase 8: Cleanup
1. Remove `scripts-toml.ts`
2. `fallow fix --dry-run` → apply the safe automatic cleanups
3. Target: fallow health ≥ 85 (B or better)
4. Update README + ROADMAP

## Verification

Per phase:
1. `bun run check` — oxlint + typecheck + per-package fallow health
2. `bun run test` — every package's vitest suite (one root runner)
3. The phase's visual-simulation surface renders correctly

When a phase touches CLI-exec tools or tool definitions:
4. `bun run test:contract` — the real binaries accept what we send
5. `bun run eval:tools` — a model can still pick the right tool

Before ship:
6. `bun run deploy` — worker deploys
7. Manual: file ticket → run workflow → verify PR

## Answered Decisions

| Question | Decision |
|----------|----------|
| Phase ordering | **Hybrid** — stable packages (db, auth) first, then primitives, then the rest |
| `@workhorse/db` / `@workhorse/auth` shape | **Class with dependency injection** — constructed once, injected; avoids repeated instantiation |
| db visual simulation | **Drizzle Studio** |
| Linting | **oxlint** (correctness category as error) |
| Codebase intelligence | **fallow** (`audit` as the CI gate, `health` as the local gate) |
| Test harness location | **`@workhorse/test-utils`**, one package with per-domain subpaths — not per-plugin helpers (fallow would flag the duplication) |
| Vitest layout | **One root config with `projects`** — single install, single `bun run test`, no per-package config |
| Tests in health scoring | **Excluded** (`fallow --production`) so coverage never reads as debt |
| Tool granularity | **Granular** — consolidation measured −5–12pp tool-choice accuracy; token cost belongs to semantic selection |
| Tool documentation | **Mandatory `docs` + injected `help` flag** — type-enforced, detail off the per-turn budget |
| Model selection | **Policy, not a string** — `fallback` for availability (same capability, other credential), `promote` for capability (bigger model when the agent stalls). Fallback is exhausted first; all-throttled parks rather than degrades |
| Browser mode | **Headful on Xvfb** — headless is blocked by bot detection (3/3 on PerimeterX); set via `AGENT_BROWSER_HEADED=1` because `batch` silently drops `--headed` |
| Browser backend | **Local Chrome in the sandbox** — Kernel was evaluated and is blocked identically to local headless, so it buys nothing for the cost of a credential + per-run fee |
| Secret management | **`secrets.json` manifest + `bun run secrets` audit** — names only, never values; declares blast radius per entry and flags partial all-or-nothing groups |
| Visual simulation (repo-wide) | **`bun run report`** — one self-contained HTML page from data the gates already produce: per-package scores with trend sparklines, test results, secret contract, run history. No deps, no network; uploaded as a CI artifact on every run. `reports/history.json` is tracked so the series survives |
| Component-story tooling (Storybook/Histoire) | **Rejected** — nothing to simulate outside `ui/`, which is Nuxt app code outside the modularization path |
| Real o11y (OpenTelemetry) | **Deferred to Phase 5** — belongs with the `@workhorse/workflow` extraction, when there are spans worth tracing |

## Open Questions

1. How does the server discover plugins for webhook routes?
2. How should vite discover workflow packages?
