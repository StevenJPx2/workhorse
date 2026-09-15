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

The first crate is [`wrkhse-mcp-protocol`](crates/protocol), which defines provider manifests and the generic daemon wire messages. Runtime crates will be added only as their first vertical slice is implemented.
