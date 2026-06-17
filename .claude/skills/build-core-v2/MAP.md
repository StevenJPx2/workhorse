# core-v2 Living-Document & Code Map

A curated index into the design docs and code. Paths are repo-root-relative.

## Design docs (the "living documents")

| Path                                      | What's there                                                                                                                                                                  |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `plan/rearchitecture/rearchitecture.md`   | **Canonical** spec: structs (State/ExitRule/Step/…), two planes, stages + `when` exits, Harness, Agent event stream, services, plugins, config cascade, directory layout, error handling. Start here. |
| `plan/rearchitecture/learnings.md`        | Decision log: interview decisions, resolved loopholes, open questions.                                                                                                       |
| `plan/rearchitecture/high-level-ideas.md` | Vision: Workhorse-as-SDK; Jiratown TUI; bare-repo worktrees. The standalone-composition use case drives the decoupled-service model.                                                    |
| `plan/rearchitecture/steps/step-1.md`     | Target `packages/core-v2/src/` scaffolding (orchestrator/workflow/step/harness/services/schema).                                                                             |
| `packages/core-v2/src/config/README.md`   | Config-plane spec (stages/`when` model) + a runnable worked example.                                                                                                         |
| `packages/core-v2/src/services/README.md` | The service model: `hookable` bus, `*:register` hooks, `define*` wrappers, capability-is-its-schema.                                                                          |
| `architecture.d2` / `architecture.png`    | Architecture diagram source + render.                                                                                                                                        |

## Conventions & build commands

| Path        | What's there                                                                                                                                     |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `AGENTS.md` | Commands, import rules (path aliases, index-only imports), code constraints (≤200 lines, kebab-case, colocated tests, 97/95 coverage), pre-commit. |
| `CLAUDE.md` | Points to `AGENTS.md`.                                                                                                                          |

- Package manager is **aube** (installed via Homebrew); the runtime is **Node**.
- Full check before commits: `aube run check` (lint → typecheck → test → fallow).
- Single package: `aube -F core-v2 run test` (root) or `aube run test` (in-package).
- Scaffold code: `aube run generate <service|tool|skill> …` (plop; see
  `generators/` + `plopfile.ts` + `scripts/generate.ts`).
- Smoke a plane end-to-end (each builds a temp sandbox and prints results):
  the `scripts/smoke/*.ts` files target the **Bun** runtime (shebang + `Bun.serve`),
  so run them with `bun packages/core-v2/scripts/smoke/<config|script|skill|services|web>.ts`
  or `aube run smoke:<name>`. `scripts/smoke/harness.ts` is the shared smoke
  scaffolding (sandbox + hook bus).

## core-v2 code (`packages/core-v2/src/`)

| Path                                           | What's there                                                                                                                                                                              |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `schema/status/`                               | `Status` enum (`schema.ts` + `index.ts`), incl. `blocked`. Shared by config + services.                                                                                                   |
| `schema/tool/`                                 | `defineTool` (xmcp-style: types `execute`'s args from the `input` schema), `ToolT`/`AnyTool`, `result.ts`; `schema.ts` + `define.test.ts`.                                                 |
| `schema/skill/`                                | `defineSkill`, `SkillT`, `schema.ts` + `define.test.ts`. Anthropic `SKILL.md` convention.                                                                                                 |
| `schema/script/`                               | `defineScript`, `ScriptT`, `front-matter.ts` (`serializeFrontMatter`; comment-fenced `# ---` YAML CLI contract), `help.ts`, `invoke.ts`, `schema.ts` + `__tests__/`.                        |
| `schema/index.ts`                              | Re-exports `script`/`skill`/`status`/`tool`. A capability **is** its schema object — the Zod schema validates the data and carries the handler (`z.custom` fn).                             |
| `config/state.ts`                              | `ExitRule {when,to,epilogue?}` (epilogue = optional transition handoff), `StateConfig {name,steps,exits}` — the stages/`when` shape.                                                       |
| `config/workflow.ts`                           | `WorkflowConfig {name, states, steps, version}`.                                                                                                                                          |
| `config/step.ts`                               | `SubAgentConfig` (`write_globs`, snake_case), `StepConfig` = `PresetConfig` + `preset` + `sub_agents`.                                                                                     |
| `config/preset.ts` · `main.ts` · `settings.ts` | Preset body, global/project `MainConfig`, shared settings.                                                                                                                                |
| `config/resolved.ts`                           | `ResolvedConfig` — the whole `.workhorse` tree mirrored into one object.                                                                                                                   |
| `config/loader.ts`                             | Globs `**/*.toml`, mirrors dirs → object, `defu`-merges project over global, parses.                                                                                                       |
| `config/example.ts`                            | In-code worked example: a full `ralph` config. Validate + print: `bun packages/core-v2/scripts/smoke/config.ts` (or `bun run smoke:config`).                                              |
| `lib/matter.ts`                                | `safeMatter` — a `gray-matter` wrapper returning `{ success, … }` for skill/script front-matter.                                                                                           |
| `hooks/hooks.ts`                               | Typed `hookable` bus `Hooks`: `skills:register` (`{ skill }`), `tools:register` (**batched** `{ tools: AnyTool[] }` — one call per service, not per tool). Fan-in writes go through hooks; reads are plain service methods. |
| `orchestrator/context.ts`                      | `GlobalContext { config, hooks }` interface.                                                                                                                                              |
| `workflow/context.ts`                          | `WorkflowContext extends GlobalContext { cwd }`.                                                                                                                                          |
| `services/base.ts`                             | `Service` contract: `name` + `setup(context)` / `teardown()`.                                                                                                                             |
| `services/skill/`                              | `SkillService` (`name: "skills"`): `discover.ts` scans `~/.claude/skills`, `~/.agents/skills`, then the project (project wins); `parse/`; `tools/load` → `load_skill` (contributed via batched `tools:register`); accepts `skills:register`. |
| `services/script/`                             | `ScriptService` (`name: "scripts"`): `discover.ts` scans `.workhorse/scripts/*.sh`; `tools/run` → `run_script` (validates the front-matter CLI contract, `help`), `tools/write` → `write_script` (re-scans); both contributed in one batched `tools:register`. |
| `services/index.ts`                            | Re-exports `base`/`script`/`skill`.                                                                                                                                                       |
| `generators/` (pkg root, not `src/`)           | plop generators — `helpers.ts` + one folder per generator (`service/`, `tool/`, `skill/`), each with `generator.ts` + `templates/*.hbs`. Wired by `plopfile.ts`; run via `scripts/generate.ts` (Node + `tsx`). Scaffold with `aube run generate <service\|tool\|skill>`. New services emit a single batched `tools:register`. |
| `diagnostics/catalog.ts`                       | `nostics` `defineDiagnostics` — central `WH_*` error/advisory catalog with `why`/`fix`, console reporter. Producers call a code at detection.                                              |
| `src/index.ts`                                 | Public package entry: re-exports `#config` and `#schema`.                                                                                                                                 |

Package deps (`packages/core-v2/package.json`): `zod`, `smol-toml`, `defu`,
`hookable`, `gray-matter` (front-matter), `just-bash` (script execution),
`nostics` (diagnostics); dev `yoctocolors`, `@types/bun`, `plop` +
`node-plop` (generators), `tsx` (Node TS runner), `typescript`; peer
`typescript`. Scripts: `lint`/`lint:fix` (oxlint), `typecheck` (tsc), `fallow`,
`smoke:config|script|skill|services|web`,
`generate`/`generate:service|tool|skill` (plop via `tsx scripts/generate.ts`).
