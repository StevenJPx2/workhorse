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
| `plan/rearchitecture/high-level-ideas.md`                     | Vision (Moby/Jiratown TUIs, bare-repo worktrees)                                                                          |
| `packages/core-v2/src/config/README.md` + `config/example.ts` | Worked example of the config model — spec plus a runnable in-code config (`bun packages/core-v2/scripts/config-smoke.ts`) |

Full annotated index → [MAP.md](MAP.md). Component-by-component outline → [ARCHITECTURE.md](ARCHITECTURE.md).

## 30-second mental model

Two planes — **config gates; it never provides:**

- **Config plane** (declarative TOML): workflow types, step presets, agent definitions. A step _references_ a backend by name and _gates_ tools/services with allowlists. Authored in **snake_case throughout** (the Zod schemas mirror the TOML; no case conversion).
- **Runtime plane** (in memory): the live `Agent` ("bones": `run`/`notify`/`interrupt`) the Harness drives. It receives the assembled capability set.

Capability assembly: `(agent definition ∪ service contributions) ∩ step allowlist`, most-restrictive wins.

Runtime hierarchy:

```
Orchestrator  ─ owns GlobalContext (infra: db/hooks/config + registries: services, adapters, agent defs, workflow types)
  └─ WorkflowContext (per run; instances from registries — no shared mutable state)
       └─ Workflow  ─ a line of stages
            └─ Stage ([[states]]) ─ one status + an ordered `steps` list + `exits`
                 └─ Step ─ config: prologue/epilogue, tools/services allowlists, agent/model, tokenBudget, sub-agents
                      └─ Harness (one generic engine) ─ drives a runtime Agent, streams AgentEvents, enforces timeout/truncation/boundary-interrupts
```

**Control flow = stages + `when` rules.** A **stage** is one status with an ordered `steps` list that runs in declaration order and loops back to the first. Routing is the stage's `exits = [{ when = "<expr>", to = "<status>", epilogue? }]` — first match wins; **only stages route, steps never do**. `when` is a safe boolean expression (built-in names, state keys, comparisons, `and`/`or`/`not`). The **handoff is edge-scoped**: a step's `epilogue` is the loop/positional handoff; an exit's optional `epilogue` is the transition handoff (falls back to the step's). `done` is terminal/external; `blocked` and a signed-off `in_review` are **park states**.

**Services are decoupled from the Harness** — usable standalone, even in another process (this powers Moby: compose e.g. `AgentService` + `ToolService` to drive one agent with chosen tools, without the whole product). The capability registries `ToolService` / `SkillService` / `ScriptService`, plus `GitService` / `L1Service` / `L2Service` / `AgentService` / `ASTService`, declare contributions; the Harness intersects them against the step allowlist. Plugins are decoupled too — they contribute through those services and can inject pre-transition steps.

## Conventions (enforced by oxlint + vitest — see `AGENTS.md`)

- Files **≤ 200 lines**; **prefer one-word filenames** whenever possible (`context.ts`, not `global-context.ts`), falling back to **kebab-case** only when multiple words are unavoidable; tests **colocated** (`foo.ts` + `foo.test.ts`); coverage 97% lines/fns, 95% branches.
- One concept per file. Zod: `import z from "zod"`; schema const = PascalCase noun, inferred type = `<Name>T` (e.g. `StateConfig` / `StateConfigT`); config-plane schemas use a `…Config` suffix to avoid clashing with runtime classes.
- Config + its Zod schemas are **snake_case throughout** (`token_budget`, `write_globs`, `sub_agents`) — no case conversion.
- Run `bun run check` before commits (lint → typecheck → test → fallow). Single package: `bun run --filter core-v2 test`.
