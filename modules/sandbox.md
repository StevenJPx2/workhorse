# `sandbox`

**Kind:** enforcer, layer 1. **Status:** proposed, not built.

Turns a grant into an operating-system policy and launches the agent under it. File access, limits and the single allowed network destination are enforced here.

## Owns

- Translating a grant into a backend policy.
- Backends: nono on macOS, bubblewrap on Linux.
- Launching the agent, and stopping its whole process tree.

## Does not own

- Deciding what is allowed: that belongs to [`grant`](grant.md).
- Network traffic beyond letting it reach the broker: that belongs to [`broker`](broker.md).

## Depends on

[`grant`](grant.md). Native only; this is the one module that touches Seatbelt, Landlock or bubblewrap.

## Decisions

- **File access and limits are fixed when the agent starts** (2026-11-02). A change restarts the agent under the new grant and resumes its session.
- **The only network destination is the broker** (2026-11-02). tack's `control` calls go through it too, on a reserved path.
- **Agents and local MCP servers both run under it**, each with its own grant (2026-11-02).
- **Stop the whole process tree** (spike 8): killing the `nono run` supervisor alone leaves the agent running.
- **agentOS is not adopted** (spike 8). Revisit when it leaves beta and its Node layer runs current agents.

## Open questions

- Whether every agent resumes reliably after a restart: [planned spike](../spike/resume-and-events/PLAN.md).
- On Linux, Unix sockets stay reachable for a self-sandboxed process (spike 1). Use bubblewrap's mount namespace or nono's supervisor mode.
- `nono run` adds about 0.65 s to each start on the homelab (spike 8).

## Evidence

- In [`wrkhse/daemon-v0`](https://github.com/wrkhse/daemon-v0): `spike/sandbox/FINDINGS.md` (spike 1) and `spike/agentos/FINDINGS.md` (spike 8: escape probes, broker-only egress, costs against nono).
