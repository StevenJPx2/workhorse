# pi in workerd — C1 spike artifacts

Proves the pi SDK (`@earendil-works/pi-coding-agent`) runs as an in-process
harness inside workerd, driving `opencode-go/deepseek-v4-flash` with real
tool calls. Live result (wrangler dev, workerd 2026-03-27 compat):

```
GET /        → {"ok":true}                        # session constructs
GET /model   → {"ok":true,"settled":true,"toolCall":"ping",...}  # full agent loop + tool call
```

## The recipe (build.mjs)

pi-coding-agent's full entry pulls the TUI/modes and npm utilities that are
unbundleable or hostile in workerd. The bundle:

- **Imports the SDK core by dist path** (`dist/core/sdk.js`, `session-manager.js`,
  `settings-manager.js`, `model-runtime.js`) — bypasses the exports map and
  EXCLUDES the TUI modes from the graph.
- **`define: import.meta.url`** — `dist/config.js` calls
  `fileURLToPath(import.meta.url)` at module top level; workerd leaves
  `import.meta.url` undefined in the bundle.
- **node builtins external** (workerd `nodejs_compat` provides path/fs/os/
  events/crypto); **`node:child_process` and bare `child_process` → stub**
  (nothing in our path spawns processes).
- **`@earendil-works/pi-tui` → stub-tui.js** — the SDK graph imports TUI
  components (edit-tool rendering etc.) that a headless harness never
  renders. Components are CLASSES, not objects — real modules `extends`
  them (e.g. `BashResultRenderComponent extends Container`).
- **`jiti` → stub** — the TS extension loader; workerd cannot run it, and we
  only use inline `extensionFactories`. Any file-based extension loading
  must live on the host or in the container.
- **`proper-lockfile`, `hosted-git-info`, `undici` → stubs** — CJS packages
  whose dynamic `require("node:…")` workerd rejects. Safe: `undici`'s
  installer (`configureHttpDispatcher`) is never called on the SDK path, so
  native fetch stays.
- `mainFields: ["module","main","browser"]` — platform "neutral" ignores
  `main` otherwise (graceful-fs etc.).

Bundle: ~12 MB ESM (pi-ai catalog data dominates; tree-shaking comes later
if it matters). Deploy with `main: dist/entry.mjs` + `no_bundle: true`.

DEV-ONLY: the spike routes are gated on a `SPIKE_KEY` secret (Bearer auth)
so a stray deploy cannot burn model quota for anonymous callers.

## Resolved: typebox/compile codegen (C2)

Workerd blocks `eval`/`new Function`, and pi-ai's tool-argument validation uses
`Compile` from `typebox/compile` (typebox's codegen validator) — every tool call
returned "Code generation from strings disallowed for this context".
`typebox-compile-shim.js` aliases that module to a runtime `Value.Check`-
based validator (same Check/Errors surface, no codegen). Verified live:
`GET /model` returns `toolResult: "pong"`.

## Bundle recipe extras (worker/pi-build.mjs)

- `conditions` include `"node"` (exports-map packages like pkce-challenge
  expose only node/browser conditions)
- `preserveSymlinks: true` (bun's `.bun` store symlinks otherwise break
  upward resolution)
- `@cloudflare/containers` is BUNDLED (workerd has no such runtime module)
- `cloudflare:*` builtins external
- `yaml` stubbed (CJS dynamic requires of node builtins at init; only used
  for prompt-template frontmatter, which the fleet never expands)

## Verified facts

- `ModelRuntime.create({ credentials: InMemoryCredentialStore })` +
  `setRuntimeApiKey("opencode-go", …)` + `getModel("opencode-go","deepseek-v4-flash")`
  resolves from the bundled pi-ai catalog.
- `noTools: "all"` disables custom tools too — use `noTools: "builtin"` +
  `tools: ["<name>"]`.
- `agent_settled` fires after the full loop (retries/follow-ups drained).
- **opencode-go accepts pi's tool calls** — no `tool_choice: "required"`
  rejection on this path (the earlier eval-harness concern does not apply
  to pi's loop).
