# Core Rearchitecture

> **Config model.** A workflow is a list of `[[states]]` — each a status with an
> ordered `steps` list and `exits` — and routing is
> `exits = [{ when = "<expr>", to = "<status>" }]` using the safe `when`
> expression grammar. Config is authored and validated in idiomatic
> **snake_case** throughout (the schemas mirror the TOML; no case conversion).
> Worked example: `packages/core-v2/src/config/example.ts` (run `bun packages/core-v2/scripts/config-smoke.ts`).

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

  registerService(): "(service: ServiceDefinition) -> void"
  registerAdapter(): "(adapter: AdapterClass) -> void"  # runtime Agent impl, not a config provider
  registerAgentDefinition(): "(def: AgentDefinition) -> void"
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
  adapterClasses: "AdapterClass[]"        # runtime Agent implementations (claude/pi/codex)
  agentDefinitions: "AgentDefinition[]"   # config-plane providers; reference an adapter class by name
  workflowTypes: "WorkflowConfig[]"       # built-in + loaded from .workhorse/workflows/
}

Workflow: {
  shape: class

  context: WorkflowContext

  cwd: string
  states: "State[]"          # the stage machine, in order
  steps: "map[string]Step"   # step library, referenced by id from states

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
  blocked            # entered via agent-set condition; exited via external status_changed
  ready_for_review
  in_review
  done               # terminal: no stage — reaching it exits Workflow.run()
}


# A library entry, referenced by id from a State's `steps`. It carries NO
# status and NO routing — the State that lists it decides where it runs, and
# only States carry exit rules.
Step: {
  shape: class

  id: string
  preset: string  # optional: inherit a preset's fields; any field below overrides it
  prologue: string  # becomes the agent's system prompt
  # default/positional handoff — feeds the NEXT step in declaration order, or the
  #   loop-back target. Overridden per-transition by ExitRule.epilogue (see below).
  epilogue: string  # final prompt sent to the finishing agent; response → next prologue
  tools: "string[]"  # allowlist — gate only, never provides
  services: "string[]"  # allowlist — gate only, never provides
  agent: string  # name of an agent definition (config plane)
  model: string
  tokenBudget: number  # scalar; drives `token_budget_exceeded`; overridable, default from preset/config
  toolTimeout: number  # default per-tool timeout (ms); individual tools may override
  retry: number  # retries before routing to `blocked` on failure (default 0 = fail-fast)
  subAgents: "SubAgentTemplate[]"
}

# A State (stage) is one status's block: an ordered list of step ids that run
# in declaration order and loop back to the first until an exit fires. Only
# States route — steps never do.
State: {
  shape: class

  name: Status               # the status this block represents
  steps: "string[]"          # step ids; run in order, looping
  exits: "ExitRule[]"        # routing rules, evaluated in order (first match wins)
}

# An exit's `when` is a safe boolean expression (see "The `when` rule
# language"). When it holds, control switches to the `to` status and lands on
# that block's FIRST step. `to` must differ from the owning State's `name` and
# resolve to a known status (checked at load).
ExitRule: {
  shape: class

  when: string               # safe boolean expression — pure data, never code
  to: Status                 # target status — switch block; land on its first step
  epilogue: string           # optional: transition handoff posed to the finishing
                             #   agent when THIS exit fires; response → first step of
                             #   `to`. Falls back to Step.epilogue when omitted.
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

  # intersects (agent definition + service contributions) against the step's
  #   tools[]/services[] allowlist, most-restrictive wins, and provides the
  #   result to the agent (capability services declare/collect; Harness intersects)
  # enforces tool output truncation (configurable per-step, default ~2000-3000 chars)
  # interrupts the agent only at tool-call boundaries (never mid-tool-call)
  run(): "(step: Step) -> Promise<void>"
}

# ── Runtime plane ──────────────────────────────────────────────
# The live agent the Harness drives. "Bones" — it carries no config;
# it receives the assembled capability set provided to it at run time.
Agent: {
  shape: class

  # run the agent; yields a stream of events
  run(): "(prompt: string, tools: Tool[], options?: RunOptions) -> AsyncIterable<AgentEvent>"

  # push a message into the running session (notifications, user messages)
  notify(): "(message: string) -> void"

  # stop the agent; finishes the in-flight tool call, then emits
  # done{reason: interrupted} and closes the iterable (see Agent Event Stream)
  interrupt(): "() -> void"
}

# The stream `run()` yields. The iterable ALWAYS terminates with a final
# `done` event carrying a reason — never dangles. See Agent Event Stream.
AgentEvent: {
  shape: enum

  tool_call      # agent invoked a tool (Harness enforces timeout + truncation)
  tool_result    # tool returned (may be an error result, e.g. failed sub-agent)
  message        # assistant text
  token_usage    # running token count → feeds `token_budget_exceeded`
  idle           # no output produced → feeds `step_idle`
  done           # terminal: { reason: completed | interrupted | error }
  error          # surfaced failure (agent crash, fatal tool error)
}

# ── Config plane ───────────────────────────────────────────────
# An agent definition is authored config, but it is a PROVIDER of
# capabilities, not a gate. It supplies the actual tools/skills/
# scripts/models for a backend (e.g. claude, pi, codex). Steps
# reference it by name; the Step allowlist does the gating.
AgentDefinition: {
  shape: class

  name: string
  tools: "Tool[]"
  skills: "Skill[]"
  models: "Model[]"
  scripts: "Script[]"
}

```

### Config Plane vs Runtime Plane

The design has two planes, and it is important not to conflate them:

- **Config plane (declarative, authored on disk).** Workflow types, step presets, and **agent definitions** — one schema family. Two distinct roles live here:
  - **Providers** — an **agent definition** supplies actual capabilities (tools, skills, scripts, models) for a backend (`claude`, `pi`, `codex`). Steps reference it by `agent` name.
  - **Gates** — a Step's `tools[]`/`services[]` are **allowlists only**. They never provide a capability; they only permit one. `services[]` decides which services are active; `tools[]` is the final per-tool filter.
- **Runtime plane (behavioral, in memory).** The live `Agent` (`run`/`notify`/`interrupt`) the Harness drives — "bones." It carries no config; it receives the assembled capability set provided to it.

Capability assembly is one-directional, so there is no multi-source precedence puzzle:

```
  PROVIDERS                         GATE (config — allow only)        RUNTIME
  ┌──────────────────────┐
  │ agent definition     │──┐
  │ (tools/skills/...)    │  │       ┌────────────────────┐
  ├──────────────────────┤  ├──────▶ │ Step: services[]    │ ──────▶  Agent
  │ service contributions│──┘        │       tools[] allow │          (receives the
  └──────────────────────┘           └────────────────────┘           intersection)
```

The Harness computes `(agent definition ∪ service contributions) ∩ step allowlist`, most-restrictive wins, and provides the result to the `Agent`. **Config gates; it never provides.**

**Three related concepts, distinct roles:**

- **`AdapterClass`** — the runtime _implementation_ of an agent backend (claude/pi/codex). Registered via `registerAdapter`. Instantiated into a live `Agent`.
- **`Agent`** (runtime) — a live instance the Harness drives. Bones.
- **`AgentDefinition`** (config) — names an adapter class and supplies its capability set (tools/skills/scripts/models). A Step's `agent` field references an `AgentDefinition` by name; the Harness resolves it to an `AdapterClass`, instantiates the `Agent`, and provides the gated capabilities.

**Naming convention:** config — and the Zod schemas that validate it — use idiomatic **snake_case** throughout (`token_budget`, `write_globs`, `sub_agents`); the schemas mirror the TOML shape directly, so there is **no case conversion**. (Runtime class members may still use camelCase.)

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

**The workflow is linear; the only routing decision is the stage (status).** A **stage** (`[[states]]`) is one status with an ordered list of step ids. Its steps run **in declaration order**, looping back to the first step at the end. This positional flow is the _only_ intra-stage movement — a step never names "what runs next."

**Only stages route, via `exits`.** A stage's `exits` are rules `{ when = "<expr>", to = "<status>", epilogue? = "<prompt>" }`, evaluated in order — **first match wins**. When an exit's `when` holds, control switches to the `to` status and lands on the **first step of that stage**, and the exit's optional `epilogue` (if set) is the handoff prompt for that transition (see below). There is no step-level routing. `to` must differ from the stage's own status (same-stage looping is already implicit) and resolve to a known status. A backward edge is just a `to` an earlier stage.

The agent doesn't know about or control routing.

```
stage: planning       ┌─ prompt-engineer ─→ planner ─┐
                      └────────── loop (implicit) ◄────┘
                                       │ exit: when todos_complete → to = implementing (first step)
                                       ▼
stage: implementing   ┌─ coder ─→ memory-weaver ─┐
                      └───────── loop (implicit) ◄┘
                                       │ exit: when todos_complete → to = ready_for_review (first step)
                                       ▼
                            (reusable tail — see below)

  A backward edge is just a `to` an earlier stage, e.g.
  ready_for_review (checks fail) → to = implementing → lands on coder (its first step).
```

The Workflow checks external state (todo files on disk, git status, token count) on a poll/hook basis while the step's agent is working, evaluating each stage's `exits`. A routing decision never interrupts the agent mid-tool-call — the Harness finishes the in-flight tool call, then halts before the next one (see Harness).

**Terminal & blocked.** Reaching `done` ends `Workflow.run()`; the status is set as a final side-effect — there is no "done step." `done` is **never agent-controlled**: it is forced by an **external hook** (e.g. a sign-off/merge event), not by an internal condition the agent can satisfy. The `blocked` status is reached by an agent-set condition (a tool marks the issue blocked) and is exited by an external `status_changed` (e.g. a human answers). Both `blocked` and a signed-off `in_review` are **park states**: stages the workflow rests in (no satisfied exit condition) until an external event routes out. Parking is normal — a workflow may sit in `in_review` indefinitely until an external hook forces `done` or a change-request routes back to `implementing`.

**Workflow types are pure data (TOML/JSON).** Exit `when` rules use a fixed grammar of named built-ins, state keys, and comparisons — not arbitrary functions. Custom workflow types can be loaded from `.workhorse/workflows/`. `ralph` ships as a built-in.

A step runs the Harness with a prologue (system prompt). When the step's run **resolves** — whether it finished cleanly (`done{completed}`) or was halted at a boundary by a firing exit (`done{interrupted}`) — the Workflow resolves routing and then sends the **handoff prompt that belongs to the chosen edge**. The agent's response to that prompt becomes the next step's prologue input. Each step creates a fresh agent session — no conversation history is shared between steps.

**The handoff (epilogue) is edge-scoped, not just step-scoped.** Which prompt is sent depends on where control goes next:

- **Stay in the stage** (advance to the next step in declaration order, or loop back to the first) → send the source `Step.epilogue`. This handoff varies by **source**, so it lives on the step (e.g. memory-weaver's epilogue feeds the coder).
- **Leave the stage** (an exit's `when` held) → send that `ExitRule.epilogue`, falling back to `Step.epilogue` when the exit omits one. This handoff varies by **destination and reason** — the same exit, fired from any step in the stage, hands the same thing to the target's first step — so it lives on the exit.

Because an exit's `when` _is_ the reason for leaving, the exit handoff naturally reflects it: `token_budget_exceeded` can ask the agent to checkpoint partial progress, while `todos_complete` can ask it to summarise the finished work for the next stage. This is also why the handoff is extracted in the finishing agent's **live session** (only it still holds the working context) rather than deferred to the next step, which has no session yet.

Each step limits the tools, skills, and scripts available based on its allowlist configuration, not the current status alone.

**Plugin-injected pre-transition steps**: Plugins can register steps that run synchronously before the workflow's own steps when a status transition occurs (e.g. GitHub plugin injects a PR-creation step on transition to `in_review`).

#### The `when` Rule Language

A stage routes via its `exits`; each exit's `when` is a small, **safe boolean expression** — pure data, never code. It mixes three kinds of atom, combined with `and` / `or` / `not` and parentheses:

| You write                      | Kind                   | Means                       |
| ------------------------------ | ---------------------- | --------------------------- |
| `todos_complete`               | built-in name          | a fixed runtime check       |
| `git_clean`                    | bare boolean state key | the key is truthy           |
| `todo_count == 0`              | state comparison       | `==` `!=` `>` `>=` `<` `<=` |
| `checks_status != "passed"`    | …with a string literal | string compare              |
| `file_exists("PLAN.md")`       | parameterised key      | existence check             |
| `branch matches "^feat/"`      | pattern match          | regex/glob match            |
| `todos_complete and git_clean` | composite              | mix names + state freely    |

- **Built-in names** (fixed, core-owned): `todos_complete`, `token_budget_exceeded`, `step_idle`, `status_changed`, `review_settled`, `always`. A bad name is caught the moment the workflow loads.
- **State keys** are runtime-extensible: core ships `file_exists`, `git_clean`, `git_ahead`, `todo_count`, `token_used`, `iteration_count`, `status`, and plugins surface more (e.g. `checks_status`, `open_review_threads` for the review tail).
- **Composites** are written inline with `and` / `or` / `not` — there is no separate composite table.

`review_settled` is **hook-extensible**: plugins (GitHub checks/comments) and Jira (change-requests / sign-off) feed it. It holds only when every external input is resolved with no pending items.

> **Resources.** Resource usage (memory/CPU/disk/network) is **monitored** by the Harness and surfaced as metrics — it is not a routing input. If a workflow needs to react to usage, expose a monitored value as a state key and compare it in a `when` rule.

**Load-time validation (workflow types are frozen at start — see Directory Layout).** At parse time the loader enforces:

- step `id`s are unique within a workflow, and every id named by a stage exists;
- every stage `name` is a known status;
- every exit `to` resolves to a known status (or terminal `done`) and **differs from the owning stage's status** (same-stage exits are redundant and rejected);
- every `when` parses, and every built-in name, state key, and operator in it is known;
- an exit's optional `epilogue`, if present, is a non-empty string;
- **park-stage check** — a stage with no satisfiable exit is allowed only if it has an external route (`status_changed`, or `done` forced by an external hook). A stage with neither is flagged (it can never advance).

A workflow that fails validation is rejected before it runs.

#### `workflow.toml` Example

A workflow type is a plain TOML file placed in `.workhorse/workflows/<name>.toml` (or shipped as a built-in). It has two halves: the **stages** (`[[states]]` — the machine) on top, and a **step library** (`[steps.<id>]` — definitions referenced by id) below.

When a step sets `preset`, all fields (agent, model, prologue, epilogue, tools, token_budget, etc.) are inherited from that preset; any field on the step is an override. A step lists **no status** — the stage that names it decides where it runs. Steps sharing a stage run in **declaration order**, looping back to the stage's first step until an exit fires.

```toml
# .workhorse/workflows/ralph.toml
name    = "ralph"
version = "1"

# ── stages: each runs its steps in order, looping, until an exit fires ──
[[states]]
name  = "planning"
steps = ["prompt-engineer", "planner"]      # loops prompt → planner → prompt …
exits = [{ when = "todos_complete", to = "implementing" }]

[[states]]
name  = "implementing"
steps = ["coder", "memory-weaver"]          # loops coder → memory → coder …
exits = [
  { when = "todos_complete", to = "ready_for_review",
    epilogue = "Summarise the finished implementation against the goals, for verification." },
]

# ── step library: definitions only, referenced by id above ──
[steps.prompt-engineer]
preset = "prompt"

[steps.planner]
preset = "planning"

[steps.coder]
preset       = "coding"
token_budget = 150_000                       # override the preset for THIS workflow

  [[steps.coder.sub_agents]]
  name        = "researcher"
  model       = "claude-haiku-3"
  write_globs = []                           # read-only
  tools       = ["fs_read", "fs_grep", "fs_glob"]

  [[steps.coder.sub_agents]]
  name        = "tester"
  model       = "claude-sonnet-4"
  write_globs = ["**/*.test.ts", "**/*.spec.ts"]
  tools       = ["fs_read", "fs_write", "fs_grep", "todo_list"]

[steps.memory-weaver]
preset = "memory"
model  = "claude-haiku-3"                     # override: lighter model for summarisation
```

Memory-weaver declares no exit on its stage, so the implementing stage falls through it back to the coder (its first step) — the implementation iterates as coder → memory-weaver → coder …, and memory-weaver's epilogue becomes the coder's next prologue. The stage exits only when the coder's work satisfies `todos_complete → ready_for_review`.

**Full override example** — a step can set every field directly instead of using a preset:

```toml
[steps.custom-step]
agent = "claude"
model = "claude-sonnet-4"

prologue = """
You are a custom agent. Do something specific.
"""

epilogue = """
Summarise what you did.
"""

tools = ["fs_read", "fs_write", "git_commit"]
token_budget = 50_000
```

(Where this step runs — and where it can route to — is decided by the stage that lists it, not by the step itself.)

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
  planning stage            implementing stage
 ┌─────────┐  ┌─────────┐   ┌────────┐   ┌─────────┐
 │ prompt  │─▶│ planner │──▶│  code  │──▶│ memory  │
 │         │◀┐│         │   │        │◀┐ │         │
 └─────────┘ │└─────────┘   └────────┘ │ └─────────┘
   ▲         │ todos_complete   ▲       │     │
   │  loop   │ → implementing   │ loop  └─────┘  memory epilogue
   └─────────┘                  │                feeds coder prologue
                                │
                  coder todos_complete → ready_for_review (tail)
```

The planning stage loops `prompt → planner → prompt` until the plan is ready (`todos_complete → implementing`). The implementing stage then loops `code → memory → code`: memory-weaver's epilogue feeds the coder's next prologue. It exits only when the coder fires `todos_complete → ready_for_review`.

#### Reusable Tail — `ready_for_review` & `in_review`

The two stages after `implementing` are the same across most workflow types, so they are documented once here as a reusable pattern. A workflow type inherits them by declaring steps with these statuses (the PR step is injected by the GitHub plugin, not authored in the workflow).

```
implementing ──todos_complete──▶ ready_for_review ──pass──▶ in_review ──forced(done)──▶ done
     ▲                                  │                       │
     │                            checks fail               review wants changes
     └──────── to = implementing ◄───────────────────┘
```

**`ready_for_review` — verification agent.** Runs final checks against the goals.

- **Pass** → `to = "in_review"`. On this exit the **GitHub plugin injects a PR-creation step** (pre-transition, out-of-band — see Plugins).
- **Fail** → honestly reports failures, then `to = "implementing"` (lands on the first step of `implementing`, i.e. coder).

**`in_review` — external review holding state.** On entry it turns on the available monitors and waits for external input to flood in (GitHub checks/comments, Jira change-requests).

- **Changes requested** (`review_settled` resolves with pending change-requests, or a Jira change-request arrives) → `to = "implementing"`.
- **Signed off / clean** → the stage **parks** (no satisfied internal exit). The workflow rests here.
- **`done`** is **forced by an external hook** (sign-off/merge event). The agent never drives it.

```toml
# Reusable tail (inheritable by any workflow type)

[[states]]
name  = "ready_for_review"
steps = ["verifier"]
exits = [
  # checks pass — hand a verification summary to the reviewer
  { when = "todos_complete", to = "in_review",
    epilogue = "Summarise what was verified and the supporting evidence, for external review." },
  # checks failed — hand the failures back to the coder
  { when = 'checks_status != "passed"', to = "implementing",
    epilogue = "List the failing checks and what must change to make them pass." },
]

[[states]]
name  = "in_review"
steps = ["reviewer"]
# change requested (hook/Jira fed) — hand the requested changes back to the coder
exits = [{ when = "open_review_threads > 0", to = "implementing",
  epilogue = "Summarise the requested changes and open threads for the next implementation pass." }]
# signed-off → no matching exit → the stage parks until an external hook forces `done`.

[steps.verifier]
preset = "verify"

[steps.reviewer]
preset = "review-monitor"
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

- It instantiates the runtime `Agent` from the agent definition named by `Step.agent` (e.g., Pi, Claude, Codex)
- Monitors the agent (memory, CPU, disk, network) and emits metrics (surfaced for observability — not a routing input)
- Creates a fresh agent session per step (no shared conversation history)
- Handles sub-agents (spawning, `ask_parent` routing, one-level-deep enforcement)

For services:

- **Intersects providers against the step allowlist.** Providers (the agent definition's capabilities + service contributions) propose the universe; the Step's `tools[]`/`services[]` allowlist narrows it. `services[]` gates which services are active; `tools[]` is the final per-tool filter — a tool must pass **both** (most-restrictive wins). the capability services (`ToolService`/`SkillService`/`ScriptService`) declare/collect; the Harness performs this intersection at run time and provides the result to the agent. **Config only ever gates — it never provides.**
- Enforces **tool output truncation** (configurable per step, default ~2000–3000 chars); tools return full output and the Harness truncates, adding a range hint so the agent can request more
- Gives access to "feed-in" to the agent (e.g. system prompt, notify, tools, skills, scripts, etc.)

For execution safety:

- **Boundary interrupts only.** When the Workflow decides to route (`step_idle`, `token_budget_exceeded`, …) while a tool call is in flight, the Harness lets the in-flight tool call complete, then halts before the next one. The agent is never interrupted mid-tool-call, so writes/commits cannot be left partial.
- **Tool timeouts.** Every tool has a default timeout (`Step.toolTimeout`) with an optional per-tool override. A timed-out tool call returns a timeout result rather than hanging the step.
- **Sub-agent coordination & `ask_parent` safety.** The Harness pauses a sub-agent on `ask_parent`, routes to the parent via `notify()`, and waits. Because `ask_parent` is itself a tool, it is bound by the tool-timeout contract: if the parent goes idle or hits its budget before answering, the paused sub-agent is cancelled at the next boundary and the unanswered question surfaces in the parent's output.

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
> **Output truncation:** Output is always truncated to a configurable maximum (default ~2000–3000 chars); tools accept a range parameter to page through the full output.
>
> **Timeout:** Every tool has a default timeout (`Step.toolTimeout`, ms) with an optional per-tool override. A timed-out call returns a timeout result rather than hanging the step. This contract applies to all tools, including `ask_parent`.

- Git (add, commit, push, pull, etc.)
- Todo (create, edit, delete, list)
- FS (read, write, delete, list, grep, glob, etc.) — **`.workhorse/` is read-only** via FS tools (see Directory Layout)
- Safety (undo, zoom, etc.)
- AST (rename, extract, etc.)

#### Sub-Agents

Steps can define **sub-agent templates** — named profiles with predefined constraints:

- **Config defines max permissions** — `tools`, `write_globs`, `agent`/`model` ceiling.
- **Parent can narrow at spawn time** — Parent can restrict `write_globs` further but can never exceed the config's ceiling.
- **Sub-agents cannot spawn sub-agents** — Always leaf nodes. One level deep only (parent → sub-agents).
- **`ask_parent` tool** — Sub-agent calls `ask_parent(question)`; Harness pauses the sub-agent, routes the question to the parent via `notify()`, waits for the parent's response, and returns it. As a tool it is bound by the tool-timeout contract: if the parent goes idle, hits its token budget, or otherwise fails to answer before the timeout, the paused sub-agent is cancelled at the next tool-call boundary and the unanswered question surfaces in the parent's output (no deadlock).

#### Service

For a lack of a better word, a service works pretty much like an MCP to the **harness**, however it is not tied to it.
You can use it separately from the harness, or even in a different process.

For example, you have an agent service that registers all the agents. What if, for something else in your application, you just want to use the agent for its answering or agentic abilities and you just want to provide certain tools? For that, you don't need the entire product, but you just need the use of a single agent and provide the tools that it needs. You can use a mixture of `AgentService` and `ToolService`, maybe for something like that.

It accesses the external world in a _safe_ way and provides reasonable context to the agent.
It feeds the agent with the tools, notifications, skills, etc. that it needs to run the step perfectly.

Services have a lifecycle (`setup()` / `teardown()`) and communicate over a shared **`hookable` bus** — not a generic registry. In `setup()` a service registers handlers for the hooks it owns (keeping the returned unregister callbacks) and drops them in `teardown()`. The host — the Harness, or a standalone composition — drives the bus: it calls hooks like `scripts:create` or `tools:collect`, and the owning service handles them. Contributions carry metadata/tags so the Step's allowlist controls what's active (**co-owned activation**: service declares, step filters).

Tools, skills, and scripts each have a dedicated service — `ToolService`, `SkillService`, `ScriptService` — and **each owns the _mechanism_ for its kind**. They differ in how they store and retrieve their capability: `ToolService` keeps code-registered tools in memory; `ScriptService` persists scripts under the workhorse directory and reads them back on demand; `SkillService` sources skill fragments (e.g. from `.workhorse/skills`). The capability _definitions_ themselves (`Tool`, `Skill`, `Script`) are global schema types in `src/schema`; the services just move instances of those definitions across the bus. Other services (Git, L1, L2, Agent, AST) and plugins contribute by calling the relevant hooks. Because services couple only to the bus — not the Harness — the same set can be composed standalone (the Moby use case above).

##### Base Services

###### `ToolService`

The service for **tools**. Code and plugins contribute via `tools:register`; it keeps them in memory and returns them via `tools:collect` for the Harness to gate against each step's `tools[]` allowlist.

###### `SkillService`

The service for **skills** — reusable prompt fragments / instruction sets injected into the agent's context. Contributed via `skills:register`, read back via `skills:collect`.

###### `ScriptService`

The service for **scripts** — runnable scripts the agent can execute. It owns its storage: `scripts:create` persists a script under the workhorse directory, `scripts:collect` reads the stored scripts back. Where and how scripts live is the service's concern, hidden behind the hooks.

###### `MCPService`

Provides MCP tools and allows a plugin to register a MCP.

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

Provides L2 context (semantic search via `retriv` — BM25 FTS5 + vector embeddings). Contributes search results to the agent's prompt (as a prompt section). Indexing uses the XDG state directory.

###### `AgentService`

Provides agent spawning capabilities.

**Tools**

- `spawn_subagent`: Spawns a sub-agent (e.g., Pi, Claude, Codex) with limited tools per the step's sub-agent template

###### `ASTService`

Provides AST operations (rename, extract, etc.)

### Agent Event Stream

`Agent.run()` yields an `AsyncIterable<AgentEvent>`. The Harness consumes this stream and maps it onto the workflow's needs:

| Event         | Carries                                         | Harness use                                                        |
| ------------- | ----------------------------------------------- | ------------------------------------------------------------------ |
| `tool_call`   | tool name + args                                | enforce per-tool timeout; mark a tool-call boundary                |
| `tool_result` | output (or error result)                        | truncate output + add range hint; a failed sub-agent surfaces here |
| `message`     | assistant text                                  | forward to hooks / TUI                                             |
| `token_usage` | running token count                             | evaluate `token_budget_exceeded`                                   |
| `idle`        | —                                               | evaluate `step_idle`                                               |
| `done`        | `{ reason: completed \| interrupted \| error }` | terminal — the step's run resolves                                 |
| `error`       | error detail                                    | trigger the failure policy (see below)                             |

**Termination contract.** The iterable **always** terminates with a final `done` event — it never dangles. `interrupt()` (called by the Harness on a boundary transition) lets the in-flight tool call complete, then emits `done{ reason: interrupted }` and closes the iterable. A clean finish emits `done{ reason: completed }`; a fatal failure emits `error` followed by `done{ reason: error }`.

### Error Handling & Recovery

**Failure policy — fail-fast to `blocked` by default.** When a step fails (agent crash via `error`, fatal tool error, or unexpected budget blow), the Workflow retries it up to `Step.retry` times (**default 0** — fail-fast). On exhaustion the workflow sets `status = blocked`, capturing the error. `blocked` is the universal "needs external intervention" park state; it is exited by an external `status_changed`. So `blocked` has three entry paths: agent-set (a tool marks it), retry-exhaustion, and fail-fast.

**Sub-agent errors surface inline.** A failing sub-agent does **not** directly fail the parent step. Its failure returns as an **error `tool_result`** of the spawn/`ask_parent` call, so the parent agent sees it and decides how to proceed — consistent with the `ask_parent` timeout handling.

**Crash recovery — status-granularity resume.** The Workflow persists **only the current `status`** to XDG state. On restart it re-enters that stage at its **first step**. Mid-step work is never resumed (steps are fresh-session anyway); the real work is carried by persisted memory/todos/L1 in XDG state, so re-running the stage from its first step picks up where it left off. Step id is intentionally not checkpointed.

### Configuration Cascade

Settings layer **`global → project → workflow type → preset → step`** — later wins, most-specific wins:

1. **global** — user/machine defaults
2. **project** — `.workhorse/` config (committed)
3. **workflow type** — the `workflow.toml`
4. **preset** — seeds a step's fields
5. **step** — explicit fields override the preset

**Project may patch presets by name.** Project config can retune a preset for the whole repo without editing any workflow TOML:

```toml
# .workhorse/config.toml — "in this repo, the coding step uses Codex"
[presets.coding]
agent = "codex"
```

This applies to every workflow that uses the `coding` preset. Explicit fields on an individual step still override the patched preset (step is most-specific).

### Orchestrator

The Orchestrator owns the full bootstrap lifecycle. It creates **GlobalContext** — shared infrastructure and registries — then creates a **WorkflowContext** per workflow run. There is no shared mutable state between workflows.

**GlobalContext** holds:

- Infrastructure: DB, hooks, config
- Registries: service definitions, adapter classes (definitions only — no instances)

**WorkflowContext** holds per-run instances of services and agents, instantiated from the GlobalContext registries.

**Issue intake** happens at the Orchestrator level, before a Workflow starts. The Orchestrator spawns a lightweight one-off agent (via AgentService) to fetch and structure issue details from any source (Jira MCP, GitHub MCP, etc.). The agent produces a structured JSON Issue object → DB record → worktree/branch creation → Workflow starts. Workflows are self-contained execution units and are not responsible for their own setup.

### Directory Layout & State

**`.workhorse/`** (inside worktree, committed to git) — **read-only to agents via FS tools**:

- Project config
- Custom skills
- Custom workflow type definitions (`.workhorse/workflows/`)

Workflow type definitions are **parsed and validated once at workflow start** and frozen for the run — no mid-run reload. Combined with read-only FS access, this prevents a coding agent from rewriting the workflow that governs it (self-tampering).

**`$XDG_STATE_HOME/workhorse/workflow/<issue-id>/`** (runtime state, tool-access only):

- Todo files
- Memory / step outputs
- Shared across workflow runs for the same issue
- Agents cannot directly read/write this via FS tools; they must use dedicated tools (e.g. `todo_*`, memory tools)

**Agent path scopes:**

- Worktree — direct FS access for code (except `.workhorse/`, which is read-only)
- `.workhorse/` — read-only via FS tools
- XDG state — only through dedicated tools

### Plugins

Plugins are **completely decoupled from harness internals**. They interact only via hooks and contribute tools/skills/prompts through the capability services (`ToolService`/`SkillService`/`ScriptService`) at plugin setup time (globally — not per-step). Step config controls which contributions are active for each step.

Plugins can also **inject pre-transition steps** — steps that run synchronously before the workflow's own steps when a status transition occurs.

#### Philosophical Difference Between Plugins and Services

- **Services** are the core capability providers — they own how tools, skills, scripts, and prompt sections reach the agent. They are **not bound to the Harness** (a service can be used standalone, even in another process — see Service), but within a workflow the Harness collects their contributions and filters them through step config.
- **Plugins** are entirely external. They contribute tools, skills, and prompt sections through the same capability services, but the core cannot depend on them. They extend what agents can do without touching how agents run.
