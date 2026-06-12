# Services

The **runtime service layer**. A service reaches the outside world safely and
feeds an agent what it needs to run a step. Services are **not** bound to the
Harness — they take the orchestrator-owned
[`GlobalContext`](../orchestrator/global-context.ts) (its `hookable` bus, and
later config/db), so the same set can be composed standalone (e.g. an
`AgentService` + `ToolService` driving one agent without the rest of the product).

## The model

- **Lifecycle.** Every service extends [`Service`](./base.ts): a stable `name`
  plus `setup(context)` / `teardown()`. In `setup` it registers handlers on
  `context.hooks` (keeping the returned unregister callbacks); `teardown`
  releases them.
- **Hook bus, not a registry.** Services communicate over the typed
  [`Hooks`](../hooks/hooks.ts) bus. A contributor calls a `*:register` hook; the
  owning service handles it. **Reads are plain methods** (`list()`), not hooks —
  hooks are for fan-in writes.
- **Each service owns its mechanism** — how its kind is stored and retrieved is
  its whole job. On `setup` each one **scans its sources once** into memory and
  contributes its own tools (`load_skill`, `run_script` / `write_script`) via
  `tools:register`:
  - `tool/` — `ToolService` keeps tool definitions **in memory**.
  - `script/` — `ScriptService` scans `.workhorse/scripts` for `*.sh` once at
    setup and caches them; `list()` returns the cache. Scripts are
    **agent-authored** (no plugin hook): the `write_script` tool saves a
    `<name>.sh` and re-scans so the new script is immediately runnable. A script
    declares a **CLI contract** (`args`: positional arguments + named options);
    `run_script({ help: true })` renders its usage, and `run_script` validates
    the call against it, passing positionals as `$1..`
    and options as `$UPPER_NAME` env vars. The contract is persisted in a
    `#workhorse:args` front-matter comment so it survives re-discovery.
  - `skill/` — `SkillService` scans the agent skill roots (`~/.claude/skills`,
    `~/.agents/skills`, then the project equivalents — project wins) following
    the Anthropic `SKILL.md` convention.
- **One definition, no copy-class.** A capability **is** its
  [`../schema`](../schema) object: the Zod schema validates the data _and_ holds
  the handler (`execute` / `run` / `render`, a `z.custom` function field — not
  serialisable, and it needn't be). There is no separate runtime class to keep
  in sync. Author one with the `define*` wrappers (`defineTool` / `defineScript`
  / `defineSkill`), which validate and (for tools) type `execute`'s `args` from
  the `input` schema (xmcp-style). Services store and move these objects.

## Worked example

```ts
import { createHooks } from "hookable";
import type { Hooks } from "../hooks";
import { ScriptService } from "./script";

const hooks = createHooks<Hooks>();
const scripts = new ScriptService("/path/to/cwd");
await scripts.setup({ config, hooks }); // scans .workhorse/scripts once, contributes tools

// The agent authors scripts via the contributed `write_script` tool, which
// writes `<name>.sh` and refreshes the cache. `list()` then returns it.
scripts.list(); // cached ScriptT[] — no disk scan
```

A contributing service does the write side from its own `setup`:

```ts
class GitService extends Service {
  readonly name = "git";
  override setup(context: GlobalContext) {
    context.hooks.hook("tools:register", ({ tool }) => {
      /* contribute git tools */
    });
  }
}
```

## Status

Sketch. The hook taxonomy, gating tags on contributions, and the `Skill`/`Script`
storage details are still settling — confirm against
[`rearchitecture.md`](../../../../plan/rearchitecture/rearchitecture.md) before
building on them.
