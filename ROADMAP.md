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
- **D1 structured store** — database `workhorse`: `tickets` (status/repo/
  updated indexes), `escalations`, `traces` index, `scripts` (ready for the
  script service). Data layer `worker/src/db.ts`; heal sweep + fleet list
  are single queries now; `GET /tickets?status=` + `GET /repos`;
  `POST /admin/backfill-d1` imported legacy KV (33 tickets, 24 traces).
  Division: D1 records · KV hot small state · R2 blobs · AI Search semantic.
- **R2 blob plane (core)** — bucket `workhorse-blobs`: Magic Context dbs
  (`mc/<owner/repo>.db` — the KV 25 MiB cap that silently dropped memories
  is gone) and trace bodies (`trace/<ticket>/<run>.json`), both with legacy
  KV read fallbacks. Dependency cache still planned (below).
- **Mid-run interception (steering)** — `POST /tickets/:id/steer` (+ steer
  input on the ticket page) queues an operator message; the driving
  workflow picks it up on its next burst, interrupts the current stage via
  pi-workflow's own `stopRun`, appends the steer to the stage's compiled
  prompt (operator instructions take precedence), and `resumeRun`s —
  upstream artifacts intact. Between-stage steers just re-prompt the
  not-yet-started stage. Steers land in the escalation record
  (`trigger: "steer"`) and the trace archive.

- **Jira plugin (first intake source)** — `plugins/jira`: assigned/labeled
  issues file tickets (`Core.fileTicket`; repo from `jira-project:<KEY>` KV
  map or a `repo:` description line); comments on mapped issues steer live
  runs / wake parked ones; ticket lifecycle mirrored onto the issue
  (transitions + PR-link comment); Jira Done/Closed accepted as external
  completion. Webhook auth via `?secret=` (Atlassian can't sign).
- **Script service (agent self-extension)** — `plugins/scripts`:
  `write_script` / `run_script` / `list_scripts` over the D1 `scripts`
  registry (strict validation, repo|global scope, live status gates, args
  as `ARG_<NAME>` env vars); `.workhorse/scripts.toml` seeding at prepare;
  gated into the coding spec (plan lists, implement/fix write, verify runs).
- **ntfy plugin** — hook-only push notifications: PR-up/done/errored/
  terminated + escalation digests, priority-mapped, silent when unset.
- **Paste plugin** — `upload_text`: raw curl-able text hosting
  (paste.rs → 0x0.st → dpaste.org) with serve-back verification.
- **R2 dependency cache** — cold sandboxes restore `node_modules` from
  `depcache/<owner/repo>/<lockfile-sha256>.tar.gz` (content-addressed,
  immutable); sandbox curls `/depcache` with the scoped token; saved after
  successful runs (400 MB cap), restored at prepare + revision re-prepare.
- **Registry UI + vue-flow workflow builder** — `/workflows` list +
  `/workflows/:name` editor: faithful ArtifactGraph canvas (stages=nodes,
  from-edges=connections, computed layout), side-panel stage config, raw
  JSON drawer, save through pi-workflow validation (422 surfaced verbatim),
  seed templates via Save-as; workflow picker on the ticket form; the
  ticket page's live pipeline renders the same graph with per-stage status.
- **Chat-first home** — `/` is one chat box: repo chips (from `/repos`) +
  add-new, per-repo workflow select (create-new → builder), message+repo
  files a ticket / bare message chats with the fleet agent; running-fleet
  strip with View-running/all links. Old form home lives at `/tickets`.

---

## Planned ⏳ (in priority order)

### Non-PR outcomes (configurable done states)
Not every fleet run should end in a pull request — some are research
tasks, audits, analyses, or one-off questions whose deliverable is a
REPORT, not a diff. Today the pipeline hard-codes PR-up → in-review →
merged = done; the "Open PR" affordance is baked in.

- **Outcome as a workflow property**: the spec's terminal stage declares
  its outcome kind — `pr` (today's flow), `report` (final artifact
  published as the result: ticket page + Jira/Slack comment + paste URL),
  or `artifact` (files delivered without a PR, e.g. a generated doc
  committed to a branch without review ceremony).
- **Done semantics per outcome**: `pr` keeps external-only completion
  (merge/close). `report` completes on operator acknowledgment — an
  explicit "Accept result" action in the UI (or Jira Done transition), so
  the agent still never self-completes; the accept affordance replaces
  the Open PR button and is configurable per workflow.
- The verify stage still gates: a research workflow's verifier judges the
  report against the task before it's offered for acceptance.

### Workflow input parameters + input-parked runs (json-render)
Two related upgrades to workflows-as-data, GitHub-Actions style:

- **Declared inputs**: a workflow spec declares typed input parameters
  (`inputs: {name, type, description, default, required, options?}` —
  the `workflow_dispatch.inputs` pattern). Triggering one from the UI
  renders those as real input controls (text/select/boolean/number)
  before dispatch; the values land in the task prompt / spec defaults.
  The file-ticket form and chat-first home render them dynamically via
  [vercel-labs/json-render](https://github.com/vercel-labs/json-render)
  (schema-driven UI from JSON — no hand-built form per workflow).
- **Input-parked runs**: a new park state where a RUNNING workflow stops
  and asks the operator for input mid-flight (today's only park is
  in-review). A stage declares an input request (same JSON schema),
  the run parks as `awaiting-input`, the ticket page renders the form
  via json-render, and submission resumes the run with the answers
  injected as a steer/handoff. Generalizes: approve/deny gates, choice
  points ("which of these three approaches?"), credentials-shaped input.

### Better Glance integration
The fleet lives on a homelab Glance dashboard today as (at best) a plain
iframe. Make it first-class:

- **Glance widgets over the existing API**: `custom-api` widget configs
  (Glance natively renders remote JSON) for fleet-at-a-glance — running
  tickets with live phase, errored count, last done, PR links. Ship as a
  documented `glance/` snippet folder in the repo (copy into your
  glance.yml).
- **Deep links**: every widget row links into the Nuxt UI ticket page.
- **Compact iframe mode**: a `/embed` route in the UI (header-less,
  dense, dark-aware) purpose-built for iframe embedding in dashboard
  tiles, instead of iframing the full app.

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
