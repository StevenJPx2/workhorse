# `conformance`

**Kind:** test suites, layer 1. **Status:** proposed, not built.

One suite per protocol. An implementation in any language that passes a suite implements that protocol. Every suite includes a deliberate break that must make it fail.

## Owns

| Suite | Checks |
|---|---|
| `grant` | Decision vectors: actions and the verdict each grant must give |
| `steering` | Events, rules and the verdicts they must give |
| `approvals` | Queue transitions, and that a repeated request or answer applies once |
| `control` | Method requests and responses, including errors |
| `sandbox` | Escape probes: host files, symlinks, sockets, environment, processes, limits |
| `broker` | Egress probes: only the broker is reachable, secrets never reach the agent, redirects are not followed |
| `gateway` | Unlisted tools are hidden and refused |

## Does not own

Product code. Suites depend on the contracts and test implementations from outside.

## Depends on

The contract modules.

## Evidence

- Spike 8 on `daemon-v0`: 26 escape probes and 12 egress routes, each with a deliberate break that made them fail.
