# Workhorse

Workhorse is an open protocol for durable, sandboxed agent infrastructure.

Projects live under the [`wrkhse`](https://github.com/wrkhse) GitHub organization.

Status: being redefined. Start with [`OVERVIEW.md`](OVERVIEW.md): three layers of protocols (trust, runtime, harness), trust first. [`ARCHITECTURE.md`](ARCHITECTURE.md) and [`PHILOSOPHY.md`](PHILOSOPHY.md) hold the original vision and design principles.

## Related repositories

- [`wrkhse/tack`](https://github.com/wrkhse/tack): `@workhorse/tack`, write a coding-agent plugin once and run it in every agent. Independent of the rest.

Archived, kept as evidence:

- [`wrkhse/daemon-v0`](https://github.com/wrkhse/daemon-v0): the capability daemon, every spike (sandbox, link, transport, workerd, kernel, agentOS, unagent) and the uniform-stack proposal, as of 2026-10-30.
- [`wrkhse/workhorse-legacy`](https://github.com/wrkhse/workhorse-legacy): the command-line and terminal UI tool, as of 2026-07-14.
- [`wrkhse/fleet-v0`](https://github.com/wrkhse/fleet-v0): the autonomous coding fleet on Cloudflare, as of 2026-09-15.

## Site

[`site/`](site/README.md) builds the hub: these docs and every related project's, pulled from their own repositories, with a deck at `/deck`. [`hub.config.ts`](hub.config.ts) names every repository.
