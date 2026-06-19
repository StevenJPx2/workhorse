## Context

`packages/core-v2/src/` currently has:
- A config plane: Zod schemas (`config/*.ts`), loader, and a worked `example.ts`.
- Service interfaces (`services/base.ts`, `SkillService`, `ScriptService`, `McpService`).
- A typed `hookable` bus (`hooks/hooks.ts`).
- Minimal context interfaces: `GlobalContext { config, hooks }` and `WorkflowContext extends GlobalContext { cwd }`.

What is missing is the runtime plane: the `Orchestrator` that bootstraps global context and registries, the `Workflow` that owns the stage machine, and the `step/`, `harness/`, `plugin/`, and `db/` scaffolds described in `plan/rearchitecture/steps/step-1.md`.

Canonical shapes are in `plan/rearchitecture/rearchitecture.md` §Orchestrator/§Workflow and the struct pseudo-code. This design translates those shapes into compiling, lint-clean TypeScript stubs that provide a stable skeleton for later implementation.

## Goals / Non-Goals

**Goals:**
- Implement `Orchestrator` and `Workflow` classes with the exact public surface from the rearchitecture spec.
- Expand `GlobalContext` and `WorkflowContext` to carry the fields required by those classes.
- Scaffold `workflow/step/`, `workflow/harness/`, `plugin/`, and `db/` with typed stubs.
- Add shared runtime types (`Issue`, `Agent`, `AgentEvent`, `Database`).
- Keep the change green under `aube run check` (lint/type/test/fallow) by adding minimal colocated tests.

**Non-Goals:**
- No execution logic in `Workflow.run`, `Harness.run`, or `Agent.run` — bodies are TODO stubs.
- No `when`-rule parser/evaluator.
- No issue intake, worktree creation, or DB schema — `Issue` is a minimal placeholder and `Database` is a type tag.
- No public entry-point export from `packages/core-v2/src/index.ts` for runtime classes; that is deferred until the surface stabilizes.

## Decisions

### 1. Keep config-plane and runtime-plane types separate
- **Decision:** Runtime classes (`Step`, `State`, `Workflow`) live in `workflow/` and do not inherit from Zod schemas. Config schemas (`StepConfig`, `StateConfig`, `WorkflowConfig`) remain the validated TOML shapes.
- **Rationale:** Prevents snake_case TOML from leaking into class property names and avoids mixing Zod inference with hand-written runtime behavior. The rearchitecture spec is explicit about this separation ("Config gates; it never provides").
- **Alternative considered:** Deriving runtime classes from Zod schemas — rejected because it forces snake_case on runtime APIs and makes overriding/behavior awkward.

### 2. Runtime `Step` mirrors `StepConfig` fields as camelCase properties
- **Decision:** `Step` stores `tokenBudget`, `toolTimeout`, `subAgents`, etc., constructed from the snake_case config.
- **Rationale:** Matches the struct pseudo-code (`tokenBudget`, `toolTimeout`, `subAgents`) while keeping config authoring in snake_case. No case-conversion layer is needed beyond the constructor.

### 3. `GlobalContext` registries hold definitions only
- **Decision:** Registries are arrays of `ServiceDefinition`, `AdapterClass`, `AgentDefinition`, and `WorkflowConfig` — not live instances.
- **Rationale:** Aligns with the canonical spec: "GlobalContext: definitions only, no instances." Per-run instances belong in `WorkflowContext` later, once services and agents are instantiated.

### 4. `WorkflowContext` gains `status`, `issue`, and `updateStatus`
- **Decision:** `WorkflowContext` extends `GlobalContext` with `cwd` (existing), `status: StatusT`, `issue: Issue`, and `updateStatus(status)`.
- **Rationale:** Mirrors the struct pseudo-code and gives `Workflow` a place to track the current stage. `updateStatus` is a method rather than a setter so later hooks can be emitted from one location.

### 5. `Issue` lives in `schema/issue/`
- **Decision:** Add `packages/core-v2/src/schema/issue/schema.ts` exporting a minimal `Issue` interface (id only for now).
- **Rationale:** `Issue` is referenced by both `Orchestrator.createWorkflow` and `WorkflowContext`, so it belongs in the shared schema layer rather than inside orchestrator or workflow.

### 6. `Database` is a structural type tag
- **Decision:** `db/index.ts` exports a `Database` interface with `_?: "database"`.
- **Rationale:** Lets `GlobalContext` reference a `Database` without coupling to SQLite/Drizzle. The actual schema will be added in a follow-up change.

### 7. `Agent` and `AgentEvent` live in `workflow/harness/`
- **Decision:** Define `Agent` interface and `AgentEvent` union in `workflow/harness/agent.ts`.
- **Rationale:** The `Agent` is the runtime "bones" that the `Harness` drives; placing it next to `Harness` keeps the event-stream contract close to its consumer.

### 8. Plugin contract matches service setup/teardown shape loosely
- **Decision:** `Plugin` has `name`, optional `version`, and `setup(context: GlobalContext)`.
- **Rationale:** Covers the canonical requirement that plugins contribute via hooks at setup time. A `teardown` method is omitted from the stub because plugin lifecycle is not yet exercised; it can be added when pre-transition steps are implemented.

### 9. Every new file gets a colocated test
- **Decision:** Each new `.ts` stub has a `.test.ts` that constructs the exported object and asserts its shape.
- **Rationale:** The repo enforces 97% line/function and 95% branch coverage. Stub files with no tests would fail the coverage gate.

## Risks / Trade-offs

- **[Risk]** Runtime classes may drift from config schemas as both evolve.
  - **Mitigation:** Keep runtime constructors typed against `…ConfigT` so changes to config schemas surface type errors in the runtime layer.
- **[Risk]** `Database` placeholder is too minimal and may require a breaking refactor when real persistence arrives.
  - **Mitigation:** The interface is intentionally a structural tag; adding methods later is backward-compatible for callers that only consume the type.
- **[Risk]** Deferring `src/index.ts` exports means consumers cannot yet import `#orchestrator`/`#workflow` from the package root.
  - **Mitigation:** Internal modules can still use path aliases (`#orchestrator`, `#workflow`). Public re-export is a one-line decision once the API stabilizes.
- **[Risk]** `Issue` placeholder (`{ id }`) is too small to be useful.
  - **Mitigation:** It is typed as an interface, so expanding fields later is non-breaking for type-checked callers.

## Migration Plan

Not applicable. This is a green-field scaffold within `packages/core-v2/`; no existing APIs change.

## Open Questions

1. Should `Workflow.run()` accept any options (e.g., signal/abort controller) in this stub, or keep the signature parameterless?
   - **Proposed:** Parameterless stub; options added when interrupt/cancellation semantics are implemented.
2. Should `Orchestrator.createWorkflow` validate that the requested workflow type is registered, or leave validation to a later change?
   - **Proposed:** Leave validation to the implementation change; the stub simply constructs a `Workflow`.
