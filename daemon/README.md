# Workhorse MCP

Workhorse MCP is one daemon per user that does all privileged work for agents and their apps.

An agent host sees ordinary MCP servers. The servers have no access of their own. They call the daemon, and the daemon acts only within the user's policy. The daemon owns access to the outside world: files, network, secrets, durable state, and background work.

## Principles

- **One daemon, one build:** the daemon is one Workers app. It runs on workerd on the laptop and the home server, and on Cloudflare in the cloud.
- **Small base:** the daemon owns a fixed set of base capabilities. Apps provide all other operations.
- **Deny by default at the edge:** access to the outside world (files, network, secrets, other machines) needs a policy grant. Internal features such as state, tasks, and mailboxes need none; quotas bound them.
- **Secrets stay in the daemon:** the daemon adds credentials to outgoing requests. Apps never receive them.
- **Sandboxed from the start:** the OS service manager runs workerd inside the OS sandbox, and each app runs as a Dynamic Worker with no network of its own.
- **Durable lifecycle:** clients may disconnect without losing daemon-owned state, tasks, or events.
- **Protocol first:** a conformance suite that speaks only the protocol defines a daemon. TypeScript is the source of the contract; other languages use its JSON Schema.

See [`docs/architecture.md`](docs/architecture.md).

## Workspace

The daemon is a Bun workspace of TypeScript packages, described in [`docs/architecture.md`](docs/architecture.md#repository-layout). Packages are added only when a slice needs them.

```sh
bun install --frozen-lockfile
bun run check   # vp check, tsc, vp test, Effect diagnostics, Fallow, bun audit
bun run fix     # format and apply lint autofixes
```

`tools/oxlint/anti-slop/` holds the vendored anti-slop rules; [`UPSTREAM.md`](tools/oxlint/anti-slop/UPSTREAM.md) records their source and local changes.
