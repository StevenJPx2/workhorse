## 1. Shared runtime types

- [x] 1.1 Create `packages/core-v2/src/schema/issue/schema.ts` with a minimal `Issue` interface (`id: string`) and re-export from `schema/issue/index.ts`.
- [x] 1.2 Create `packages/core-v2/src/schema/issue/schema.test.ts` asserting an issue object satisfies the interface.
- [x] 1.3 Replace `packages/core-v2/src/db/index.ts` placeholder with a `Database` interface (structural tag `_?: "database"`) and add `db.test.ts`.

## 2. Context upgrades

- [x] 2.1 Update `packages/core-v2/src/orchestrator/context.ts` to add `db: Database` and registries (`serviceDefinitions`, `adapterClasses`, `agentDefinitions`, `workflowTypes`) using placeholder types.
- [x] 2.2 Update `packages/core-v2/src/workflow/context.ts` to add `status: StatusT`, `issue: Issue`, and `updateStatus(status: StatusT): void`.
- [x] 2.3 Add/upgrade colocated tests for both context files.

## 3. Orchestrator

- [x] 3.1 Create `packages/core-v2/src/orchestrator/orchestrator.ts` implementing `Orchestrator` with constructor (`config: ResolvedConfigT`), `registerService`, `registerAdapter`, `registerAgentDefinition`, `registerWorkflowType`, `createWorkflow(issue, workflowType)`, and `provide()`.
- [x] 3.2 Define minimal registry element types (`ServiceDefinition`, `AdapterClass`, `AgentDefinition`) inline or in `orchestrator/types.ts` if file-line limits require it.
- [x] 3.3 Create `packages/core-v2/src/orchestrator/orchestrator.test.ts` covering construction, all four register methods, and `createWorkflow` returning a workflow with the correct context.
- [x] 3.4 Update `packages/core-v2/src/orchestrator/index.ts` to export the new symbols.

## 4. Workflow

- [x] 4.1 Create `packages/core-v2/src/workflow/workflow.ts` implementing `Workflow` with `states`, `steps`, `provide()`, and an async `run()` TODO stub.
- [x] 4.2 Define runtime `State` and `ExitRule` types adjacent to `Workflow` (or in `workflow/state.ts` if line limits require it).
- [x] 4.3 Create `packages/core-v2/src/workflow/workflow.test.ts` covering construction from a `WorkflowConfig`, `provide()` returning the same context, and `run()` resolving.
- [x] 4.4 Update `packages/core-v2/src/workflow/index.ts` to export the new symbols.

## 5. Step runtime wrapper

- [x] 5.1 Create `packages/core-v2/src/workflow/step/step.ts` with a runtime `Step` class whose constructor accepts `(id: string, config: StepConfigT)` and exposes camelCase properties mirroring `StepConfig`.
- [x] 5.2 Create `packages/core-v2/src/workflow/step/define.ts` exporting `defineStep(id, config)`.
- [x] 5.3 Create `packages/core-v2/src/workflow/step/index.ts` re-exporting both.
- [x] 5.4 Create `packages/core-v2/src/workflow/step/step.test.ts` verifying construction and `defineStep`.

## 6. Harness and Agent runtime bones

- [x] 6.1 Create `packages/core-v2/src/workflow/harness/agent.ts` with `Agent` interface (`run`, `notify`, `interrupt`) and `AgentEvent` discriminated union.
- [x] 6.2 Create `packages/core-v2/src/workflow/harness/harness.ts` with `Harness` class holding `globalContext` and `workflowContext` and exposing async `run(step)` TODO stub.
- [x] 6.3 Create `packages/core-v2/src/workflow/harness/index.ts` re-exporting both.
- [x] 6.4 Create `packages/core-v2/src/workflow/harness/harness.test.ts` covering construction and `run()` resolving.

## 7. Plugin stub

- [x] 7.1 Create `packages/core-v2/src/plugin/plugin.ts` with `Plugin` interface (`name`, optional `version`, `setup(context: GlobalContext)`) and `definePlugin(plugin)` helper.
- [x] 7.2 Create `packages/core-v2/src/plugin/index.ts` re-exporting both.
- [x] 7.3 Create `packages/core-v2/src/plugin/plugin.test.ts` verifying `definePlugin`.

## 8. Integration and verification

- [x] 8.1 Run `aube -F core-v2 run lint` and fix any import/path or oxlint errors.
- [x] 8.2 Run `aube -F core-v2 run typecheck` and resolve any type errors.
- [x] 8.3 Run `aube -F core-v2 run test` and ensure coverage thresholds pass (97% lines/functions, 95% branches).
- [x] 8.4 Run `aube -F core-v2 run fallow` and address any flagged issues.
