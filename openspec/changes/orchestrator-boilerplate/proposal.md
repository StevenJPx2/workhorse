## Why

`packages/core-v2/src/` has a mature config plane (Zod schemas, loader, example) and service interface, but the runtime plane that executes workflows is missing. Without an `Orchestrator` to bootstrap global context and registries, and a `Workflow` to own the stage machine, later work (Harness execution, `when`-rule evaluation, issue intake) has no structural place to land. We need a compiling, lint-clean skeleton that follows the canonical `plan/rearchitecture/rearchitecture.md` shapes.

## What Changes

- Add the runtime-plane classes and interfaces described in the rearchitecture spec:
  - `Orchestrator` with `registerService`, `registerAdapter`, `registerAgentDefinition`, `registerWorkflowType`, `createWorkflow`, and `provide`.
  - `Workflow` with `run`, `provide`, states, and a step library.
- Expand `GlobalContext` to include the infrastructure and registries the Orchestrator owns.
- Expand `WorkflowContext` to carry per-run state (`status`, `issue`, `updateStatus`).
- Scaffold the rest of the step-1 layout: `workflow/step/`, `workflow/harness/`, `plugin/`, and `db/`.
- Add shared runtime types: `Issue`, `Agent`/`AgentEvent`, `Database` placeholder.
- Add colocated tests for every new file so the change remains lint/type/coverage clean.

No behavior is implemented yet; method bodies are TODO stubs that compile and pass minimal construction tests.

## Capabilities

### New Capabilities

- `orchestrator`: Bootstrap-level lifecycle: build `GlobalContext`, register services/adapters/agent definitions/workflow types, and create `Workflow` instances.
- `workflow`: Runtime stage machine: hold states/steps, expose `run()` and `provide()`, and carry per-run `WorkflowContext`.
- `workflow-step`: Runtime step definition wrapper, distinct from the config-plane `StepConfig` schema.
- `harness`: Execution harness interface that will eventually drive an `Agent` for a step.
- `plugin`: Plugin contract for external extensions that contribute via hooks and pre-transition steps.
- `db-interface`: Minimal database type placeholder for the runtime plane to reference without coupling to SQLite details.

### Modified Capabilities

- None. This change is pure scaffolding; existing config schemas and services keep their current behavior.

## Impact

- Affects `packages/core-v2/src/` only.
- Adds exports from `orchestrator/`, `workflow/`, `plugin/`, and `db/`; public entry point updates are deferred until the runtime surface is stable.
- No breaking changes to existing config, schema, or service APIs.
