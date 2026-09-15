# @workhorse/api

The contract. Every plugin and package depends on this one, and this one depends
on nothing.

It exports the two authoring primitives and the types that describe a plugin, a
tool context, and the Worker `Env`. It holds no implementation. A plugin that
needs a capability declares it through these types, and the worker supplies it.

## Exports

| Export | What it does |
|---|---|
| `tool()` | Defines one tool. It takes a valibot input schema, required `docs`, and a `run` function. |
| `agent()` | Defines one stage agent: a persona, a tool list, a valibot output schema, and an optional model policy. |
| `repoSlug()` | Normalizes any spelling of a repo to `owner/name`. |
| `ToolContext` | What a tool receives: `env`, `core`, `sandbox`, `ticket`, and the write policy. |
| `Core` | The facade a plugin calls back through. It covers tickets, events, scripts, and chat. |
| `WorkhorsePlugin` | The plugin shape: tools, routes, hooks, webhooks, attachment providers. |
| `Env` | The Worker bindings. It is the single source of truth for what the fleet needs. |

## Notes

`docs` is type-required on `tool()`. The compiler rejects an undocumented tool.
The definition also injects a `help` flag into every input schema, so an agent can
read the full reference for a tool without running it.

`repoSlug` lives here because repo identity is the one noun every plane shares.
It used to live in `plugins/knowledge`, which forced `@workhorse/sandbox` to
depend on a plugin to build a cache key.

## Tests

`bunx vitest run packages/api`
