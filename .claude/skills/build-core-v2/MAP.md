# core-v2 Living-Document & Code Map

A curated index. Paths are repo-root-relative. Tags: **CANON** = authoritative, **DECISIONS** = resolved decision log, **STUB** = scaffold/empty, **SETTLING** = freshly decided, details still landing.

## Design docs (the "living documents")

| Path | Tag | What's there |
| --- | --- | --- |
| `plan/rearchitecture/rearchitecture.md` | **CANON** | The full spec: structs (State/ExitRule/Step/…), two planes, stages + `when` exits, Harness, Agent event stream, services, plugins, config cascade, directory layout, error handling. Start here. |
| `plan/rearchitecture/learnings.md` | **DECISIONS** | Interview decisions, **Resolved Loopholes**, **Open Questions**. |
| `plan/rearchitecture/high-level-ideas.md` | Vision | Workhorse-as-SDK pitch; Moby & Jiratown TUIs; bare-repo worktrees. The Moby use case drives the decoupled-service model. |
| `plan/rearchitecture/steps/step-1.md` | Plan | Target `packages/core-v2/src/` scaffolding (orchestrator/workflow/step/harness/services/schema). |
| `packages/core-v2/src/config/README.md` | Spec | Config-plane spec (stages/`when` model) + "Implementation status" — best current read on what's built. |
| `architecture.d2` / `architecture.png` | Diagram | Architecture diagram source + render. |

## Conventions & build commands

| Path | What's there |
| --- | --- |
| `AGENTS.md` | Commands, import rules (path aliases, index-only imports), code constraints (≤200 lines, kebab-case, colocated tests, coverage), DB, pre-commit. |
| `CLAUDE.md` | Points to `AGENTS.md`. |

## core-v2 code (`packages/core-v2/src/`)

| Path | Tag | Notes |
| --- | --- | --- |
| `schema/status.ts` | Built · CANON | `Status` enum incl. `blocked`. |
| `schema/index.ts` | Built | Re-exports `status`. |
| `config/state.ts` | Built · CANON | `ExitRule {when,to,epilogue?}` (epilogue = optional transition handoff), `StateConfig {name,steps,exits}` — the stages/`when` shape. |
| `config/workflow.ts` | Built · CANON | `WorkflowConfig {name, states, steps, version}`. |
| `config/step.ts` | Built | `SubAgentConfig` (`write_globs`, snake_case), `StepConfig` = `PresetConfig` + `preset` + `sub_agents`. |
| `config/preset.ts`, `config/main.ts`, `config/settings.ts` | Built | Preset body, global/project `MainConfig`, shared settings. |
| `config/resolved.ts` | Built | `ResolvedConfig` — the whole `.workhorse` tree mirrored into one object. |
| `config/loader.ts` | Built | Globs `**/*.toml`, mirrors dirs → object, `defu`-merges project over global, parses. **No cascade resolver / no `when` parser yet.** |
| `config/example.ts` + `scripts/config-smoke.ts` | Built | In-code worked example: `exampleConfig` (full `ralph` config) + a smoke test that validates it and prints the JSON. Run directly (not via `--filter`, which truncates): `bun packages/core-v2/scripts/config-smoke.ts`. |
| `src/index.ts` | **STUB** | 31 bytes. |
| `src/orchestrator/index.ts` | **STUB** | empty — orchestrator unbuilt. |
| `src/workflow/index.ts` | **STUB** | empty — workflow/step/harness/agent unbuilt. |
| `src/services/index.ts` | **STUB · SETTLING** | empty — `ToolService`/`SkillService`/`ScriptService`/Git/L1/L2/Agent/AST unbuilt; the decoupled-service model is freshly decided. |
| `src/db/index.ts`, `src/hooks/index.ts` | **STUB** | empty scaffolds (deps include `hookable`). |

Package deps (`packages/core-v2/package.json`): `zod`, `smol-toml`, `defu`, `unctx`, `hookable`, `es-toolkit`. Scripts: `lint` (oxlint), `typecheck` (tsc), `fallow`.

## Open questions / not-yet-settled (confirm before building)

- **Service contribution API** — how `ToolService`/`SkillService`/`ScriptService` accept contributions (hooks?), where prompt sections register, and the per-base-service specifics left open in `rearchitecture.md`.
- From `learnings.md` (still open): TUI integration with the hierarchy · steering rules in the workflow model · multi-workflow coordination · L2 as a service · testing strategy · plugin onboarding order · compaction trigger.
