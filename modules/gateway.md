# `gateway`

**Kind:** enforcer, layer 1. **Status:** proposed, not built.

The one door to MCP servers. It shows an agent only the tools its grant lists and forwards their calls.

## Owns

- Proxying MCP between an agent and its servers.
- Filtering the tool list and refusing calls to tools the grant does not list.

## Does not own

- Which tools are allowed: that belongs to [`grant`](grant.md).
- Rules about a call's arguments: those belong to [`steering`](steering.md).
- The servers' own network traffic: that goes through [`broker`](broker.md).

## Depends on

[`grant`](grant.md). Native. Speaks MCP, an existing standard, so it invents no protocol.

## Decisions

- **Tools are granted one by one, by name or pattern** (2026-11-02).
- **Runs inside the daemon** with the broker, as a separate crate (2026-11-02).
- **Each local MCP server runs in its own sandbox under its own grant** (2026-11-02), launched by Workhorse through [`sandbox`](sandbox.md). A server is as contained as an agent, and its network traffic goes through the broker.

## Open questions

- Whether to offer tools on demand (a search tool plus deferred loading) as well as listing them.
- A call in flight when the gateway restarts: report an unknown outcome, never resend.

## Evidence

- [nanocode](../evidence/nanocode.md): MCP tools found through `tool_search` and callable from Code Mode.
