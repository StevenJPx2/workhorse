# `grant`

**Kind:** contract, layer 1. **Status:** proposed, not built. Built first, because every other module enforces it.

What an agent session may touch: files, network hosts, secrets by name, tools and limits. Every enforcer asks this module the same question: does this grant allow this action?

## Owns

- The grant and profile schemas, and their TOML form.
- The decision: whether a grant allows a file path, a host, a secret or a tool.
- Narrowing a grant, and widening it by an approved request.

## Does not own

- Enforcement: that belongs to [`sandbox`](sandbox.md), [`broker`](broker.md) and [`gateway`](gateway.md).
- Rules about arguments or behaviour: those belong to [`steering`](steering.md).
- Asking a human: that belongs to [`approvals`](approvals.md).

## Depends on

Nothing. It is pure Rust with no I/O and also builds for wasm.

## Decisions

Decided 2026-11-02:

- **A grant belongs to a session.** It is created from a reusable profile, so two sessions of one agent can have different access. A local MCP server that Workhorse launches gets its own grant the same way.
- **Everything is denied unless listed.** Secrets appear by name only. Symlinks are never followed out of a granted path.
- **A human can narrow a grant at any time. It widens only when the agent asks and a human approves**, and the approval is recorded.
- **Network, tools and secrets change live**, because the broker and the gateway see every request. **File access and limits are fixed when the agent starts**, because nono and bubblewrap fix them then. Changing them restarts the agent under the new grant and resumes its session.
- **Tools are granted one by one, by name or pattern** (`github: issues.*`).
- **The grant is the ceiling.** Steering works inside it and can never widen it.
- **Profiles live only in the user's config**, `~/.config/workhorse/profiles/`, written in TOML and validated against a published JSON Schema. A repository is untrusted input: it can name a profile, never grant anything.
- **Grants are visible.** Each session prints a one-screen summary of its grant when it starts, `workhorse status` shows every session's grant and recent denials, and an approval shows the exact change it would make.

| Part of a grant | Example | Enforced by | Changes live |
|---|---|---|---|
| Files | `~/code/x`, read-write | `sandbox` | No: restart and resume |
| Network | `api.github.com` with secret `github-token` | `broker` | Yes |
| Tools | `github: issues.*` | `gateway` | Yes |
| Limits | 64 processes, 4 GB | `sandbox` | No: restart and resume |

## Open questions

- Whether every agent resumes reliably enough for restart and resume: [planned spike](../spike/resume-and-events/PLAN.md).

## Evidence

- The spike 1 sandbox findings and the spike 8 agentOS findings, in [`wrkhse/daemon-v0`](https://github.com/wrkhse/daemon-v0), show which file and network rules each OS sandbox can enforce.
