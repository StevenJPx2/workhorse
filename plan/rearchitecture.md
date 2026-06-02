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
│     │     │     │      │ │      │      │             │     │     │            step presets          │                                                  │                             │
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
                                                       │     │     │      ┌─────────┐ ┌─────────┐     │                                                  │                             │
                                                       │     │     │      │planning │ │ prompt  │     │                                                  │                             │
                                                       │     │     │      │         │ │         │     │                                                  │                             │
                                                       │     │     │      └─────────┘ └─────────┘     │                                                  │                             │
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

    step_presets: {
      prompt
      planning
      coding
      memory
      compaction
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
  registerAdapter(): "(adapter: Agent) -> void"
  registerWorkflowType(): "(name: string, config: WorkflowConfig) -> void"

  createWorkflow(): "(issue: Issue, workflowType: string) -> Workflow"
  provide(): "() -> GlobalContext"
}

GlobalContext: {
  shape: class

  # infrastructure
  db: Database
  hooks: Hooks
  config: Config

  # registries — definitions only, no instances
  serviceDefinitions: "ServiceDefinition[]"
  adapterClasses: "AdapterClass[]"
}

Workflow: {
  shape: class

  context: WorkflowContext

  cwd: string
  +steps: "Step[]"

  # this provides context for the steps and its descendants
  provide(): "() -> WorkflowContext"
  run(): "() -> Promise<void>"
}

WorkflowContext: {
  shape: class

  # instantiated from GlobalContext registries — not shared between workflows
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
  done   # not tool accessible (set by the workflow when a transition condition is met)
}


Step: {
  shape: class

  id: string
  status: Status # which status activates this step
  prologue: string  # becomes the agent's system prompt
  epilogue: string  # final prompt sent to agent; response feeds next step's prologue
  tools: "string[]"  # allowlist
  services: "string[]"
  agent: string
  model: string
  subAgentTemplates: "SubAgentTemplate[]"
  transitionWhen: "Condition[]"
}

SubAgentTemplate: {
  shape: class

  name: string
  tools: "string[]"       # allowlist ceiling — parent can narrow further at spawn time
  writeGlobs: "string[]"
  agent: string
  model: string
}

Harness: {
  shape: class

  globalContext: GlobalContext
  workflowContext: WorkflowContext

  agent: Agent

  # intersects step filters with service contributions before passing to agent
  # enforces tool output truncation (configurable per-step, default ~2000-3000 chars)
  run(): "(step: Step) -> Promise<void>"
}


Agent: {
  shape: class

  # run the agent; yields a stream of events
  run(): "(prompt: string, tools: Tool[], options?: RunOptions) -> AsyncIterable<AgentEvent>"

  # push a message into the running session (notifications, user messages)
  notify(): "(message: string) -> void"

  # stop the agent
  interrupt(): "() -> void"
}

Agent: {
  shape: class

  name: string
  tools: "Tool[]"
  skills: "Skill[]"
  models: "Model[]"
  scripts: "Script[]"
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
This is isolated in its own directory and is not allowed to step out of it. All the tools are made to work within this directory and `$XDG_STATE_HOME/workhorse/workflow/<issue-id>/`.

**Status is the primary driver of which steps run.** The Workflow watches deterministic conditions (e.g. "all todos complete") to advance status. Status changes drive step selection — the agent doesn't know about or control transitions.

The Workflow checks external state (todo files on disk, git status, token count) on a poll/hook basis while the step's agent is working.

**Workflow types are pure data (TOML/JSON).** Transition conditions are named built-ins, not arbitrary functions. Custom workflow types can be loaded from `.workhorse/workflows/`. `ralph` ships as a built-in.

A step runs the Harness with a prologue (system prompt) and, on completion, sends an epilogue prompt to the agent. The agent's response to the epilogue becomes the next step's prologue input. Each step creates a fresh agent session — no conversation history is shared between steps.

Each step limits the tools, skills, and scripts available based on its allowlist configuration, not the current status alone.

**Plugin-injected pre-transition steps**: Plugins can register steps that run synchronously before the workflow's own steps when a status transition occurs (e.g. GitHub plugin injects a PR-creation step on transition to `in_review`).

#### Built-in Transition Conditions

| Condition               | Description                            |
| ----------------------- | -------------------------------------- |
| `todos_complete`        | All todo items are marked done         |
| `token_budget_exceeded` | Step has consumed its token limit      |
| `step_idle`             | Agent stopped producing output         |
| `status_changed`        | Issue status changed externally        |
| `always`                | Unconditionally true                   |
| `state_check`           | Generic condition for custom scenarios |

Conditions support AND/OR composites.

#### `workflow.toml` Example

A workflow type is a plain TOML file placed in `.workhorse/workflows/<name>.toml` (or shipped as a built-in). It declares the steps and the conditions that drive transitions between them.

When a `preset` is specified, all fields (status, agent, model, prologue, epilogue, tools, token_budget, etc.) are inherited from the preset definition. Any field you specify is an override.

```toml
# .workhorse/workflows/ralph.toml

name    = "ralph"
version = "1"

# ─────────────────────────────────────────
# Step 1 — Prompt Engineer
# Uses the "prompt" preset as-is — no overrides needed.
# ─────────────────────────────────────────
[[steps]]
id     = "prompt-engineer"
preset = "prompt"

[[steps.transitions]]
condition = "token_budget_exceeded"
next      = "planner"

[[steps.transitions]]
condition = "step_idle"
next      = "planner"

# ─────────────────────────────────────────
# Step 2 — Planner
# Uses the "planning" preset as-is.
# ─────────────────────────────────────────
[[steps]]
id     = "planner"
preset = "planning"

[[steps.transitions]]
condition = "todos_complete"
next_status = "implementing"

[[steps.transitions]]
condition = "token_budget_exceeded"
next      = "coder"

[[steps.transitions]]
condition = "step_idle"
next      = "coder"

# ─────────────────────────────────────────
# Step 3 — Coder
# Uses the "coding" preset but overrides token_budget and adds sub-agents.
# ─────────────────────────────────────────
[[steps]]
id     = "coder"
preset = "coding"

[steps.token_budget]
max = 150_000  # override preset default

[[steps.sub_agents]]
name        = "researcher"
model       = "claude-haiku-3"
write_globs = []  # read-only
tools       = ["fs_read", "fs_grep", "fs_glob"]

[[steps.sub_agents]]
name        = "tester"
model       = "claude-sonnet-4"
write_globs = ["**/*.test.ts", "**/*.spec.ts"]
tools       = ["fs_read", "fs_write", "fs_grep", "todo_list"]

[[steps.transitions]]
condition = "token_budget_exceeded"
next      = "memory-weaver"

[[steps.transitions]]
condition = "todos_complete"
next_status = "ready_for_review"

[[steps.transitions]]
condition = "step_idle"
next      = "memory-weaver"

# ─────────────────────────────────────────
# Step 4 — Memory Weaver
# Uses the "memory" preset but overrides model to use a lighter one.
# ─────────────────────────────────────────
[[steps]]
id     = "memory-weaver"
preset = "memory"
model  = "claude-haiku-3"  # override: lighter model for summarisation

[[steps.transitions]]
condition = "step_idle"
next      = "prompt-engineer"  # loop back — next iteration starts fresh

[[steps.transitions]]
condition = "token_budget_exceeded"
next      = "prompt-engineer"
```

**Full override example** — if you need to completely customise a step without using a preset:

```toml
[[steps]]
id     = "custom-step"
status = "implementing"
agent  = "claude"
model  = "claude-sonnet-4"

prologue = """
You are a custom agent. Do something specific.
"""

epilogue = """
Summarise what you did.
"""

tools = ["fs_read", "fs_write", "git_commit"]

[steps.token_budget]
max = 50_000

[[steps.transitions]]
condition = "step_idle"
next      = "next-step"
```

#### Example - Ralph Loop

##### Planning

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

##### Implementing

3. **Coder**: Enhanced prompt -> Code
   This will take the enhanced prompt and generate code to fix the issue.
   It will use the tools and skills to generate the code.
   It will stop after the token budget is exhausted (configurable per step).

4. **Memory Weaver**: Code -> Memory
   This will now take these things:
   - Summary: What was it that it did so far.
   - What it has fixed and how it fixed it.
   - What hasn't been fixed yet and why.
   - Learnings: What it has learned from the process.
   - Patterns: What patterns it has found and how it has used them.
   - Feedback: What it should do for the next iteration.

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

There is a **single generic Harness** that executes any step. All differentiation happens at the Step level. The Harness is the execution engine ("how to run"); the Step is the configuration ("what to run").

For agents:

- It picks the right agent adapter from the pool (e.g., Pi, Claude, Codex)
- Monitors the agent (e.g., memory, CPU, disk, network)
- Creates a fresh agent session per step (no shared conversation history)

For services:

- Intersects service contributions with the step's allowlist before passing them to the agent
- Enforces **tool output truncation** (configurable per step, default ~2000–3000 chars); tools return full output and the Harness truncates, adding a range hint so the agent can request more
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

- **Tools** — Functions the agent can invoke (git, FS, todo, AST, safety). Output is always truncated to a configurable max; tools must accept a range parameter for paginated access.
- **Skills** — Reusable prompt fragments or instruction sets injected into the agent's context.
- **Scripts** — Executable scripts the agent can run in the workflow environment.

#### Base Tools

> [!NOTE]
> The output will always be truncated to a configurable maximum (default ~2000–3000 chars) and so will need a range parameter to be able to get the full output.

- Git (add, commit, push, pull, etc.)
- Todo (create, edit, delete, list)
- FS (read, write, delete, list, grep, glob, etc.)
- Safety (undo, zoom, etc.)
- AST (rename, extract, etc.)

#### Sub-Agents

Steps can define **sub-agent templates** — named profiles with predefined constraints:

- **Config defines max permissions** — `tools`, `write_globs`, `agent`/`model` ceiling.
- **Parent can narrow at spawn time** — Parent can restrict `write_globs` further but can never exceed the config's ceiling.
- **Sub-agents cannot spawn sub-agents** — Always leaf nodes. One level deep only (parent → sub-agents).
- **`ask_parent` tool** — Sub-agent calls `ask_parent(question)`; Harness pauses the sub-agent, routes the question to the parent via `notify()`, waits for the parent's response, and returns it.

#### Service

For a lack of a better word, a service works pretty much like an MCP.

It accesses the external world in a _safe_ way and provides reasonable context to the agent.
It feeds the agent with the tools, notifications, skills, etc. that it needs to run the step perfectly.

However, these are intrinsically tied to the harness and agent — plugins cannot change the core service wiring.

Services have a lifecycle (`setup()` / `teardown()`) and contribute tools, skills, notifications, and prompt sections to the agent. All contributions are declared with metadata/tags so the Step's allowlist controls what's active (**co-owned activation**: service declares, step filters).

##### Base Services

###### `BasicService`

The contribution gateway. All services and plugins register their tools, skills, and scripts via `BasicService` hooks. It collects contributions, filters them per-step, and provides them to the agent.

**Hooks**

- `tools.add`: Add a tool to the agent
- `skills.add`: Add a skill to the agent
- `scripts.add`: Add a script to the agent
- `prompt.add`: Add a section to the system prompt

**Tools**

- `list_tools`: List available tools
- `list_skills`: List available skills
- `list_scripts`: List available scripts
- `add_skill`: Add a skill to the agent
- `add_script`: Add a script to the agent

###### `GitService`

Provides git tools.

**Tools**

- `git_add`: Add a file to the git staging area
- `git_commit`: Commit the staged changes
- `git_push`: Push the commit to the remote
- `git_pull`: Pull the latest changes from the remote

###### `L1Service`

Provides L1 context (per-worktree `context.md` session memory). L1 compaction runs periodically as a step preset to summarize older session entries and prevent `context.md` bloat.

###### `L2Service`

Provides L2 context (semantic search via `retriv` — BM25 FTS5 + vector embeddings). Contributes search results to the agent prompt via `BasicService` hooks. Indexing uses the XDG state directory.

###### `AgentService`

Provides agent spawning capabilities.

**Tools**

- `spawn_subagent`: Spawns a sub-agent (e.g., Pi, Claude, Codex) with limited tools per the step's sub-agent template

###### `ASTService`

Provides AST operations (rename, extract, etc.)

### Orchestrator

The Orchestrator owns the full bootstrap lifecycle. It creates **GlobalContext** — shared infrastructure and registries — then creates a **WorkflowContext** per workflow run. There is no shared mutable state between workflows.

**GlobalContext** holds:

- Infrastructure: DB, hooks, config
- Registries: service definitions, adapter classes (definitions only — no instances)

**WorkflowContext** holds per-run instances of services and agents, instantiated from the GlobalContext registries.

**Issue intake** happens at the Orchestrator level, before a Workflow starts. The Orchestrator spawns a lightweight one-off agent (via AgentService) to fetch and structure issue details from any source (Jira MCP, GitHub MCP, etc.). The agent produces a structured JSON Issue object → DB record → worktree/branch creation → Workflow starts. Workflows are self-contained execution units and are not responsible for their own setup.

### Directory Layout & State

**`.workhorse/`** (inside worktree, committed to git):

- Project config
- Custom skills
- Custom workflow type definitions (`.workhorse/workflows/`)

**`$XDG_STATE_HOME/workhorse/workflow/<issue-id>/`** (runtime state, tool-access only):

- Todo files
- Memory / step outputs
- Shared across workflow runs for the same issue
- Agents cannot directly read/write this via FS tools; they must use dedicated tools (e.g. `todo_*`, memory tools)

**Agent path scopes:**

- Worktree — direct FS access for code
- XDG state — only through dedicated tools

### Plugins

Plugins are **completely decoupled from harness internals**. They interact only via hooks and contribute tools/skills/prompts exclusively through `BasicService` hooks at plugin setup time (globally — not per-step). Step config controls which contributions are active for each step.

Plugins can also **inject pre-transition steps** — steps that run synchronously before the workflow's own steps when a status transition occurs.

#### Philosophical Difference Between Plugins and Services

- **Services** are intrinsically tied to the Harness and agent execution. They are part of the core execution machinery; plugins cannot alter their wiring. They contribute to agents via `BasicService` hooks and have their contributions filtered by step config.
- **Plugins** are entirely external. They contribute tools, skills, and prompt sections through the same `BasicService` hooks, but the core cannot depend on them. They extend what agents can do without touching how agents run.
