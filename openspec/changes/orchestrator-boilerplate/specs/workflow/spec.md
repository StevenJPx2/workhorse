## ADDED Requirements

### Requirement: Workflow holds the stage machine
A `Workflow` instance SHALL expose `states` (an ordered array of runtime `State` objects) and `steps` (a map of step id to runtime `Step`).

#### Scenario: Construction
- **WHEN** a `Workflow` is constructed with a `WorkflowConfig`
- **THEN** its `states` and `steps` match the workflow config's `states` and `steps`

### Requirement: Workflow provides WorkflowContext
A `Workflow` instance SHALL expose `provide()` that returns the `WorkflowContext` it was constructed with.

#### Scenario: Context access
- **WHEN** `provide()` is called on a workflow
- **THEN** it returns the same `WorkflowContext` instance passed at construction

### Requirement: Workflow exposes a run entry point
A `Workflow` instance SHALL expose an async `run()` method that represents the stage-machine execution entry point.

#### Scenario: Run is callable
- **WHEN** `run()` is invoked
- **THEN** it returns a promise that resolves (the body is permitted to be a TODO stub)

### Requirement: WorkflowContext carries per-run state
`WorkflowContext` SHALL extend `GlobalContext` and additionally carry `status`, `issue`, and an `updateStatus(status)` method.

#### Scenario: Status mutation
- **WHEN** `updateStatus` is called with a valid `Status`
- **THEN** `provide().status` reflects the new status
