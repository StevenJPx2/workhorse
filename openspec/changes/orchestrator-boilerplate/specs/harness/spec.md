## ADDED Requirements

### Requirement: Harness exposes a run interface
A `Harness` class SHALL expose `run(step)` as the single execution entry point for any runtime `Step`.

#### Scenario: Callable stub
- **WHEN** a `Harness` is constructed and `run(step)` is called
- **THEN** it returns a promise that resolves (the body is permitted to be a TODO stub)

### Requirement: Harness carries both contexts
A `Harness` instance SHALL hold references to a `GlobalContext` and a `WorkflowContext`.

#### Scenario: Context access
- **WHEN** a `Harness` is constructed with both contexts
- **THEN** both contexts are accessible on the instance

### Requirement: Agent interface exists
The module SHALL define a runtime `Agent` interface with `run(prompt, tools, options)`, `notify(message)`, and `interrupt()` signatures matching the canonical event-stream contract.

#### Scenario: Interface shape
- **WHEN** a concrete agent is authored against the `Agent` interface
- **THEN** it compiles without missing the required methods

### Requirement: AgentEvent union exists
The module SHALL define an `AgentEvent` discriminated union covering `tool_call`, `tool_result`, `message`, `token_usage`, `idle`, `done`, and `error`.

#### Scenario: Event handling
- **WHEN** code pattern-matches on an `AgentEvent`
- **THEN** TypeScript narrows the event by its `type` field
