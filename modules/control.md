# `control`

**Kind:** contract, layer 1. **Status:** proposed, not built.

How a human, the CLI and tack talk to the daemon: start and stop sessions, read and change grants, list and answer approvals, and send agent events to steering for a verdict. It is layer 1's only new wire protocol.

## Owns

- The JSON-RPC methods, their parameters, results and errors.
- How a client proves who it is to the daemon.

## Does not own

- The meaning of grants, verdicts and approvals: those belong to [`grant`](grant.md), [`steering`](steering.md) and [`approvals`](approvals.md). This module carries them.
- Reaching the daemon from another device: that belongs to layer 2's link.

## Depends on

[`grant`](grant.md), [`steering`](steering.md) and [`approvals`](approvals.md), for the types it carries. Pure Rust with no I/O; also builds for wasm.

## Decisions

- **JSON-RPC** (2026-11-02): an existing standard, so only the methods are Workhorse's.
- **One protocol for every client** (2026-11-02): tack, the CLI and a phone use the same methods.

## Open questions

- The transport on one machine: a Unix socket is the likely default.
- How tack authenticates from inside a sandbox, given the sandbox allows only the broker.
- Whether events and verdicts share this protocol with the human-facing methods, or get their own narrower one.
