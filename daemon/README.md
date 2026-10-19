# Workhorse MCP

Workhorse MCP is a framework for MCP servers backed by one durable local daemon.

Every MCP created with the framework attaches to the existing daemon. The daemon owns access to the outside world—filesystem, network, secrets, durable state, and background work—and grants each MCP only its declared capabilities.

## Principles

- **One daemon:** clients connect to a user-scoped singleton instead of creating private runtimes.
- **Capabilities are plugins:** the daemon contains no built-in list of filesystem, network, browser, or provider implementations.
- **Deny by default:** an attached MCP can invoke only capabilities granted by its lease.
- **Durable lifecycle:** MCP processes may disconnect without losing daemon-owned state or work.
- **Protocol first:** Rust, TypeScript, and future SDKs share one versioned wire contract.

See [`docs/architecture.md`](docs/architecture.md).

## Workspace

Crates are added only when a vertical slice needs them.

- [`workhorse-mcp-broker`](crates/broker) — the capability broker: a client can invoke only the capabilities it was granted, and each grant enforces its own scope. The first slice proves this in-process with one capability, `fs.read`, scoped to a root directory.
- [`workhorse-mcp-protocol`](crates/protocol) — the wire contract between a client and the daemon. Empty until the slice that splits the broker across a socket defines the messages it actually needs.
