# `workhorse`

**Kind:** composition root, layer 1. **Status:** proposed, not built.

The command-line tool and the daemon. It is the only place concrete implementations are chosen and wired together.

```sh
workhorse run --profile repo-work -- opencode   # start an agent under a profile
workhorse status                                # every session's grant and recent denials
```

## Owns

- The CLI.
- The daemon process, which hosts the [`broker`](broker.md), [`gateway`](gateway.md), [`steering`](steering.md) evaluation and the [`approvals`](approvals.md) queue, and serves [`control`](control.md).
- Loading profiles, storing sessions, approvals and logs.
- Starting each agent through [`sandbox`](sandbox.md).

## Does not own

Any rule. Every decision about access, verdicts or approvals belongs to a contract module.

## Depends on

Every layer 1 module.

## Decisions

- **One daemon process** hosts the broker, gateway, steering and approvals, kept as separate crates. Each agent runs in its own sandboxed process (2026-11-02).
- **Each session prints a one-screen summary of its grant** when it starts (2026-11-02).
- **The daemon starts on demand** (2026-11-02). `workhorse run` starts it if it is not running, and it exits when no session remains. Nothing idles.
- **It launches local MCP servers** in their own sandboxes under their own grants, as it does agents (2026-11-02).

## Open questions

- Reaching the daemon from a phone when it is not running: this belongs to layer 2's link.
