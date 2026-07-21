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

## Planned ⏳ (in priority order)

### Jira plugin
`plugins/jira` — the third webhook source, and the first true *intake*
source (GitHub reacts to PRs Workhorse opened; Jira originates work).
Heir of legacy Workhorse's Jira integration (Jiratown / jira-comments
monitor), rebuilt on the plugin contract:

- **Inbound** (`POST /webhooks/jira`, Atlassian webhook + secret check):
  issue assigned to the Workhorse account (or labeled `workhorse`) →
  `fileTicket` with the issue's summary/description as the prompt and a
  `jira:<issueKey>` ↔ ticket mapping (repo resolved from a project→repo
  config map, or a `repo:` field convention on the issue). New comments on
  a mapped issue → the two-path model: live run → steer; parked in-review
  → revision event + wake (same as PR/Slack feedback).
- **Outbound** (`onStatusChange` hook): transition the Jira issue along a
  configurable status map (queued→In Progress, in-review→In Review,
  done→Done) and comment with the PR link when it goes up. Errored →
  comment + flag, never auto-reopen loops.
- **Done stays external-only**: Jira "Done"/"Closed" transition (like PR
  merge) is an accepted completion signal; the agent still can't
  self-complete.
- Config: `JIRA_BASE_URL`, `JIRA_EMAIL` + `JIRA_API_TOKEN` (or OAuth),
  `JIRA_WEBHOOK_SECRET`; per-project repo map in KV (`jira-project:<key>`).

Exercises every part of the plugin contract (webhook verify/parse, hooks,
Core.fileTicket — which needs adding to Core services) and makes Workhorse
usable from where tickets already live.

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

### Chat-first home page
Replace the form-first home with a dispatch surface built around ONE chat
box (the fleet agent — today's `/chat` — promoted to the front door):

- **Repo attachments**: toggle chips under the chat box for repos already
  seen in the fleet (derived from existing tickets, most-recent first);
  attaching a repo scopes the message to it. An **Add new** button appends
  a repo text input right under the chat box for first-time repos.
- **Per-repo workflow select**: next to each attached repo, a workflow
  picker (`GET /workflows`) with a **create new workflow** entry that
  jumps into the workflow builder (see vue-flow item above).
- **Dispatch semantics**: message + attached repo(+workflow) → files a
  ticket directly; message with no repo attached → plain fleet-agent chat
  (status questions, steering, knowledge Q&A).
- **Running fleet strip** underneath: the currently active tickets
  (live phase badges), with **View all running agents** / **View all
  agents** links to the full fleet list (today's index, filtered/unfiltered).

Depends on: registry UI slice 1 (picker); pairs with the vue-flow builder
("create new workflow" target).

### R2 blob plane (build cache + oversized blobs)
Add an R2 bucket for the things KV structurally can't hold (25 MiB value
cap, blob-shaped data):

- **Dependency/workspace cache** — the headline win. Cold sandboxes (every
  revision wake after an in-review park, every heal, every repeat ticket on
  a known repo) currently rebuild `node_modules` from scratch. After a
  successful run, tar the dependency artifacts keyed by
  `repo + lockfile hash`; at `prepareWorkspace`, restore via a presigned
  URL (`curl | tar x` — the sandbox never holds an R2 credential, same
  custody model as the scoped browser token). Lockfile-hash keying makes
  staleness a non-problem. Node-first; measure restore-vs-install in the
  trace before generalizing to other stacks.
- **Magic Context db overflow** — the per-repo `context.db` KV round-trip
  silently SKIPS persisting when the db outgrows the KV cap (real memory
  loss on chatty repos). R2 removes the ceiling; same restore/persist code,
  different store. (Vectorize is NOT the answer here: the MC db is mostly
  relational SQLite + FTS with local ONNX embeddings, queried in-process on
  the agent's hot path — fleet-side semantic search is already covered by
  AI Search.)
- **Trace archive overflow** — big runs can brush the KV value cap; move
  trace blobs to R2, keep the small per-ticket index in KV.

### Paste plugin (text/code hosting)
`plugins/paste` — imgup's sibling for text: a sandbox tool
(`upload_text` / `share_snippet`) that hosts arbitrary text/code and
returns a raw, curl-able URL. Uses [paste.rs](https://paste.rs) (or a
small fallback chain, mirroring imgup's multi-host robustness lesson —
single keyless hosts are individually unreliable). Sandbox-only plugin,
no worker half.

Use cases: agents sharing repro scripts / long logs / patches in PR
comments and Slack replies without blowing comment size limits; handing
a colleague-agent (or human) a `curl`-able artifact; verifier attaching
full failing-test output to its verdict. If the R2 blob plane lands
first, a self-hosted variant (R2 + presigned GET) is the zero-dependency
alternative — same tool surface, our own storage.

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
