# Workhorse MCP

Workhorse MCP is one daemon per user that does all privileged work for agents and their apps.

An agent host sees ordinary MCP servers. The servers have no access of their own. They call the daemon, and the daemon acts only within the user's policy. The daemon owns access to the outside world: files, network, secrets, durable state, and background work.

## Principles

- **One daemon, one build:** the daemon is one Workers app. It runs on workerd on the laptop and the home server, and on Cloudflare in the cloud.
- **Small base:** the daemon owns a fixed set of base capabilities. Apps provide all other operations.
- **Deny by default at the edge:** access to the outside world (files, network, secrets, processes, other machines) needs a policy grant. Internal features such as state, tasks, and mailboxes need none; quotas bound them.
- **Secrets stay in the daemon:** the daemon adds credentials to outgoing requests. Apps never receive them.
- **Sandboxed from the start:** the native bridge and workerd run inside an OS sandbox.
- **Durable lifecycle:** clients may disconnect without losing daemon-owned state, tasks, or events.
- **Protocol first:** a conformance suite that speaks only the protocol defines a daemon. Rust, TypeScript, and later SDKs share the same contract.

See [`docs/architecture.md`](docs/architecture.md).

## Workspace

Crates are added only when a vertical slice needs them.

- [`workhorse-mcp-broker`](crates/broker) — the capability broker: a client can invoke only the capabilities it was granted, and each grant enforces its own scope. The first slice proves this in-process with one capability, `fs.read`, scoped to a root directory.
- [`workhorse-mcp-protocol`](crates/protocol) — the wire contract between a client and the daemon. Empty until the slice that splits the broker across a socket defines the messages it actually needs.
