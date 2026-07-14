# Step 1

## Scaffolding

```
config/ ## all the definitions for the ~/.config/workhorse.toml and similar config files.
db/ ## db definitions
hooks/ ## hooks
plugin/ ## plugins
orchestrator/
├─ orchestrator.ts ## bootstrapping logic
workflow/
├─ step/
│  ├─ step.ts ## class definition for a class
│  ├─ define.ts ## thin wrapper function to define a step
├─ harness/
│  ├─ harness.ts
│  ├─ agent.ts
services/ ## services used by the harness, can also be used externally, like AgentService
├─ base.ts
├─ ...
schema/ ## shared type definitions

```
