# @workhorse/server

The HTTP surface: routing, auth tiers, chat, triggers, and agent blocks.

Every route arrives through `createServer`, and the worker supplies what the routes
need.

## Exports

| Export | What it does |
|---|---|
| `createServer(deps)` | Builds the fetch handler from injected dependencies. |
| `json` | The response helper every route returns through. |
| `toolContext` | Builds a `ToolContext` for a stage or a callback. |
| `runFleetChat` | The operator chat agent. |
| `listTriggers`, `fireTrigger`, `sweepCronTriggers`, `cronMatches`, `validateCron`, `renderTemplate` | The trigger registry and its cron sweep. |
| `getAgentBlock`, `putAgentBlock`, `listAgentBlocks`, `deleteAgentBlock`, `seedAgentBlocks`, `installAgentBlocks` | The agent block registry. |
| `scriptIndex`, `workflowIndex`, `toolIndex` | The fleet's semantic corpora. |

## Notes

This package imports no plugin. Every handler used to call `coreFor(env, origin)`
itself, which meant a route test had to load fourteen plugins. The dependencies now
arrive on `RouteCtx`, and the boundary is checked.

Route auth is declared per route, not per handler. A `scoped` route accepts the
sandbox callback token. A `master` route accepts only the fleet token.

Agent blocks seeded from the image are `source: "seed"`. An operator edit makes a
block `source: "user"`, and re-seeding then skips it on purpose. That is correct for
a deliberate edit. It also means a rename in the image never reaches an edited block.
That once left five personas telling agents to call tools that no longer existed.

## Tests

`bunx vitest run packages/server`
