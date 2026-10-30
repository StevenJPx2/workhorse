# Workhorse

Workhorse is an open protocol for durable, sandboxed agent infrastructure.

Projects live under the [`wrkhse`](https://github.com/wrkhse) GitHub organization.

Status: being redefined. Start with [`OVERVIEW.md`](OVERVIEW.md): three layers of protocols (trust, runtime, harness), trust first. [`ARCHITECTURE.md`](ARCHITECTURE.md) and [`PHILOSOPHY.md`](PHILOSOPHY.md) hold the original vision and design principles.

## Branches

- `tack`: `@workhorse/tack`, write a coding-agent plugin once and run it in every agent. Independent of the rest.
- `daemon-v0`: the capability daemon, every spike (sandbox, link, transport, workerd, kernel, agentOS, unagent) and the uniform-stack proposal, as of 2026-10-30.
- [`legacy`](https://github.com/StevenJPx2/workhorse/tree/legacy): the command-line and terminal UI tool.
- [`fleet-v0`](https://github.com/StevenJPx2/workhorse/tree/fleet-v0): the autonomous coding fleet on Cloudflare.
