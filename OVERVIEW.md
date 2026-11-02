# Overview

**Status:** agreed direction. Nothing here is built. [`ARCHITECTURE.md`](ARCHITECTURE.md) keeps the original vision notes; this page says how they fit together.

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
| [**Grants**](modules/grant.md) | What may this agent touch: paths, hosts, secrets by name, tools |
| [**Sandbox**](modules/sandbox.md) | How an operating system enforces a grant (nono on macOS, bubblewrap on Linux) |
| [**Broker**](modules/broker.md) | How network traffic leaves, with secrets added outside the agent so the agent never holds them |
| [**Tool gateway**](modules/gateway.md) | How an agent reaches MCP servers through one door that applies its grant |
| [**Steering**](modules/steering.md) | Rules that fire on an agent's events and block, rewrite, or ask a human |
| [**Approvals**](modules/approvals.md) | How a human answers a request for a decision: a steering "ask" or a request to widen a grant |
| [**Control**](modules/control.md) | How a human, the CLI and tack talk to the other six: sessions, grants, approvals, steering verdicts |

In short: a grant belongs to one session and is made from a profile in the user's config. Everything is denied unless listed. A human can narrow a grant at any time, and it widens only by approval. All network traffic goes through the broker. Steering works inside the grant and never widens it. Every module's decisions, open questions and evidence are in its own file under [`modules/`](modules/).

## Layer 2: Runtime

Agents that outlive a terminal: a durable mailbox (an agent is a log plus an inbox), a link between devices, and a contract for hosts (native, workerd or Cloudflare, Rivet). Every agent it runs is under a layer 1 grant.

## Layer 3: Harness

The agent loop and its context: compaction, prompt caching, skills, codemode, subagents. Equestrian, Stable, Mule and Polo are harnesses. Until there is one, existing agents fill this role.

## tack: the bridge

[`@workhorse/tack`](https://github.com/StevenJPx2/workhorse/tree/tack) is how existing agents reach layer 1. A plugin is written once and runs in OpenCode, Pi, Claude Code and Codex. It carries steering and tool routing into each agent. It is TypeScript because those agents load JavaScript plugins; its hooks call into layer 1. It is useful on its own and lives on its own branch. See [`modules/tack.md`](modules/tack.md).

## Rules

- **Adopt standards; invent only where none exists.** MCP for tools, ACP for sessions, the OpenAI-compatible API for models. Workhorse defines grants, sandbox policy, broker, steering and, later, the mailbox.
- **A protocol is a contract plus a conformance suite.** Rust provides the reference implementations; each protocol is its own crate, usable alone.
- **One-way dependencies.** Layer 1 knows nothing of layers 2 and 3.

## Modules

These are layer 1's modules; layers 2 and 3 are split when they start. Crates follow protocol boundaries; processes are a deployment choice.

```mermaid
flowchart TB
    subgraph C["Contracts: pure Rust, no I/O, also built for wasm"]
        G["grant"]
        S["steering"]
        A["approvals"]
        K["control"]
    end
    subgraph E["Enforcers: native"]
        SB["sandbox<br/>nono and bubblewrap backends"]
        BR["broker"]
        GW["gateway"]
    end
    E --> C
    D["workhorse<br/>CLI and daemon, the composition root"] --> E
    T["tack (TypeScript)"] -->|"control protocol"| D
```

Arrows mean "depends on". Contracts depend only on other contracts, with `grant` at the bottom: `steering` and `approvals` use it, and `control` carries all three. Enforcers depend only on contracts, never on each other.

| Module | Kind | Owns |
|---|---|---|
| [`grant`](modules/grant.md) | Contract | Grant and profile schema; whether a grant allows an action; narrowing, and widening by approval |
| [`steering`](modules/steering.md) | Contract | Normalized agent events, the rule format, and verdicts: allow, block, rewrite, ask |
| [`approvals`](modules/approvals.md) | Contract | Request and answer records, the queue's state machine, request IDs |
| [`control`](modules/control.md) | Contract | JSON-RPC methods for sessions, grants, approvals and steering; used by tack, the CLI and a phone |
| [`sandbox`](modules/sandbox.md) | Enforcer | Turns a grant into an OS policy and launches the agent under it, with nono and bubblewrap backends |
| [`broker`](modules/broker.md) | Enforcer | The one network exit: checks the grant, adds secrets, logs every request, never follows a redirect |
| [`gateway`](modules/gateway.md) | Enforcer | An MCP proxy that exposes only the tools a grant lists |
| [`workhorse`](modules/workhorse.md) | Composition root | The CLI (`workhorse run --profile p -- opencode`) and the daemon; the only place implementations are chosen |
| [`conformance`](modules/conformance.md) | Test suites | One suite per protocol: grant vectors, escape probes, egress tests |
| [`tack`](modules/tack.md) | Bridge | On its own branch: forwards agent hook events over `control` and applies verdicts |

| Concern | Decision |
|---|---|
| Contracts | Schemas, serialization and rules only, no I/O, so they also build for wasm |
| Processes | One daemon, started on demand, hosts the broker, gateway, steering and approvals, kept as separate crates. Each agent and each local MCP server runs in its own sandbox under its own grant |
| Inside the sandbox | The broker is the only destination. tack reaches `control` through it on a reserved path, with a per-session token and a smaller set of methods |
| Standards | MCP for the gateway, JSON-RPC for `control`, ACP for sessions. Workhorse defines only the grant, steering and approval formats and the `control` methods |

## Roadmap

**Status:** proposed.

Each milestone is a vertical slice: the smallest set of modules that gives the first user something complete, through its real boundaries, on macOS and on the homelab's Linux. A milestone ends when its conformance suites pass, each with a deliberate break that makes it fail, and a real agent does real work under it.

```mermaid
flowchart LR
    S["Spike<br/>resume and events"] -.-> M2
    S -.-> M3
    M1["1 · Contained"] --> M2["2 · Asked"]
    M2 --> M3["3 · Steered"]
    M3 --> M4["4 · Tools"]
    M4 --> L2["5 · Reachable<br/>layer 2"]
    L2 --> L3["6 · Own harness<br/>layer 3"]
```

| Milestone | Delivers | Done when |
|---|---|---|
| **1 · Contained** | [`grant`](modules/grant.md), [`sandbox`](modules/sandbox.md), [`broker`](modules/broker.md), the `workhorse run` and `workhorse status` commands, and their suites | OpenCode completes a task with a real model under a profile. The model key reaches the provider through the broker and never appears in the agent's files or environment. A request outside the grant is denied and logged. Escape and egress suites pass |
| **2 · Asked** | [`approvals`](modules/approvals.md), [`control`](modules/control.md) on the Unix socket, live narrowing, widening by approval, restart and resume for file changes | A request to a host outside the grant appears in the queue. Answering it from the CLI as "once" or "add to the grant" takes effect; an unanswered one is denied at its timeout. A file-grant change restarts and resumes the session |
| **3 · Steered** | [`steering`](modules/steering.md), [`tack`](modules/tack.md) with `control` through the broker, one agent first, then the other three | A rule such as "ask before `git push`" stops the push until it is answered, in every agent. With the daemon down, the push stays blocked |
| **4 · Tools** | [`gateway`](modules/gateway.md), local MCP servers in their own sandboxes | An agent sees and calls only the tools its grant lists. Each server's network traffic goes through the broker |
| **5 · Reachable** | Layer 2: the link between devices and durable sessions, built from the evidence on `daemon-v0` | An approval is answered from a phone, and an agent session on the homelab survives a restart of the daemon |
| **6 · Own harness** | Layer 3: the first harness from [`ARCHITECTURE.md`](ARCHITECTURE.md) | Not planned until milestone 5 is done |

The [resume and events spike](spike/resume-and-events/PLAN.md) runs alongside milestone 1. Its results shape restart and resume in milestone 2 and the steering events tack relies on in milestone 3.

**Roadmap question:** which agent tack supports first in milestone 3. Recommended: OpenCode, because its in-process plugin can fail closed and rewrite tool input. Claude Code hooks are the alternative: they need no in-process code but fail open by default.

## Open questions

Each module's own open questions are in its file. These span modules:

- Whether every target agent resumes a session reliably enough for restart and resume, and which steering events each one really reports and enforces. [Planned spike](spike/resume-and-events/PLAN.md).

## Evidence

Prior work is evidence, not design. The `daemon-v0` branch holds the capability daemon, the sandbox, link, transport, workerd, kernel and agentOS spikes, and the uniform-stack proposal. The `legacy` and `fleet-v0` branches hold older versions of Workhorse. [`evidence/`](evidence/) holds notes on outside projects and what Workhorse takes from each, starting with [nanocode](evidence/nanocode.md).
