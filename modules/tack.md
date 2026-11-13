# `tack`

**Kind:** bridge, TypeScript. **Status:** designed, not built. Lives in its own repository, [`wrkhse/tack`](https://github.com/wrkhse/tack).

How existing agents reach layer 1. A plugin is written once and runs in OpenCode, Pi, Claude Code and Codex. For Workhorse, it forwards each agent's hook events to [`steering`](steering.md) over [`control`](control.md) and applies the verdicts. It is also useful without Workhorse, as a general plugin SDK for coding agents.

## Owns

- One native plugin per agent from one plugin definition.
- Applying a verdict in each agent: block, rewrite, ask.
- Failing closed where the agent allows it.

## Does not own

- Deciding a verdict: that belongs to [`steering`](steering.md), evaluated in the daemon.

## Depends on

[`control`](control.md), for its wire format only. It never links the Rust crates.

## Decisions

- **TypeScript**, because those agents load JavaScript plugins (2026-10-30).
- **It forwards events and applies verdicts; the daemon decides** (2026-11-02).
- **It reaches the daemon through the broker**, on the reserved `control` path, with the session's token (2026-11-02). It can use only `control`'s inside methods.
- **If the broker is unreachable, it fails closed** where the agent allows it: no verdict means no action.

## Open questions

- Which events each agent really reports and enforces: [planned spike](../spike/resume-and-events/PLAN.md).

## Evidence

- `spike/unagent/` in `wrkhse/tack`: the design and the capability matrix.
