# Core Rearchitecture

## Goals

- Make it the SDK even clearer and concise
- Have tiers of "interfaces"
  - clear separation of concerns
  - idempotency
  - Clear understanding where to look for what
  - smaller, more focused, more maintainable
- ideally more agent friendly
  - less boilerplate
  - more flexible
  - more modular
  - easier to extend
- tighter test coupling
  - If it is more isolated, running tests will be a lot easier and safer

## Core

High level overview of the core components:

```
                                                       ┌───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
                                                       │                                                         orchestrator                                                          │
                                                       │                                                                                                                               │
                                                       │                                                                                                    ┌───────────────────┐      │
                                                       │     ┌───────────────────────────────────────────────────────────────────────────────────────────┐  │  workflow_types   │      │
                                                       │     │                                         workflow                                          │  │                   │      │
                                                       │     │                                                                                           │  │                   │      │
                                                       │     │     ┌──────────────────────────────────────────────────────────────────────────────┐      │  │                   │      │
                                                       │     │     │                                   harness                                    │      │  │     ┌──────┐      │      │
                                                       │     │     │                                                                              │      │  │     │ralph │      │      │
                                                       │     │     │                                                                              │      │  │     │      │      │      │
                                                       │     │     │      ┌───────────────────────────────┐                                       │      │  │     └──────┘      │      │
                                                       │     │     │      │           services            │     ┌────────────────────────────┐    │      │  │                   │      │
                                                       │     │     │      │                               │     │       agent_adapter        │    │      │  │     ┌───────┐     │      │
                                                       │     │     │      │     ┌───────────┐             │     │                            │    │      │  │     │ bmad  │     │      │
                                                       │     │     │      │     │attachment │             │     │                            │    │      │  │     │       │     │      │
                                                       │     │     │      │     │           │             │     │                            │    │      │  │     └───────┘     │      │
                                                       │     │     │      │     └───────────┘             │     │     ┌─────┐ ┌────────┐     │    │      │  │                   │      │
                                                       │     │     │      │                               │     │     │ pi  │ │ codex  │     │    │      │  └───────────────────┘      │
                                                       │     │     │      │     ┌─────────┐  ┌─────┐      │     │     │     │ │        │     │    │      │                             │
                                                       │     │     │      │     │steering │  │ l2  │      │────▶│     └─────┘ └────────┘     │    │      │                             │
                                                       │     │     │      │     │         │  │     │      │     │                            │    │      │                             │
┌────────────────────────────────────────┐             │     │     │      │     └─────────┘  └─────┘      │     │     ┌───────┐              │    │      │                             │
│                plugins                 │             │     │     │      │                               │     │     │claude │              │    │      │                             │
│                                        │             │     │     │      │     ┌──────────┐┌─────┐       │     │     │       │              │    │      │                             │
│     ┌─────────┐  ┌───────┐             │             │     │     │      │     │ monitor  ││ l1  │       │     │     └───────┘              │    │      │                             │
│     │pi-agent │  │ core  │             │             │     │     │      │     │          ││     │       │     │                            │    │      │                             │
│     │         │  │       │             │             │     │     │      │     └──────────┘└─────┘       │     └────────────────────────────┘    │      │                             │
│     └─────────┘  └───────┘             │             │     │     │      │                               │                                       │      │                             │
│                                        │             │     │     │      │                               │                                       │      │                             │
│     ┌───────┐   ┌────────┐             │  via hooks  │     │     │      └───────────────────────────────┘                                       │      │                             │
│     │github │   │ figma  │             │────────────▶│     │     │                                                                              │      │                             │
│     │       │   │        │             │             │     │     │                                                                              │      │                             │
│     └───────┘   └────────┘             │             │     │     │                                                                              │      │                             │
│     ┌─────┐     ┌──────┐ ┌──────┐      │             │     │     └──────────────────────────────────────────────────────────────────────────────┘      │                             │
│     │jira │     │ web  │ │ tui  │      │             │     │     ┌──────────────────────────────────┐                                                  │                             │
│     │     │     │      │ │      │      │             │     │     │            harnesses             │                                                  │                             │
│     └─────┘     └──────┘ └──────┘      │             │     │     │                                  │                                                  │                             │
│                                        │             │     │     │                                  │                                                  │                             │
│                                        │             │     │     │      ┌───────────┐               │                                                  │                             │
│                                        │             │     │     │      │compaction │               │                                                  │                             │
└────────────────────────────────────────┘             │     │     │      │           │               │                                                  │                             │
                                                       │     │     │      └───────────┘               │                                                  │                             │
                                                       │     │     │                                  │                                                  │                             │
                                                       │     │     │      ┌─────────┐ ┌─────────┐     │                                                  │                             │
                                                       │     │     │      │ memory  │ │ coding  │     │                                                  │                             │
                                                       │     │     │      │         │ │         │     │                                                  │                             │
                                                       │     │     │      └─────────┘ └─────────┘     │                                                  │                             │
                                                       │     │     │      ┌────────┐  ┌─────────┐     │                                                  │                             │
                                                       │     │     │      │handoff │  │ prompt  │     │                                                  │                             │
                                                       │     │     │      │        │  │         │     │                                                  │                             │
                                                       │     │     │      └────────┘  └─────────┘     │                                                  │                             │
                                                       │     │     │                                  │                                                  │                             │
                                                       │     │     └──────────────────────────────────┘                                                  │                             │
                                                       │     │                                                                                           │                             │
                                                       │     └───────────────────────────────────────────────────────────────────────────────────────────┘                             │
                                                       │                                                                                                                               │
                                                       └───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

#### Diagram code

```d2
plugins: {
  core
  jira
  github
  figma
  pi-agent
  tui
  web
}

plugins -> orchestrator: via hooks {
  style: {
    stroke-dash: 3
  }
}

orchestrator: {
  workflow: {
    harness: {
      agent_adapter
      services

      services -> agent_adapter

      agent_adapter: {
        pi
        claude
        codex
      }

      services: {
        monitor
        attachment
        l1
        l2
        steering
      }
    }

    harnesses: {
      prompt
      coding
      memory
      compaction
      handoff
    }
  }

  workflow_types: {
    ralph
    bmad
  }
}
```

### Pseudo-code

#### Structs

```d2
Plugin: {
  shape: class
}

Orchestrator: {
  shape: class

  context: GlobalContext

  registerService(): "(service: Service) -> void"
  registerAgent(): "(agent: Agent) -> void"
  registerHarness(): "(harness: Harness) -> void"

  provide(): "() -> GlobalContext"
}

GlobalContext: {
  shape: class

  services: "Service[]"
  agents: "Agent[]"
  harnesses: "Harness[]"
}

Workflow: {
  shape: class

  context: WorkflowContext

  cwd: string
  +steps: "Step[]"

  # this provides context for the steps and its descendants
  provide(): "() -> WorkflowContext"
}

WorkflowContext: {
  shape: class

  status: Status
  issue: Issue

  updateStatus(): "(status: Status) -> void"
}

Status: {
  shape: enum

  planning
  implementing
  blocked
  ready_for_review
  in_review
  done   # not tool accessible (should be marked as done by the workflow based on a condition)
}


Step: {
  shape: class

  id: string
  status: Status # when it runs
  prologue: string
  epilogue: string
  harness: Harness

  whenIdle(): "() -> void" # mainly will be used to determine whether to change status
}

Harness: {
  shape: class

  globalContext: GlobalContext
  workflowContext: WorkflowContext

  agent: Agent

  sendMessage(): "(content: string) -> void"
}


Agent: {
  shape: class

  name: string
  tools: "Tool[]"
  skills: "Skill[]"
  models: "Model[]"
  scripts: "Script[]"

  selectedModel: Model

  selectModel(): "(model: Model) -> void"
}

```

### Workflow

```
┌─────────────────────────────────────────────────────────────────────┐
│                              workflow                               │
│                                                                     │
│     ┌────────┐       ┌────────┐        ┌────────┐       ┌────┐      │
│     │ step1  │──────▶│ step2  │───────▶│ step3  │──────▶│... │      │
│     │        │       │        │        │        │       │    │      │
│     └────────┘       └────────┘        └────────┘       └────┘      │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

A workflow is a collection of steps that are executed in sequence and can loop back to the beginning until the workflow is complete / solved.
This is isolated in it's own directory and is not allowed to step out of it. All the tools are made to work within this directory and `.local/state/workhorse/workflow/`

A step runs a harness with a prologue prompt and provides context for the next step using the epilogue prompt.
It can either determine when it is over on its own or the workflow itself can use a condition to determine when to stop / force the epilogue prompt.

Each step will limit the tools, skills, and scripts and their accesses based on the current status of the issue.

If the next step is different from the current one:

- `whenIdle()` will be called on the current step
- If it does not change the status, it will loop back to the first step with the same status
- If it changes the status, it will go to the next step

#### Example

##### Ralph Loop

1. **Prompt Engineer**: Original prompt -> Enhanced Prompt
   This will contain the original prompt and then enhance it with:
   - The current status of the issue from multiple sources via services
   - Codebase intelligence
   - Memory of previous interactions
   - Skills
   - Tools

   It will have **NO** write access tools.

2. **Planner**: Enhanced prompt -> Plan
   This will take the enhanced prompt and generate a plan to fix the issue.
   It will decompose the problem into smaller, non-overlapping tasks.
   It will use the tools and skills to generate the plan.

   It will have **ONLY** write access via `todo_<create|edit|delete|list>` tools.

   This will then be fed with a

3. **Coder**: Enhanced prompt -> Code
   This will take the enhanced prompt and generate code to fix the issue.
   It will use the tools and skills to generate the code.
   It will stop after 150,000 tokens are used.

4. **Memory Weaver**: Code -> Memory
   This will now take these things:
   - Summary: What was it that it did so far.
   - What it has fixed and how it fixed it.
   - What hasn't been fixed yet and why.
   - Learnings: What it has learned from the process.
   - Patterns: What patterns it has found and how it has used them.
   - Feedback: What it should do for the next iteration.

   It will then erase all the changes and start again.

```
         ┌─────────┐
    ┌────│ prompt  │◀──┐
    │    │         │   │
    │    └─────────┘   │
    │                  │
    ▼                  │
┌───────┐───────▶┌─────────┐
│ code  │        │ memory  │
│       │        │         │
└───────┘        └─────────┘
```

### Harness

```
 ┌──────────────────┐
 │     harness      │
 │                  │
 │    ┌────────┐    │
 │    │service │    │
 │    │        │    │
 │    └────────┘    │
 │         │        │
 │         ▼        │
 │     ┌────────┐   │
 │     │ agent  │   │
 │     │        │   │
 │     └────────┘   │
 │                  │
 └──────────────────┘
```

The harness contains everything for an agent to run.

For agents:

- It picks the right agent out of the pool of available agent adapters (e.g., Pi, Claude, Codex)
- Monitors the agent (e.g., memory, CPU, disk, network)
- Manages the agent's state (e.g., planning, implementing, blocked, etc.)

For services:

- Provides the services to the agent
- Restricts access to the services per agent based on conditions (e.g., agent is blocked)
- Gives access to "feed-in" to the agent (e.g. system prompt, notify, tools, skills, scripts, etc.)

#### Agent

```
┌────────────────────────────────┐
│             agent              │
│                                │
│     ┌──────┐   ┌─────────┐     │
│     │tools │   │ prompt  │     │
│     │      │   │         │     │
│     └──────┘   └─────────┘     │
│                                │
│     ┌───────┐  ┌────────┐      │
│     │skills │  │scripts │      │
│     │       │  │        │      │
│     └───────┘  └────────┘      │
│                                │
└────────────────────────────────┘
```

An agent is a single instance of a model that is running the workflow.

It consists of:

- A prompt
- Tools
- Skills
- Scripts
- Models

#### Difference Between Tools, Skills, and Scripts

#### Base Tools

> [!NOTE]
> The output will always be truncated to a maximum of 1000 characters and so will need a range parameter to be able to get the full output.

- Git (add, commit, push, pull, etc.)
- Todo (create, edit, delete, list)
- FS (read, write, delete, list, grep, glob, etc.)
- Safety (undo, zoom, etc.)
- AST (rename, extract, etc.)

#### Service

For a lack of a better word, a service works pretty much like an MCP.

It accesses the external world in a _safe_ way and provides reasonable context to the agent.
It feeds the agent with the tools, notifications, skills, etc. that it needs to run the step perfectly.

However, these are intrinsically tied to the harness and agent, it is coupled to the harness in a way that plugins can't change.

##### Base Services

###### `BasicService`

Provides access to adding tools to the agent.

All services will be registering their tools, skills, and scripts via the `BasicService` hooks.

**Hooks**

- `tools.add`: Add a tool to the agent
- `skills.add`: Add a skill to the agent
- `scripts.add`: Add a script to the agent
- `prompt.add`: add a section to the system prompt

**Tools**

- `list_tools`: List available tools
- `list_skills`: List available skills
- `list_scripts`: List available scripts
- `add_skill`: Add a skill to the agent
- `add_script`: Add a script to the agent

###### `GitService`

Provides git tools.

**Hooks**

**Tools**

- `git_add`: Add a file to the git staging area
- `git_commit`: Commit the staged changes
- `git_push`: Push the commit to the remote
- `git_pull`: Pull the latest changes from the remote

###### `L1Service`

Provides L1 context

###### `L2Service`

Provides L2 context

###### `AgentService`

Provides the agent (`pi`, `claude`, etc.)

**Tools**

- `spawn_subagent`: Spawns a subagent (e.g., Pi, Claude, Codex) with limited tools

###### `ASTService`

Provides the AST service

### Orchestrator

### Plugins

#### Philosophical Difference Between Plugins and Services
