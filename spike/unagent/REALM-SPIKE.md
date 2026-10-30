# Do an agent's plugins share one JavaScript realm?

Spike, 2026-10-30. The tack plan has tack plugins inside one agent find each other through a host at `globalThis[Symbol.for("@workhorse/tack/host")]` ([README.md](README.md), "Finding each other"). That works only if the agent loads all its plugins into one realm. This spike checks it on the three in-process agents.

Method: two throwaway plugins per agent. Each one writes to the same `globalThis` symbol and records the slot's random ID, the process ID and the thread ID. Same ID means same realm. No model calls were made, and no real agent configuration was changed: Pi used a scratch `PI_CODING_AGENT_DIR`; OpenCode used scratch `XDG_*` directories; Claude Code loaded the mods for one session with `--plugin-dir`.

## Results

| Agent | Shared realm? | What was observed |
| --- | --- | --- |
| Pi 1.4.0 | **Yes** | Both extensions, loaded with `-e`, saw realm `zktkltyq` in one process on the main thread. Run: `pi --mode rpc --no-extensions --no-skills --no-session -e a.ts -e b.ts`, then `get_state` |
| OpenCode 2.2.2 | **Yes, across projects too** | `opencode serve` loaded `.opencode/plugins/probe-a` and `probe-b` for `proj1`, and `probe-a` again for `proj2`, all in realm `xz342u7l`, one process, main thread. The server also starts a file watcher on each plugin file |
| Claude Code 2.1.314 | **No** | Mod A saw realm `js3lbwfu`, mod B `61ecowv6`. Each mod gets its own realm |

### Claude Code mods: what does connect them

Four limits came out of the runs, each reported by Claude Code when it refused to load the module:

| Limit | Claude Code's message |
| --- | --- |
| A mod imports only its own files | `cannot import "../../../probe.mjs" … it is outside the plugin's folder` |
| No Node built-ins | `cannot import "node:fs" … a hooks module imports its own files by relative path and "claude-code", nothing else` |
| `$` is checked statically | `$.tackprobe is used as a value …; $ is always spelled $.noun.event(...) at the call site`. A mod cannot test whether a namespace exists with `in` or `typeof` |
| Only plain data crosses between mods | Passing a function to another mod's namespace: `interface.call: arguments are not plain data: The object cannot be cloned` |

What does work: mod A's `engine.create` hook returned `{ tackprobe: { owner }, ...beneath }`, following the official `telemetry` mod (`anthropics/claude-code`, `mods/telemetry/hooks/register.ts:53-67`). Mod B then called `$.tackprobe.owner()` and got `"a"`. So mods can share a namespace of methods, but only with plain-data arguments and results.

## What this changes in the tack design

| Agent | Before | Now |
| --- | --- | --- |
| Pi | A `globalThis` host | Unchanged |
| OpenCode | A `globalThis` host per process | A host per process, **keyed by `ctx.location`**, because one server holds several projects' plugin instances. The host must drop a plugin's handlers in that plugin's `setup` cleanup, since OpenCode watches plugin files and can reload them |
| Claude Code mod | A `globalThis` host | **No host.** Handlers cannot move between mods. Tack mods coordinate through Claude Code's own middleware chain instead: each tack mod's `tool.call` hook applies its rewrite to the input it receives, passes it on with `next`, then combines its own verdict with the result `next` returns (`deny > ask > allow`). That gives rewrites in sequence and deny-wins. The order is Claude Code's chain order (by source, then manifest `dependencies`), not tack's `priority`, and the build report says so |
| Codex, Claude Code hooks | One runner per event | Unchanged |

Also for Claude Code: each tack mod must bundle the tack runtime inside its own folder, written without Node built-ins, using only the mods API (`$.fs`, `$.process`, …).

Not tested: Pi's `/reload` and OpenCode's file-watch reload with a host present; whether Claude Code mods installed from a marketplace (rather than `--plugin-dir`) load the same way **(inferred: same loader)**.

## Reproduce

Scratch files are in `$TMPDIR/opencode/tack-realm/` on the development machine:

- `probe.mjs`: the shared probe for Pi and OpenCode.
- `pi/a.ts`, `pi/b.ts`: Pi extensions.
- `proj1/.opencode/plugins/probe-{a,b}/index.ts`, `proj2/.opencode/plugins/probe-a/`: OpenCode plugins. Load them with `GET /api/plugin?location[directory]=<project>` against `opencode serve`, using the printed server password as the Basic-auth password for user `opencode`.
- `claude/mod-{a,b}/`: Claude Code mods. Run `claude --plugin-dir mod-a --plugin-dir mod-b` interactively; `session.start` writes `claude-a.json` and `claude-b.json` through `$.fs.write` without a prompt being sent.
