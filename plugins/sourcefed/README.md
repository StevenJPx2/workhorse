# SourceFed plugin

The host daemon's event bridge into the fleet, plus the monitor verbs that
talk back to it.

## Live host setup (macOS, this machine — M3d, verified 2026-08-13)

- Daemon: `node .../@fdcn/sourcefed@0.2.4/dist/cli.js daemon --port 18787`,
  state in `~/.local/state/sourcefed/` (`monitors.json`, `events.json`),
  webhook listener also on `127.0.0.1:8788`. Requires `GH_TOKEN` (or
  `GITHUB_TOKEN`) in its env for GitHub POLLING — without it polls silently
  no-op. Restart after adding the token preserves monitors (state on disk).
- Bridge: `host/sourcefed-bridge.mjs` under launchd
  (`com.workhorse.sourcefed-bridge`, `~/Library/LaunchAgents/`). Subscribes
  to `GET /events?target=<base64 JSON target>` and forwards each event to the
  worker's `/webhooks/sourcefed` with `X-SourceFed-Secret` (read from
  `~/.config/sourcefed/worker-webhook-secret`). Monitor name prefix
  `ticket:<id>` routes events to that ticket; other events become monitor
  frames (trigger path). MONITOR SWEEPER (verified 2026-08-13): every 60s it
  lists the worker's tickets (master token from
  `~/.config/sourcefed/worker-master-token`) and creates a `ticket:<id>`
  github-pr monitor for every implementing/in-review ticket with an open PR
  that lacks one — parked-ticket wake coverage is self-healing, which is the
  prerequisite for retiring the github/jira webhook plugins (M3e).
- Daemon JSON-RPC (verified live): `POST /rpc` with
  `{jsonrpc, id, method, params}` — methods `monitor.create` (params:
  `target:{kind,id}`, `name`, `sourceType` ("github"), `repo`, `prNumber`,
  `pollIntervalSec?`), `monitor.list/status/stop/start/remove` (params:
  `target`, `id`). Events stream: SSE `data: {type:"event", events:[{id,
  monitorID, event:{kind,summary,...}}]}` — the FIRST poll after create primes
  the cursor (existing comments do NOT emit); a new comment then emits.

## Channel decision (M3e, decided 2026-08-13): keep BOTH paths

Retiring the github/jira webhook plugins was conditional on the sourcefed
pilot. The pilot succeeded and the bridge sweeper now guarantees monitor
coverage for every parked ticket — but the availability comparison decides
against retirement: the webhook plugins run on Cloudflare (always on), while
the daemon + bridge run on the dev workstation (a Mac that can be off — the
same reason the old custodian box is unreachable today). Retiring would make
wake coverage depend on a workstation's uptime. KEEP both: the webhook
plugins are the instant, always-on delivery path; sourcefed is the
self-healing poll path (60s) that also carries host-side monitors. Slack
chat stays the operator channel.

## Two directions

```
┌─────────────────────── host (your machine, systemd) ───────────────────────┐
│  sourcefed daemon: monitors (PR poll, Jira poll, health)                    │
│     │                                                                       │
│     │ POST /webhooks/sourcefed   (DaemonEventFrame, X-SourceFed-Secret)     │
│     ▼                                                                       │
└──────────────────────────── worker ────────────────────────────────────────┘
   ticket frames → appendEvents + wakeTicket (parked run revises with the
                   feedback in context)
   monitor frames → fireTrigger(name, payload) (files a ticket from the
                   trigger's template)
   sourcefed_monitor_* tools → RPC to the daemon (create/list/status/stop/start)
```

## DaemonEventFrame (worker ← daemon)

```jsonc
{ "ticketId": "abc123", "kind": "pr-review", "summary": "reviewer requested changes",
  "actor": "steven", "deliveryId": "uniq-1" }
{ "kind": "monitor", "monitor": { "name": "gh-pr-watch", "payload": { "repo": "a/b" } },
  "deliveryId": "uniq-2" }
```

`deliveryId` is optional but recommended: the worker skips redeliveries of
an already-processed id (KV marker, 24h TTL, written only after the durable
op succeeds — a failed firing stays retryable). The webhook acks immediately
(`{ ok, accepted }`); processing runs via `ctx.waitUntil`.

## Monitor RPC (worker → daemon)

`SOURCEFED_DAEMON_URL` points at the daemon. Same shared secret header.

| Method | Path | Body |
|---|---|---|
| POST | /monitors | `{ kind, target, intervalSec?, note? }` |
| GET | /monitors | — |
| GET | /monitors/{id} | — |
| POST | /monitors/{id}/stop | — |
| POST | /monitors/{id}/start | — |

`kind`: `github-pr` (`owner/repo#42`), `github-ci`, `jira-issue` (`PROJ-123`),
`repo-ci` (`owner/repo`), `web` (URL).

## Secrets

- `SOURCEFED_WEBHOOK_SECRET` — shared secret, both directions (worker secret
  + daemon config).
- `SOURCEFED_DAEMON_URL` — worker var pointing at the daemon.
