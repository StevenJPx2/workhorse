---
name: build-core-v2
description: Architectural outline and living-document map for building Workhorse's core-v2 rearchitecture — the Orchestrator → Workflow → Step → Harness → Agent pipeline, services, plugins, and the config plane. Use when working in packages/core-v2/, implementing or extending the V2 orchestrator/workflow/harness/services/config schemas, or when the user mentions core-v2, "core 2", or the rearchitecture.
---

# Build core-v2

Workhorse is an SDK for **controllable, automated coding agents**. **core-v2** is a from-scratch rearchitecture in `packages/core-v2/`. This skill is the orientation layer: the architectural outline plus a curated map into the living design docs and code.

## Canonical sources (read in this order)

| Doc                                                           | Role                                                                                                                      |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `plan/rearchitecture/rearchitecture.md`                       | **CANONICAL** spec — the model below comes from here                                                                      |
| `plan/rearchitecture/learnings.md`                            | Decision log, resolved loopholes, and open questions                                                                      |
| `plan/rearchitecture/high-level-ideas.md`                     | Vision (Jiratown TUI, bare-repo worktrees)                                                                          |
| `packages/core-v2/src/config/README.md` + `config/example.ts` | Worked example of the config model — a runnable in-code config; validate & print with `bun packages/core-v2/scripts/smoke/config.ts` (or `bun run smoke:config`) |
| `packages/core-v2/src/services/README.md`                     | The service model: `hookable` bus, `*:register` hooks, `define*` wrappers, capability-is-its-schema |

Full annotated index → [MAP.md](MAP.md). Component-by-component outline → [ARCHITECTURE.md](ARCHITECTURE.md).

## 30-second mental model

Two planes — **config gates; it never provides:**

- **Config plane** (declarative TOML): workflow types, step presets, agent definitions. A step _references_ a backend by name and _gates_ tools/services with allowlists. Authored in **snake_case throughout** (the Zod schemas mirror the TOML; no case conversion).
- **Runtime plane** (in memory): the live `Agent` ("bones": `run`/`notify`/`interrupt`) the Harness drives. It receives the assembled capability set.

Capability assembly: the Workflow sets up all services once and collects their tools/skills; the Harness then computes `(agent definition ∪ those contributions) ∩ step allowlist`, most-restrictive wins.

Runtime hierarchy:

```
Orchestrator  ─ owns GlobalContext (infra: db/hooks/config + registries: services, adapters, agent defs, workflow types)
  └─ WorkflowContext (per run; instances from registries — no shared mutable state)
       └─ Workflow  ─ a line of stages; sets up services once and collects their tools/skills
            └─ Stage ([[states]]) ─ one status + an ordered `steps` list + `exits`
                 └─ Step ─ config: prologue/epilogue, tools/services allowlists, agent/model, tokenBudget, sub-agents
                      └─ Harness (one generic engine) ─ filters the workflow's capabilities per step, drives a runtime Agent, streams AgentEvents, enforces timeout/truncation/boundary-interrupts
```

**Control flow = stages + `when` rules.** A **stage** is one status with an ordered `steps` list that runs in declaration order and loops back to the first. Routing is the stage's `exits = [{ when = "<expr>", to = "<status>", epilogue? }]` — first match wins; **only stages route, steps never do**. `when` is a safe boolean expression (built-in names, state keys, comparisons, `and`/`or`/`not`). The **handoff is edge-scoped**: a step's `epilogue` is the loop/positional handoff; an exit's optional `epilogue` is the transition handoff (falls back to the step's). `done` is terminal/external; `blocked` and a signed-off `in_review` are **park states**.

**Services are decoupled from the Harness** — usable standalone, even in another process (compose e.g. `AgentService` + `ScriptService` to drive one agent with chosen tools, without the whole product). They communicate over a typed **`hookable` bus**: contribute via `*:register` hooks, read via plain methods (`list()`); contributions carry tags so the step allowlist gates them and the Harness intersects. **Within a workflow the *Workflow* is the host: it sets up the services once, collects their tools/skills, and hands them to the Harness, which gates them per step.** `tools:register` is **batched** — a service contributes its whole tool set in one call (`callHook("tools:register", { tools })`), not one call per tool. A capability _is_ its `schema` object (Zod + embedded handler), authored with `defineTool` / `defineSkill` / `defineScript`. The capability services are `SkillService` / `ScriptService`, plus `GitService` / `L1Service` / `L2Service` / `AgentService` / `ASTService`. Plugins are decoupled too — they contribute over the same bus and can inject pre-transition steps.

## Scaffolding (plop generators)

New services/tools/skills are scaffolded with [plop](https://plopjs.com/), run on the **Node** runtime via `tsx` and invoked through **aube** (the package manager — installed via Homebrew; it replaces bun for installs and script-running). Generators keep the house conventions (kebab-case files, colocated tests, batched `tools:register`) so generated code lands lint/type clean.

- `aube run generate service --name <git>` — scaffolds `src/services/<name>/` (`service.ts`, `discover.ts`, `tools/index.ts`, colocated `service.test.ts`) and appends the barrel re-export to `services/index.ts`. Tools start empty.
- `aube run generate tool --service <git> --name <read-config>` — adds `tools/<name>.ts` (a `defineTool`) and wires it into the service's `tools/index.ts` factory.
- `aube run generate skill --name <code-review>` — scaffolds `.claude/skills/<name>/SKILL.md` + `resources/`.

Sources live in `packages/core-v2/generators/` (one folder per generator: `generator.ts` + `templates/*.hbs`), wired in `plopfile.ts`; the Node runner is `scripts/generate.ts`. Bare `aube run generate` is interactive.

## Conventions (enforced by oxlint + vitest — see `AGENTS.md`)

- Files **≤ 200 lines** (oxlint); **kebab-case** filenames (oxlint) — house style prefers **one word** where possible (`context.ts`, not `global-context.ts`); tests **colocated** (`foo.ts` + `foo.test.ts`); coverage 97% lines/fns, 95% branches (vitest).
- One concept per file. Zod: `import z from "zod"`; schema const = PascalCase noun, inferred type = `<Name>T` (e.g. `StateConfig` / `StateConfigT`); config-plane schemas use a `…Config` suffix to avoid clashing with runtime classes.
- Config + its Zod schemas are **snake_case throughout** (`token_budget`, `write_globs`, `sub_agents`) — no case conversion.
- Tooling runs under **aube** (package manager, installed via Homebrew) on the **Node** runtime. Run `aube run check` before commits (lint → typecheck → test → fallow). Single package from the repo root: `aube -F core-v2 run test`; from inside `packages/core-v2/`: `aube run test`.
