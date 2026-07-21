# Workhorse Roadmap

**North star:** controllable autonomous agents. Autonomy comes not from a
bigger model but from giving a smaller model the right tools and the right
context at the right *stage* of a workflow. Three required properties:
autonomous-but-staged, observable-and-conversational, and a fleet.

Status legend: ✅ shipped · ⏳ planned · 🅿️ tabled

---

## Shipped ✅

- **Staged workflow engine** — Cloudflare Workflow (durable spine) composed
  with `@agwab/pi-workflow` (in-sandbox staging). Coding pipeline:
  `plan → implement → verify → fix`, per-stage tool gating enforced by agent
  frontmatter ceilings.
- **Status model + monitors** — `queued → planning → implementing →
  ready-for-review → in-review → done`. `done`/`terminated` come **only** from
  external signals (PR merged/closed); the agent can never self-complete.
  Webhooks (`/webhooks/:source`) wake parked tickets to run revisions.
- **Plugin architecture** — hard-boundary workspace monorepo: `plugins/*`
  packages (single-word names) implementing `WorkhorsePlugin` from
  `@workhorse/api` (webhook verify/parse/handle, worker routes with
  declared auth tier, lifecycle hooks, optional sandbox `extension.ts`
  auto-discovered by the image build). Plugins depend ONLY on
  `@workhorse/api`; `worker/` is the sole composition point. Live:
  github, slack, browser, knowledge, imgup, tickets.
- **Self-healing** — errored instances re-dispatched as `<ticket>-hN` resuming
  from recorded state (branch/PR/events/memory persist outside the sandbox).
  Heal button + `POST /tickets/:id/heal` + cron sweep (cap 3).
- **PR replies** — every revision posts back on the PR (what changed, or why
  nothing did), with a self-wake guard.
- **Trace archive** — immutable `trace:<ticket>:<run>` (stages, events,
  prompts, analyses, token usage) + per-ticket index. Run-history UI.
- **Adversarial verifier** — fresh-context read-only verifier agent with a
  typed pass/fail verdict; fix stage consumes findings.
- **Evals** — `evals/run.mjs file|report`; per-ticket `model` override;
  corpus × variants mined from traces. First result: haiku matched sonnet 6/6.
- **Magic Context fleet memory** — `@cortexkit/pi-magic-context` baked in;
  `context.db` round-trips KV per repo (`mc:<owner/repo>`); `ctx_search`
  read-only in plan, `+ctx_memory` in implement.
- **Fleet UI** — Nuxt 4 + Nuxt UI 4 (`ui/`): fleet list, ticket detail
  (pipeline card, run history, live compute state), chat, comark markdown.
- **Browser plane** — tiered `browser_fetch` / `browser_screenshot` via the
  Cloudflare `BROWSER` binding, escalating to a pluggable unblocker when a
  credential is configured; scoped `BROWSER_TOKEN`; gated into plan + verify.
- **Screenshot → PR job** — per-ticket `workflow` selector (default `coding`);
  `screenshot-pr` bundle captures a URL, hosts the image (imgup multi-host
  chain with serve-verification: imgbox → pixhost → catbox), embeds it, opens
  a PR.
- **Model fallbacks + delegation** — one stage-restart mechanism, two
  triggers. *Availability*: a stage that dies on the model plane (429 /
  credit exhaustion / expired OAuth — detected from `statusDetail` /
  `failureKind`) re-injects a fresh custodian OAuth token and resumes
  (OAuth-only fleet; two retries, step delay as backoff). *Capability*:
  any stage can set
  `"delegate": true` (+ `delegateReason`) in its control block; the
  orchestrator marks the stage failed, patches the next model up the
  promotion chain (haiku → sonnet → opus, cap 2/run) into the compiled
  plan, and `resumeRun`s — downstream stages re-run via
  `invalidateOnDependencyResume`, upstream artifacts intact. Every
  escalation lands in `esc:<ticket>:<run>` and merges into the trace
  archive, so **evals reveal which stages genuinely need a bigger model**.
- **AI Search fleet knowledge** — every archived run is distilled
  (task, per-stage analyses, verifier verdict, escalations, outcome) and
  indexed into an AI Search instance (`workhorse-fleet`, built-in storage,
  hybrid vector+keyword). Agents get `search_fleet_knowledge` (gated into
  plan + verify) — institutional memory across ALL repos/tickets,
  complementing Magic Context's per-repo working memory; the fleet chat
  answers "why did X fail?" from the same corpus. `POST /knowledge/search`
  (scoped token) + `POST /knowledge/reindex` backfill.
- **Slack bot** — `slack` source plugin (Events API → `/webhooks/slack`,
  signature-verified, 3s-ack via new plugin `handle` override). `@workhorse
  …` mentions route to the fleet-chat agent (file tickets, status, fleet
  knowledge); when it files a ticket the thread maps to it
  (`slack:<channel>:<ts>` ↔ `slack-thread:<ticket>`, mirrors `pr:`).
  Thread replies become mid-run steers (live run) or revision events
  (parked in-review). Outbound: status transitions post into the thread.
  Config: `SLACK_SIGNING_SECRET` + `SLACK_BOT_TOKEN` secrets.
- **Workflow registry (user-configurable workflows)** — workflows are
  USER DATA: KV-registered entries (`workflow:<name>` — spec + agents +
  schemas) uploadable via `PUT /workflows/:name`, validated at upload with
  pi-workflow's own parser (run inside a sandbox). Resolution at prepare:
  repo's `.workhorse/workflows/<name>/` → KV registry → baked seed
  bundles; `POST /workflows/seed` imports the baked bundles (never
  clobbers user entries). New pipelines need no rebuild/redeploy.
- **Mid-run interception (steering)** — `POST /tickets/:id/steer` (+ steer
  input on the ticket page) queues an operator message; the driving
  workflow picks it up on its next burst, interrupts the current stage via
  pi-workflow's own `stopRun`, appends the steer to the stage's compiled
  prompt (operator instructions take precedence), and `resumeRun`s —
  upstream artifacts intact. Between-stage steers just re-prompt the
  not-yet-started stage. Steers land in the escalation record
  (`trigger: "steer"`) and the trace archive.

---

## Planned ⏳

### Visual workflow builder (vue-flow)
Definable workflows, end to end in the UI. A `/workflows` page in the Nuxt
dashboard using [vue-flow](https://github.com/bcakmakoglu/vue-flow): stages
as nodes (agent, model, tool allowlist, control schema, loop/until settings
in a side panel), artifact edges as connections (`from` data edges — the
graph IS pi-workflow's artifact graph, so the canvas is a faithful editor,
not a lossy sketch). Save compiles the graph to an ArtifactGraph `spec.json`
and `PUT`s it to the existing workflow registry — same validation (422 with
pi-workflow's parser message rendered on the offending node), same storage,
no new backend concepts. Load = spec → graph (positions in a `ui` sidecar
key the parser ignores, or `.plan-state`-style KV). The file-ticket form
gains a workflow picker (`GET /workflows`) so a saved workflow is usable on
the next ticket immediately. Seeded `coding` / `screenshot-pr` open in the
builder as starting templates (edit → save-as — seeds stay pristine,
`source: user` copies take a new name).

Slices: (1) registry UI — list/inspect/upload + ticket-form picker (no
canvas yet); (2) read-only graph rendering of any registered workflow
(spec → vue-flow, also useful as run visualization on the ticket page);
(3) full editor — node/edge editing, side-panel stage config, save-as flow.

### Registry UI prerequisites
Workflow picker on the file-ticket form + list/inspect pages — slice 1
above; worth shipping even before the canvas exists.

---

## Tabled 🅿️

### A2A / live agent communication
Graph-mediated handoff already carries typed stage outputs (`control.json` /
`analysis.md` / `refs.json`), `from` data edges, `sourceProjection.include`,
`inputPolicy.requiredReads`, `foreach`/`reduce` fan-out/fan-in, and `dag`
composites. Live peer-to-peer messaging between CONCURRENT subagents has no
consumer today: every Workhorse bundle is a linear pipeline (no
`foreach`/`dag` fan-out), so no two subagents ever run at once. Revisit when
a workflow genuinely fans out — a shared-filesystem mailbox + polling tool,
or an orchestrator-level message bus.

### Rust in Workhorse
The control plane is TypeScript: `WorkflowEntrypoint` and the
`@cloudflare/sandbox` SDK are JS-only contracts, and the code Workhorse owns is
I/O-bound glue (inference runs on Anthropic, builds run in the target repo).
Three entry points would justify Rust: (1) in-sandbox helper binaries baked into
the image (trace collector / diff processor); (2) a self-hosted orchestrator
daemon should the fleet outgrow Cloudflare Workflows; (3) a CLI for
filing/watching tickets.

---

## Future workflow specs

Workflows are user data (see Workflow registry): upload a spec via
`PUT /workflows/:name`, or version one in the target repo under
`.workhorse/workflows/<name>/`. The baked `sandbox/workflows/` bundles
(`coding`, `screenshot-pr`) are seeds — `POST /workflows/seed` imports them
into the registry on a fresh deployment.

---

## Infrastructure constraints

- **Trace mining** — persisted traces feed per-stage optimization: detect
  repeated tool calls, tune prompts and tool sets.
- **Browser hard blocks** — hard-PerimeterX sites (e.g. talbots.com) deny even
  real headed Chrome on a residential IP, so they require a commercial
  unblocker credential on the Tier-2 escalation. Soft/monitor-mode sites pass
  through Tier 1 natively.
- **Image hosting** — no single keyless host is reliable: catbox throttles
  datacenter IPs to 0-byte serves, 0x0.st has uploads disabled. The upload tool
  walks a fallback chain and verifies each URL serves real bytes before
  accepting it. Probe from the sandbox IP before trusting a new host.
