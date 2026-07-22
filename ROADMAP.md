# Workhorse Roadmap

**North star:** controllable autonomous agents. Autonomy comes not from a
bigger model but from giving a smaller model the right tools and the right
context at the right *stage* of a workflow. Three required properties:
autonomous-but-staged, observable-and-conversational, and a fleet.

Status legend: ✅ shipped · ⏳ planned · 🅿️ tabled

---

## Shipped ✅

- **Engine v1.1 — RPC stage sessions** — every stage is a live
  `pi --mode rpc` process (FIFO command pipe + append-only events.jsonl
  tailed by byte offset). Native steer at turn boundaries (context
  intact; kill-and-re-run only for dead stages), in-session `set_model`
  promotion, `agent_settled` completion, typed `auto_retry` model-failure
  classification, per-stage token/cost/context stats into state + traces,
  structured live transcripts for `/output` and activity.
- **One tool per task: submit_work + write gate** — the workflow-gate
  sandbox extension owns stage completion (`submit_work` writes
  analysis.md + control.json; read-only stages need zero general write
  capability) and mechanically blocks write/edit outside a stage's
  `writeAllow` globs via the tool_call event.
- **Knowledge attachments** — plugin-provided context:
  `AttachmentProvider {kind, match, resolve}` on the manifest; repo
  (tickets), jira (issue+comments), slack (thread) providers; dispatch
  resolves refs into a bounded `## Attached context` prompt section;
  home composer recognizes pasted refs as chips; ticket-page attach
  (live→steer, parked→event); `/attachments/match`.
- **Triggers** — `trigger:<name>` registry (source + template +
  workflow + routing); core owns the cron sweep (5-field matcher,
  lastFiredAt dedupe) + secret-gated `POST /triggers/:name/fire`;
  plugins own surfaces via `triggers[]` + `Core.fireTrigger` —
  `@workhorse trigger <name> …` Slack mentions, `trigger <name> …` Jira
  comments.
- **Notification bus** — D1 `notifications` queue; `Core.notify` is the
  one verb for operator input (slack/jira migrated off the
  steer-vs-event fork); workflow-declared read points
  (`notifications: "read"` on verify+fix; parks and the revision loop
  always collate); `urgent` delivers into the live session; Inbox tab
  with read receipts.
- **ntfy** — fleet pushes live via homelab `ntfy.stevenjohn.co`
  (`workhorse` topic, token-authed).
- **Staged workflow engine** — `@workhorse/workflow` on the Cloudflare
  Workflow durable spine. Coding pipeline: `plan → implement → verify →
  fix`, per-stage tool ceilings CLI-enforced.
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
  Cloudflare `BROWSER` binding, with agent-browser handling bot-walled sites
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
- **`@workhorse/workflow` — the workflow engine** — pi-workflow replaced
  outright: spec compile + validation (worker-side at `PUT /workflows`),
  graph routing, run lifecycle, per-stage bare Pi sessions with CLI-level
  tool ceilings, typed FailureKind classification, control verbs (steer/
  promote/inject-input/retry/cancel), loop-until stages — 12 vitest
  tests on a mock Driver. The CF spine is durability plumbing.
- **Non-PR outcomes + workflow inputs + awaiting-input** — terminal-stage
  `outcome: pr|report|artifact`; report/artifact park as
  awaiting-acceptance with Accept/Request-changes (revisions loop);
  declared `inputs:` render as real controls at dispatch; stages request
  operator input mid-run via control.json → schema-rendered form →
  answers resume the stage.
- **Agent blocks** — reusable agent definitions (persona + frontmatter
  tool ceiling) as registry entries: CRUD at /agents, /agents page in
  the UI, seeded from baked agents, installed into every sandbox;
  stage.agent references a block, block tools = default ceiling.
- **Plugin-provided transitions** — Core.signalTransition: done/accepted/
  changes-requested emitted by any plugin (Jira Done rides it; reviewLoop
  honors jira-done/accepted alongside pr-merged).
- **GitHub read tools** — gh_pr/gh_ci/gh_issue/gh_search_code/gh_commits
  via a scoped /github proxy (GET allowlist; no self-completing actions).
- **semindex** — @workhorse/semindex over Workers AI embeddings +
  Vectorize; scripts/workflows/tools corpora; find_script + find_tool
  sandbox tools; GET /find; reindex admin route. Verified live.
- **Web search plugin** — tavily/exa/brave chain behind /search +
  web_search tool (keys worker-side; SEARCH_PROVIDER picks the default).
- **evals/** — evalite on vitest: workflow-validator eval (8/8 green,
  keyless) + search-provider harness over trace-shaped fixtures.
- **Live agent output + run-centric ticket page** — GET
  /tickets/:id/output tails the running stage's session log; ticket page
  rebuilt around the Run card (graph + streaming output + steer), with
  Result/Task/Pipeline/History as tabs. Workflows editor fixed (proxy
  shape + SSR) and verified with Playwright.
- **Glance integration** — homelab widget v2 (running/parked/errored
  strip, deep links) + the UI's /embed compact tile; deployed to the
  server.
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

(clear — everything below shipped 2026-07-22; see Shipped)

---

## Planned ⏳

### Browser plane v2 — long-lived sessions (replacement architecture)
The current plane is STATELESS: every `browser_*` call is one
Browser-Rendering launch → act → close; no cookies, no login state, no
multi-step flows. Replace it with a three-tier plane:

1. **Stateful tier (new default for interaction)** — a hosted browser
   vendor with persistent sessions (evaluate Browserbase / Browser Use /
   Browserless; agent-browser's provider plugins are the integration
   sketch). New sandbox tools operate on a session: `browser_session`
   (open/close, returns id), `browser_act` (click/fill/press/scroll by
   AX ref), `browser_snapshot` (accessibility tree with refs — the
   token-cheap "what's on this page"), plus session-scoped
   screenshot/record. Sessions map 1:1 to a ticket run, credentialed
   worker-side, with recording/replay for the trace archive. Unlocks
   login flows, "test the signup e2e", stealth/CAPTCHA handling.
2. **Stateless read tier** — the jina tools (`web_search`, `web_read`)
   own one-shot "fetch this page as text/markdown"; today's
   `browser_fetch` text/html/links modes fold into them.
3. **Fallback/cheap tier** — [Lightpanda](https://lightpanda.io) (or the
   CF binding retained) for fast headless fetch+screenshot when a full
   Chrome session is overkill; also the local-dev path.

Migration: keep tool names stable where semantics survive
(`browser_screenshot`/`browser_record` become session-or-oneshot);
verify-stage steals ride along — content boundaries on all fetched text,
`browser_diff(url, baseline)` pixel diff, annotated screenshots
(numbered AX labels) for interactive flows.

---

## Feasibility notes

### PixelRAG (assessed 2026-07-22: not now, one narrow candidate)
[PixelRAG](https://github.com/StarTrail-org/PixelRAG) renders documents
as screenshot tiles and retrieves over the IMAGES (LoRA-tuned
Qwen3-VL-Embedding + FAISS/Qdrant) — visual RAG that preserves tables,
charts, and layout that text parsing loses. Verdict against our stack:

- **Fleet knowledge / semindex / Magic Context: no.** Our corpora are
  born-textual (run analyses, scripts, workflow specs, code) — pixel
  retrieval solves a problem we don't have, and the serving cost is a
  GPU-ish embedding model + a FAISS/Qdrant service, versus zero-ops
  Workers AI + Vectorize / AI Search.
- **The narrow candidate: verify-stage visual evidence.** Screenshot-heavy
  flows (screenshot-pr, future UI-regression workflows) could use
  `pixelshot` (their standalone renderer CLI, no index needed) as a
  sandbox tool for tiled full-page captures — our browser plane already
  does CDP screenshots, so this only earns a slot if tiling/PDF handling
  proves materially better on a real workflow.
- **Re-entry criteria:** a workflow whose RETRIEVAL corpus is inherently
  visual (design-system screenshots, PDF-heavy docs repos, dashboard
  archaeology) with recall problems that text embedding demonstrably
  fails; then a Qdrant-backed pixel index (their supported backend) slots
  behind a semindex-style interface without touching consumers.

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
  Soft/monitor-mode sites pass
  through Tier 1 natively.
- **Image hosting** — no single keyless host is reliable: catbox throttles
  datacenter IPs to 0-byte serves, 0x0.st has uploads disabled. The upload tool
  walks a fallback chain and verifies each URL serves real bytes before
  accepting it. Probe from the sandbox IP before trusting a new host.
