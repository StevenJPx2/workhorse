# Architecture

## Process model

```text
Agent host
    │ MCP
    ▼
Framework MCP process
    │ Workhorse protocol over a local socket
    ▼
One user-scoped Workhorse daemon
    ├── capability provider
    ├── capability provider
    └── capability provider
```

The MCP process owns the MCP transport and tool definitions. It has no direct access to privileged host resources. Tool handlers invoke daemon capabilities through a scoped lease.

The daemon is the trust boundary, not the sandboxed guest. It authenticates attachments, grants the minimum requested permissions, validates every invocation, and records auditable lifecycle events.

## Planes

1. **MCP plane:** the agent host communicates with a framework-created MCP server.
2. **Broker plane:** the MCP server attaches to the daemon, requests capabilities, and invokes operations.
3. **Provider plane:** dynamically discovered providers perform privileged work after validating the lease.

## Plugins

A provider ships a manifest and an executable component. Its manifest declares capability and operation names; therefore the daemon never contains a hard-coded provider registry.

```json
{
  "id": "example.filesystem",
  "version": "1.0.0",
  "component": "filesystem.wasm",
  "capabilities": [
    {
      "name": "filesystem",
      "operations": ["read", "write", "list"]
    }
  ]
}
```

Providers are discovered from configured directories. Installation changes available capabilities without recompiling the daemon. A future signed package format may wrap the manifest and component, but it is not part of the initial protocol.

## Attachment lifecycle

1. Connect to the user-scoped local socket.
2. If unavailable, race safely to start the singleton daemon.
3. Negotiate protocol versions.
4. Send the MCP identity and requested capabilities.
5. Receive a scoped, expiring lease.
6. Invoke provider operations using that lease.
7. Reattach after a client restart without terminating daemon-owned work.

## Repository boundaries

- `protocol` contains serializable contracts only.
- `daemon` will own discovery, leases, routing, persistence, and supervision.
- `mcp` will bridge MCP transports to the daemon client.
- capability providers will remain independently installable components.
- language bindings will wrap the same protocol rather than duplicate daemon behavior.

No runtime package may import a concrete capability provider.
