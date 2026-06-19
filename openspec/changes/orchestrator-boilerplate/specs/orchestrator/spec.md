## ADDED Requirements

### Requirement: Orchestrator owns GlobalContext creation
The `Orchestrator` class SHALL construct and expose a `GlobalContext` containing infrastructure (`db`, `hooks`, `config`) and definition-only registries (`serviceDefinitions`, `adapterClasses`, `agentDefinitions`, `workflowTypes`).

#### Scenario: Bootstrap
- **WHEN** an `Orchestrator` is constructed with a `ResolvedConfigT`
- **THEN** calling `provide()` returns a `GlobalContext` whose `config` matches the supplied config and whose registries are initially empty

### Requirement: Orchestrator registers services
The `Orchestrator` class SHALL expose `registerService(serviceDefinition)` that adds a service definition to `GlobalContext.serviceDefinitions`.

#### Scenario: Service registration
- **WHEN** `registerService` is called with a valid service definition
- **THEN** the service definition appears in `provide().serviceDefinitions`

### Requirement: Orchestrator registers adapters
The `Orchestrator` class SHALL expose `registerAdapter(adapterClass)` that adds a runtime agent adapter class to `GlobalContext.adapterClasses`.

#### Scenario: Adapter registration
- **WHEN** `registerAdapter` is called with an adapter class
- **THEN** the adapter class appears in `provide().adapterClasses`

### Requirement: Orchestrator registers agent definitions
The `Orchestrator` class SHALL expose `registerAgentDefinition(agentDefinition)` that adds a config-plane agent definition to `GlobalContext.agentDefinitions`.

#### Scenario: Agent definition registration
- **WHEN** `registerAgentDefinition` is called with an agent definition
- **THEN** the agent definition appears in `provide().agentDefinitions`

### Requirement: Orchestrator registers workflow types
The `Orchestrator` class SHALL expose `registerWorkflowType(name, config)` that adds a `WorkflowConfig` to `GlobalContext.workflowTypes` keyed by name.

#### Scenario: Workflow type registration
- **WHEN** `registerWorkflowType` is called with a unique name and a valid `WorkflowConfig`
- **THEN** the workflow config appears in `provide().workflowTypes` under that name

### Requirement: Orchestrator creates workflows
The `Orchestrator` class SHALL expose `createWorkflow(issue, workflowType)` that returns a `Workflow` instance whose `WorkflowContext` is built from the Orchestrator's `GlobalContext` plus the supplied issue and workflow type.

#### Scenario: Workflow creation
- **WHEN** `createWorkflow` is called with an `Issue` and a registered workflow type name
- **THEN** it returns a `Workflow` whose `provide()` exposes a `WorkflowContext` containing the issue, the workflow type config, and the global hooks/config
