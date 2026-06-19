## ADDED Requirements

### Requirement: Runtime Step mirrors config fields
A runtime `Step` class SHALL expose the same fields as `StepConfig` (`id`, `preset`, `prologue`, `epilogue`, `tools`, `services`, `agent`, `model`, `token_budget`, `tool_timeout`, `retry`, `sub_agents`) but as runtime-oriented properties.

#### Scenario: Construction from config
- **WHEN** a `Step` is constructed from a step id and a `StepConfig`
- **THEN** all config fields are accessible on the runtime instance

### Requirement: defineStep wrapper exists
The module SHALL export a `defineStep(id, config)` factory that returns a `Step` instance.

#### Scenario: Factory usage
- **WHEN** `defineStep("planner", { prologue: "..." })` is called
- **THEN** it returns a `Step` with the given id and merged config fields
