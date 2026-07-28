# Workhorse

[![CI](https://github.com/StevenJPx2/workhorse/actions/workflows/ci.yml/badge.svg)](https://github.com/StevenJPx2/workhorse/actions/workflows/ci.yml)
[![health](https://img.shields.io/endpoint?url=https%3A%2F%2Fraw.githubusercontent.com%2FStevenJPx2%2Fworkhorse%2Fmain%2Freports%2Fbadge.json)](#quality)

**Controllable autonomous coding agents.** A Cloudflare-native fleet
orchestrator: file a ticket, an agent plans and implements it autonomously
in an isolated cloud sandbox, using a small model kept capable by giving it
the right tools and context at each workflow stage.

## Architecture

```mermaid
flowchart LR
    OPS["Operators<br/>UI · Slack · GitHub · Jira"]
    WORKER["Worker (control plane + brain)<br/>ticket spine · workflow defs<br/>in-process stage sessions · plugins"]
    SANDBOX["Sandbox (per ticket)<br/>cloned repo · tool exec (hands)"]
    STATE[("State<br/>D1 · KV · R2 · Vectorize · AI Search")]
    LLM["Anthropic<br/>(subscription OAuth)"]

    OPS -->|"tickets · steers · inputs · webhooks"| WORKER
    WORKER -->|"tool calls: exec / read / write"| SANDBOX
    WORKER -->|"agent loop (flue harness)"| LLM
    WORKER --> STATE
    WORKER -->|"branch + PR / report"| OPS
```

**Flue-first:** the agent loop runs **in the Worker** (via the
[flue](https://flueframework.com) harness), not as a subprocess. Each
workflow stage is one in-process `session.prompt(...)`; its tool calls
(`bash`/`read`/`write`, plugin tools) execute in the sandbox container over
RPC. The container is just hands — it holds the cloned repo and never holds a
model credential.

**Planes:**

| Plane | Runs on | What |
|---|---|---|
| Spine | Cloudflare Workflows | one durable instance per ticket: dispatch, drive, parks (`waitForEvent`), capacity waits (`step.sleep`), delivery |
| Engine | `packages/workflow` | hard-coded, eval-tested `WorkflowDef`s (declarative `stages` manifest + imperative `run(ctx)` routing) + the `ctx.stage()` helper. No interpreter, no spec registry. |
| Stage session | Worker (flue harness) | each `ctx.stage()` is one in-process flue session; tools are the plugins' `tools.ts` factories, intersected with the stage allowlist |
| Muscle | Cloudflare Sandbox | per-ticket container: the cloned repo + tool exec. No Pi, no baked model credential. |
| Brain | Anthropic (Claude subscription OAuth) | called from the Worker by the flue harness |
| Memory | D1 + KV + R2 + Vectorize + AI Search | records in D1; hot state in KV; blobs (traces, repo memory, dep cache) in R2; semantic registries (scripts/workflows/tools) in Vectorize; fleet-wide run knowledge in AI Search |
| Token custody | homelab server | holds+refreshes the OAuth refresh token; pushes short-lived access tokens to the Worker (`POST /token`) |
| Face | Nuxt UI (`ui/`) | chat-first home, fleet list, run-centric ticket page with live output, read-only workflow graph, agent blocks, `/embed` for dashboards |

**Workspace (hard boundaries):** `packages/api` is the contract; each
`plugins/<name>` package depends on it and nothing else (enforced by
workspace resolution); `worker/` is the only package that imports concrete
plugins. A plugin's stage tools live in `tools.ts` (worker-side flue tools);
an optional `extension.ts` (Pi tools for the fleet chat) is auto-discovered
by the sandbox image build.

**Workflows are code; the rest is data.** A workflow is a hard-coded,
eval-tested `WorkflowDef` in `packages/workflow` — adding one is a def + an
eval case, never an upload. Agent blocks (persona + tool ceiling, referenced
by `stage.agent`) and scripts (agent self-extension, D1 registry) remain
registry data editable from the UI. A workflow's terminal stage declares its
outcome — `pr` (external merge completes), `report`/`artifact` (operator
acceptance completes). Completion signals are pluggable
(`Core.signalTransition`): PR merge, Jira Done, and the UI's Accept button are
the same mechanism.

## Plugins

Each plugin is a single `plugins/<name>/` package with an optional worker half (routes, hooks) and an optional sandbox half (Pi extension). Plugins depend only on `@workhorse/api`; the worker is the sole composition point.

### browser
| | |
|---|---|
| Package | `plugins/browser` |
| Worker | No-op shell (BROWSER_TOKEN for sandbox auth) |
| Sandbox tools | `browser_open`, `browser_snapshot` (AX tree + refs), `browser_read`, `browser_act` (click/fill/type/scroll by ref), `browser_screenshot`, `browser_record` (timed frame capture → GIF) |
| Implementation | [agent-browser](https://github.com/vercel-labs/agent-browser) CLI daemon, persistent session per run; stateless reads use jina (`web_read`)|
| Secrets | `BROWSER_TOKEN` (scoped sandbox callback token — auto-injected) |

### github
| | |
|---|---|
| Package | `plugins/github` |
| Inbound | PR/issue webhooks → fileTicket, PR merge → done, PR close → terminated, PR comments → notification bus |
| Outbound | onStatusChange → PR comments (what changed, revision notes) |
| Sandbox tools | `gh_pr`, `gh_ci`, `gh_search_code`, `gh_commits` (read-only via scoped proxy) |
| Secrets | `GITHUB_TOKEN` (fleet GitHub PAT), `GITHUB_WEBHOOK_SECRET` (webhook HMAC) |

### slack
| | |
|---|---|
| Package | `plugins/slack` |
| Inbound | @mention → fleet chat or `trigger <name>` fire; thread replies → notification bus (urgent for live runs) |
| Outbound | onStatusChange → thread replies |
| Attachment providers | `slack` (thread, resolved on demand via `fetch_context`) |
| Triggers | `slack-mention` (Slack TriggerSource for `Core.fireTrigger`) |
| Secrets | `SLACK_SIGNING_SECRET` (webhook HMAC), `SLACK_BOT_TOKEN` (bot API) |

### jira
| | |
|---|---|
| Package | `plugins/jira` |
| Inbound | Issue assigned to agent account or labeled `workhorse` → fileTicket; comments → notification bus |
| Outbound | onStatusChange → issue transitions + PR-link comments |
| Attachment providers | `jira` (issue + comments, resolved on demand via `fetch_context`) |
| Triggers | `jira-mention` (Jira TriggerSource for `Core.fireTrigger`) |
| Secrets | `JIRA_BASE_URL`, `JIRA_EMAIL`, `JIRA_API_TOKEN` (Jira REST API), `JIRA_WEBHOOK_SECRET` (webhook HMAC), `JIRA_AGENT_ACCOUNT` (agent Jira username) |

### knowledge
| | |
|---|---|
| Package | `plugins/knowledge` |
| Sandbox tools | `search_fleet_knowledge` (AI Search semantic index of every past run) |
| Worker routes | `POST /knowledge/search` (federated search), `POST /knowledge/reindex` (backfill) |
| Bindings | `AI_SEARCH` (AutoRAG namespace), `BLOBS` (R2 bucket for trace storage) |

### imgup
| | |
|---|---|
| Package | `plugins/imgup` |
| Sandbox tools | `upload_image` (multi-host chain: imgbb → catbox → …, serve-verified) |
| Config | `WORKHORSE_IMGUP_BIN` (optional: path to imgup binary, default `/usr/local/bin/imgup`) |

### scripts
| | |
|---|---|
| Package | `plugins/scripts` |
| Sandbox tools | `list_scripts`, `run_script`, `write_script` |
| Worker routes | `GET/POST /scripts`, `GET /scripts/get?ticket=` |
| Registry | D1 `scripts` table; `.workhorse/scripts.toml` seeds |

### tickets
| | |
|---|---|
| Package | `plugins/tickets` |
| Stage tools | `fetch_context` (resolve a repo/Jira/Slack ref on demand — the enrichment path; refs are parsed from the task prompt, not manually attached) |
| Fleet-chat tools (`extension.ts`) | `workhorse_file_ticket`, `workhorse_list_tickets`, `workhorse_ticket_status`, `workhorse_ticket_diff`, `workhorse_find_workflow` (semindex-ranked workflow pick) |
| Worker routes | ticket CRUD, dispatch, `/refs` (frecency-ranked recent context refs), `/attachments/match`\|`/resolve`, notification bus (`notify`/`notifications`) |
| Attachment providers | `repo` (the "attach a repo" source) |

### paste
| | |
|---|---|
| Package | `plugins/paste` |
| Sandbox tools | `upload_text` (text → curl-able URL; paste.rs → 0x0.st fallback chain) |

### ntfy
| | |
|---|---|
| Package | `plugins/ntfy` |
| Outbound | onStatusChange/onTraceArchived → ntfy push (priority-mapped; silent when NTFY_URL unset) |
| Secrets | `NTFY_URL` (ntfy server, e.g. `https://ntfy.stevenjohn.co`), `NTFY_TOPIC` (topic name), `NTFY_TOKEN` (bearer auth, optional) |

### search
| | |
|---|---|
| Package | `plugins/search` |
| Sandbox tools | `web_search` (jina → exa fallback chain), `web_read` (jina reader, clean markdown) |
| Secrets | `JINA_API_KEY` (primary search/reader), `EXA_API_KEY` (fallback search), `TAVILY_API_KEY` / `BRAVE_API_KEY` (additional fallbacks) |

## Semantic index (not a plugin)

`packages/semindex` is a reusable Vectorize-backed index toolkit;
`worker/src/semindex.ts` defines the fleet corpora (scripts, workflows,
tools), reindexed via `POST /admin/reindex-semindex` and queried through
`GET /find?corpus=…`. The live query tool is `workhorse_find_workflow` (in the
tickets fleet-chat extension), which ranks workflows for a task before filing.

## API (bearer-gated)

```
POST /tickets {title?, repo, prompt, workflow?, inputs?} → durable run
GET  /tickets · GET /tickets/:id            → fleet list / record + live status
POST /tickets/:id/steer {message}           → interrupt + redirect the live stage
POST /tickets/:id/input {answers}           → answer an awaiting-input park
POST /tickets/:id/accept · /request-changes → acceptance verdicts (report/artifact)
POST /tickets/:id/heal · /stop              → re-dispatch errored / terminate
GET  /tickets/:id/activity · /output · /traces · /diff
POST /chat {messages}                       → fleet operator agent
GET  /workflows · GET /workflows/:name      → hard-coded workflow defs (read-only)
GET/PUT/DELETE /agents/:name                → agent block registry
GET  /scripts · POST /scripts               → script registry (scoped)
GET  /find?corpus=scripts|workflows|tools   → semantic search (scoped)
GET  /refs                                  → frecency-ranked recent context refs
POST /token · GET /token                    → custodian OAuth push · freshness
GET  /github?path=…                         → read-only GitHub proxy (scoped)
POST /webhooks/github · /slack · /jira      → verified sources
```

## Dev

```
bun install
bun run check        # lint + typecheck + per-package health (local gate)
bun run test         # vitest across every package
bun run test:contract # real-binary contract suites (needs agent-browser, aft, imgup)
bun run report       # regenerate the quality report + README table
bun run secrets      # audit the secret contract against the deployed worker
bun run eval         # evalite (evals/ — agent-vs-workflow + search providers)
bun run dev          # local worker (needs Docker for the sandbox container)
bun run deploy       # deploy worker + container image (from worker/)
```

Secrets are declared in [`secrets.json`](./secrets.json) — every entry states its
purpose, what breaks without it, and where to obtain it. `bun run secrets:missing`
prints the exact setup command per gap. Dev values in `.dev.vars` (git-ignored).

## Quality

<!-- quality:start -->
![health](reports/health.svg)

**20 packages** · 464 passing · all at or above floor

| package | grade | score | trend |
|---|---|---:|---|
| `worker` | C | 62.3 | `▅▅▅▅▅` |
| `ui` | A | 87.2 | `▇▇▇▇▇` |
| `plugins/github` | A | 90.0 | `▇▇▇▇▇` |
| `plugins/jira` | A | 90.0 | `▇▇▇▇▇` |
| `plugins/slack` | A | 90.0 | `▇▇▇▇▇` |
| `packages/workflow` | A | 99.7 | `█████` |
| `evals` | A | 100.0 | `█████` |
| `packages/api` | A | 100.0 | `█████` |
| `packages/semindex` | A | 100.0 | `█████` |
| `packages/test-utils` | A | 100.0 | `█████` |
| `plugins/aft` | A | 100.0 | `█████` |
| `plugins/browser` | A | 100.0 | `█████` |
| `plugins/imgup` | A | 100.0 | `█████` |
| `plugins/knowledge` | A | 100.0 | `█████` |
| `plugins/ntfy` | A | 100.0 | `█████` |
| `plugins/paste` | A | 100.0 | `█████` |
| `plugins/scripts` | A | 100.0 | `█████` |
| `plugins/search` | A | 100.0 | `█████` |
| `plugins/tickets` | A | 100.0 | `█████` |
| `plugins/todo` | A | 100.0 | `█████` |

<sub>Generated by `bun run report` · fixed 0–100 scale · test files excluded from scoring</sub>
<!-- quality:end -->

Regenerate with `bun run report`. Every PR gets the same digest on its
[Actions run summary](https://github.com/StevenJPx2/workhorse/actions), plus a
`quality-report` artifact with the full HTML view.

Roadmap: [ROADMAP.md](./ROADMAP.md). Legacy Workhorse (TS core, core-v2/v3,
Rust orchestrator) lives on the `legacy` branch.
