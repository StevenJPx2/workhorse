# Overview

**Status:** agreed direction, 2026-10-30. Nothing here is built. [`ARCHITECTURE.md`](ARCHITECTURE.md) keeps the original vision notes; this page says how they fit together.

## What Workhorse is

Workhorse is a set of open protocols in three layers. Each layer depends only on the layers below it, and each can be used without the layers above it.

```mermaid
flowchart TB
    H["3 · Harness<br/>agent loop, context, subagents"] --> R
    R["2 · Runtime<br/>durable mailbox, link between devices, hosts"] --> T
    T["1 · Trust<br/>grants · sandbox · broker · tool gateway · steering"]
    E["Existing agents<br/>OpenCode · Pi · Claude Code · Codex"] -->|"tack"| T
```

The first user is one developer running existing coding agents on a laptop and a home server, who wants them safe, steerable and observable. That user needs layer 1 only, so layer 1 comes first.

## Layer 1: Trust

Whatever the harness, an agent reaches files, network, secrets and tools only through these, and a human can see and change all of it.

| Protocol | Question it answers |
|---|---|
| **Grants** | What may this agent touch: paths, hosts, secrets by name, tools |
| **Sandbox** | How an operating system enforces a grant (nono on macOS, bubblewrap on Linux) |
| **Broker** | How network traffic leaves, with secrets added outside the agent so the agent never holds them |
| **Tool gateway** | How an agent reaches MCP servers through one door that applies its grant |
| **Steering** | Rules that fire on an agent's events and block, rewrite, or ask a human |

## Layer 2: Runtime

Agents that outlive a terminal: a durable mailbox (an agent is a log plus an inbox), a link between devices, and a contract for hosts (native, workerd or Cloudflare, Rivet). Every agent it runs is under a layer 1 grant.

## Layer 3: Harness

The agent loop and its context: compaction, prompt caching, skills, codemode, subagents. Equestrian, Stable, Mule and Polo are harnesses. Until there is one, existing agents fill this role.

## tack: the bridge

[`@workhorse/tack`](https://github.com/StevenJPx2/workhorse/tree/tack) is how existing agents reach layer 1. A plugin is written once and runs in OpenCode, Pi, Claude Code and Codex. It carries steering and tool routing into each agent. It is TypeScript because those agents load JavaScript plugins; its hooks call into layer 1. It is useful on its own and lives on its own branch.

## Rules

- **Adopt standards; invent only where none exists.** MCP for tools, ACP for sessions, the OpenAI-compatible API for models. Workhorse defines grants, sandbox policy, broker, steering and, later, the mailbox.
- **A protocol is a contract plus a conformance suite.** Rust provides the reference implementations; each protocol is its own crate, usable alone.
- **One-way dependencies.** Layer 1 knows nothing of layers 2 and 3.

## Order

1. Layer 1 protocols, one at a time, each with its contract, suite and a Rust implementation. Grants first, since the others enforce it.
2. tack, wired to steering.
3. Layer 2, reusing the evidence on `daemon-v0`.
4. Layer 3.

## Open questions

- The shape of a grant: per agent, per session, or per task; and how a human changes one while the agent runs.
- Whether the tool gateway and the broker are one process or two.
- Which steering events every agent can actually report (see tack's capability matrix).

## Evidence

Earlier work is evidence, not design. The `daemon-v0` branch holds the capability daemon, the sandbox, link, transport, workerd, kernel and agentOS spikes, and the uniform-stack proposal. The `legacy` and `fleet-v0` branches hold earlier versions.
