# Workhorse Roadmap

**North star:** controllable autonomous agents. Autonomy comes not from a
bigger model but from giving a smaller model the right tools and the right
context at the right *stage* of a workflow. Three required properties:
autonomous-but-staged, observable-and-conversational, and a fleet.

Status legend: ✅ shipped · 🔜 next · ⏳ planned · 🅿️ tabled

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
- **Plugin architecture** — `src/plugins/` `SourcePlugin` (Worker half:
  verify + parse webhooks) paired with sandbox-half Pi extensions
  (`bundles/plugins.json`). GitHub plugin live.
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
  `failureKind`) walks credential legs: fresh custodian OAuth token →
  metered `ANTHROPIC_API_KEY`. *Capability*: any stage can set
  `"delegate": true` (+ `delegateReason`) in its control block; the
  orchestrator marks the stage failed, patches the next model up the
  promotion chain (haiku → sonnet → opus, cap 2/run) into the compiled
  plan, and `resumeRun`s — downstream stages re-run via
  `invalidateOnDependencyResume`, upstream artifacts intact. Every
  escalation lands in `esc:<ticket>:<run>` and merges into the trace
  archive, so **evals reveal which stages genuinely need a bigger model**.

---

## Planned ⏳

### AI Search (Cloudflare AutoRAG)
Managed RAG over our own corpora — repo docs, past tickets, the trace archive
— exposing "search prior solutions before solving" as a native tool. Magic
Context holds the agent's working memory; AI Search holds fleet-wide
institutional knowledge.

### Slack bot
Exercises both plugin halves and both directions. Inbound: `@workhorse …` in a
channel → `/webhooks/slack` → file/wake a ticket; thread replies become
steering events (`thread ↔ ticket` mapping mirrors `pr:`). Outbound: status
transitions post into the ticket's thread. Q&A: "what's running?", "why did X
fail?" routed to the fleet-chat agent (later supercharged by AI Search).

### Mid-run interception from the UI
`pi-workflow` has no injection API for a running subagent, so interception
interrupts and **restarts the current stage** with the steer appended, upstream
artifacts intact. Between-stage injection is covered by external events.
(`/workflow continue` and `/workflow delegate` are unimplemented in pi-workflow
0.8.1.)

### A2A / agent communication
Graph-mediated handoff in pi-workflow carries typed stage outputs
(`control.json` / `analysis.md` / `refs.json`), `from` data edges (downstream
receives a `source-manifest.json`), `sourceProjection.include` (inline selected
upstream dot-paths), `inputPolicy.requiredReads` (fail-closed),
`foreach`/`reduce` fan-out/fan-in, and `dag` composites. Live peer-to-peer
messaging between concurrently running subagents is absent; adding it would take
a shared-filesystem mailbox + polling tool, or an orchestrator-level message
bus.

---

## Tabled 🅿️

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

The `bundles/` layout is designed so each new use case is cheap to add:
a `spec.json` (+ optional `agents/*.md`), baked via `Dockerfile COPY`. `coding`
and `screenshot-pr` are the first two; more use-case workflows to come.

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
