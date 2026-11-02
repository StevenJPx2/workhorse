# `approvals`

**Kind:** contract, layer 1. **Status:** proposed, not built. Built second, because steering and grants both need it.

How a human answers a request for a decision. Two things ask: a steering rule whose verdict is "ask", and an agent that wants a wider grant.

## Owns

- Request and answer records.
- The queue's state machine: pending, answered, expired, withdrawn.
- Request IDs, so a request or an answer sent twice applies once.

## Does not own

- Where the question appears (terminal, phone): that belongs to [`control`](control.md) clients.
- What an approved widening changes: that belongs to [`grant`](grant.md).
- Storage: the daemon in [`workhorse`](workhorse.md) supplies it.

## Depends on

[`grant`](grant.md), to describe a requested widening. Pure Rust with no I/O; also builds for wasm.

## Decisions

- **One approval queue** (2026-11-02). Every request for a human decision goes to it, is answered the same way from any device, and is recorded.
- **An approval is either "once" or "add to the grant"** (2026-11-02).
- **An approval shows the exact change it would make** (2026-11-02).
- **An unanswered request is denied after a timeout** (2026-11-02). Each kind of request has a default timeout; the denial is recorded, and the agent is told its request was denied.

## Open questions

- The default timeout for each kind of request.
- Whether a request ID is required from every requester.

## Evidence

- [nanocode](../evidence/nanocode.md): caller-chosen request IDs make a repeated submission return the existing result.
