# Core Rearchitecture

> **Config model.** A workflow is a top-level `initial` status plus a
> `[states.<status>]` table — each a status with an ordered `steps` list and
> ordered `[[states.<status>.exits]]` — and routing is each exit's
> `{ when = "<expr>", to = "<status>" }` using the safe `when`
> expression grammar (first match wins). Config is authored and validated in idiomatic
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

  # receives the workflow-collected service tools/skills, then intersects
  #   (agent definition + those) against the step's tools[]/services[] allowlist,
  #   most-restrictive wins, and provides the result to the agent
  #   (the Workflow sets services up once per run; the Harness only filters)
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

A workflow is a collection of stages that are executed and can loop back until the workflow is complete / solved.
This is isolated in its own directory and is not allowed to step out of it. All the tools are made to work within this directory and `$XDG_STATE_HOME/workhorse/workflow/<issue-id>/`.

**A stage IS its agent configuration plus its exits — there is no separate "step".** A **stage** (`[states.<status>]`) is one status carrying the agent config that runs there (prologue, epilogue, tools, services, token_budget, optional `preset`) and a set of `exits`. Running a stage runs that one agent. There is no intra-stage ordered step list: multiple agents that used to "loop within a status" are now expressed as **separate stages with exit edges between them** (e.g. `work` ↔ `memory_weaver`).

**Only stages route, via `exits` — and exits express all looping.** A stage's `exits` are rules `{ when = "<expr>", to = "<status>", epilogue? = "<prompt>" }`, evaluated in order — **first match wins**. When an exit's `when` holds, control switches to the `to` status, and the exit's optional `epilogue` (if set) is the handoff for that transition (see below). `to` resolves to a known status; it **may point back to the same stage** to loop it, or to an earlier stage for a backward edge. A stage with no satisfied exit parks (see park states).

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

A stage runs the Harness with its prologue (system prompt). While the agent works, the Workflow evaluates the stage's `exits` against the deterministic run state after each tool-call boundary. When a real (non-fallback) exit's `when` becomes satisfied, the Harness lets the in-flight tool call finish, then — in the finishing agent's **live session** (only it still holds the working context) — sends that exit's `epilogue` as one more prompt. **The agent's response to the epilogue becomes the handoff carried into the next stage** (composed ahead of any shared context the next stage reads). The fallback edge (`builtin::paused`) and a stage that finishes on its own are resolved at the agent's natural `done`. Each stage creates a fresh agent session — no raw conversation history is shared across stages; the epilogue response is the deliberate bridge.

**The handoff (epilogue) is edge-scoped.** It lives on the `ExitRule`, so it varies by **destination and reason**: because an exit's `when` _is_ the reason for leaving, the epilogue naturally reflects it — `token_budget_exceeded` can ask the agent to checkpoint partial progress, while `todos_complete` can ask it to summarise the finished work for the next stage.

Each stage limits the tools, skills, and scripts available based on its own allowlist configuration, not the current status alone.

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

- **Built-in names** (fixed, core-owned): `todos_complete`, `token_budget_exceeded`, `step_idle`, `status_changed`, `review_settled`, `paused`. A bad name is caught the moment the workflow loads. `paused` is the unconditional fallback edge — it holds when no real guard fired, so a stage never dead-stops.
- **State keys** are runtime-extensible: core ships `file_exists`, `git_clean`, `git_ahead`, `todo_count`, `token_used`, `iteration_count`, `status`, and plugins surface more (e.g. `checks_status`, `open_review_threads` for the review tail).
- **Composites** are written inline with `and` / `or` / `not` — there is no separate composite table.

`review_settled` is **hook-extensible**: plugins (GitHub checks/comments) and Jira (change-requests / sign-off) feed it. It holds only when every external input is resolved with no pending items.

> **Resources.** Resource usage (memory/CPU/disk/network) is **monitored** by the Harness and surfaced as metrics — it is not a routing input. If a workflow needs to react to usage, expose a monitored value as a state key and compare it in a `when` rule.

**Load-time validation (workflow types are frozen at start — see Directory Layout).** At parse time the loader enforces:

- `initial` names a declared stage;
- every stage `name` is a known status;
- every exit `to` resolves to a known status (or terminal `done`) — a `to` back to the owning stage is allowed (an explicit self-loop);
- every `when` parses, and every built-in name, state key, and operator in it is known;
- an exit's optional `epilogue`, if present, is a non-empty string;
- **park-stage check** — a stage with no satisfiable exit is allowed only if it has an external route (`status_changed`, or `done` forced by an external hook). A stage with neither is flagged (it can never advance).

A workflow that fails validation is rejected before it runs.

#### `workflow.toml` Example

A workflow type is a plain TOML file placed in `.workhorse/workflows/<name>.toml` (or shipped as a built-in). It is a map of **stages** (`[states.<status>]`, keyed by status name) — each carrying its own agent config and `exits` — plus a top-level `initial` naming the entry stage (the `states` table is keyed by name, so there is no implicit "first" stage). A stage's exits are written as ordered `[[states.<status>.exits]]` blocks — exit order is significant (first match wins).

When a stage sets `preset`, all fields (agent, model, prologue, epilogue, tools, token_budget, etc.) are inherited from that preset; any field on the stage is an override. Looping is expressed entirely through exit edges — a stage can route back to itself or to an earlier stage; two agents that alternate (e.g. coder ↔ memory-weaver) are two stages with exits between them.

```toml
# .workhorse/workflows/ralph.toml
name    = "ralph"
version = "1"
initial = "planning"                        # the entry stage (states is keyed by name)

# Each stage IS its agent config + exits. Looping is expressed by exit edges
# (a stage can route back to itself or an earlier stage); two alternating agents
# are two stages with exits between them.

[states.planning]
preset = "planning"                          # inherit shared agent config
[[states.planning.exits]]
when = "todos_complete"
to   = "implementing"

[states.implementing]
preset       = "coding"
token_budget = 150_000                       # override the preset for THIS workflow
[[states.implementing.exits]]
when     = "todos_complete"
to       = "ready_for_review"
epilogue = "Summarise the finished implementation against the goals, for verification."
[[states.implementing.exits]]
when = "builtin::paused"                      # not done yet → record learnings, then retry
to   = "memory_weaver"

  [[states.implementing.sub_agents]]
  name        = "researcher"
  model       = "claude-haiku-3"
  write_globs = []                           # read-only
  tools       = ["fs_read", "fs_grep", "fs_glob"]

[states.memory_weaver]
preset = "memory"
model  = "claude-haiku-3"                     # override: lighter model for summarisation
[[states.memory_weaver.exits]]
when     = "builtin::paused"
to       = "implementing"
epilogue = "Here is what was learned so far; continue with the next task."
```

The `implementing` stage loops via exits: while work remains, `builtin::paused` routes to `memory_weaver`, which records learnings and routes back. The implementation iterates as `implementing → memory_weaver → implementing …`, and each transition's epilogue response feeds the next stage. It leaves the loop only when `todos_complete → ready_for_review` fires first.

**Full override example** — a stage can set every field directly instead of using a preset:

```toml
[states.custom]
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

The two stages after `implementing` are the same across most workflow types, so they are documented once here as a reusable pattern. A workflow type inherits them by declaring stages with these statuses (the PR step is injected by the GitHub plugin, not authored in the workflow).

```
implementing ──todos_complete──▶ ready_for_review ──pass──▶ in_review ──forced(done)──▶ done
     ▲                                  │                       │
     │                            checks fail               review wants changes
     └──────── to = implementing ◄───────────────────┘
```

**`ready_for_review` — verification agent.** Runs final checks against the goals.

- **Pass** → `to = "in_review"`. On this exit the **GitHub plugin injects a PR-creation step** (pre-transition, out-of-band — see Plugins).
- **Fail** → honestly reports failures, then `to = "implementing"` (re-enters the `implementing` stage).

**`in_review` — external review holding state.** On entry it turns on the available monitors and waits for external input to flood in (GitHub checks/comments, Jira change-requests).

- **Changes requested** (`review_settled` resolves with pending change-requests, or a Jira change-request arrives) → `to = "implementing"`.
- **Signed off / clean** → the stage **parks** (no satisfied internal exit). The workflow rests here.
- **`done`** is **forced by an external hook** (sign-off/merge event). The agent never drives it.

```toml
# Reusable tail (inheritable by any workflow type)

[states.ready_for_review]
preset = "verify"
# checks pass — hand a verification summary to the reviewer
[[states.ready_for_review.exits]]
when     = "todos_complete"
to       = "in_review"
epilogue = "Summarise what was verified and the supporting evidence, for external review."
# checks failed — hand the failures back to the coder
[[states.ready_for_review.exits]]
when     = 'checks_status != "passed"'
to       = "implementing"
epilogue = "List the failing checks and what must change to make them pass."

[states.in_review]
preset = "review-monitor"
# change requested (hook/Jira fed) — hand the requested changes back to the coder
[[states.in_review.exits]]
when     = "open_review_threads > 0"
to       = "implementing"
epilogue = "Summarise the requested changes and open threads for the next implementation pass."
# signed-off → no matching exit → the stage parks until an external hook forces `done`.
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

- **Receives the workflow-collected capabilities.** The Workflow sets up all services once per run (owning their `setup()`/`teardown()` lifecycle) and collects the tools/skills they contribute over the hook bus; it hands that set to the Harness for each step. The Harness does not set up or tear down services itself. A step's `services[]` allowlist then filters which of the set-up services are active for that step.
- **Intersects providers against the step allowlist.** Providers (the agent definition's capabilities + the workflow-collected service contributions) propose the universe; the Step's `tools[]`/`services[]` allowlist narrows it. `services[]` gates which services are active; `tools[]` is the final per-tool filter — a tool must pass **both** (most-restrictive wins). the capability services (`ToolService`/`SkillService`/`ScriptService`) declare/collect; the Harness performs this intersection at run time and provides the result to the agent. **Config only ever gates — it never provides.**
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

> **Status (built).** `runtime::spawn_subagent_tool(model, templates, leaf_tools, ctx, config)`
> contributes a `spawn_subagent` tool. `StageConfig` (via `StepConfig`) carries
> `sub_agents: Vec<SubAgentTemplate>` (`name`, optional `model`, `tools` ceiling, `write_globs`
> ceiling). On call it looks up the named template, validates the requested narrowing ⊆ ceiling via
> `resolve_permissions` (a tool/glob outside the ceiling is rejected as escalation), and builds a
> fresh leaf `Harness` with only the granted tools plus an `ask_parent` tool. **One level deep** is
> enforced structurally: the leaf's toolset is built from `leaf_tools`, which never contains
> `spawn_subagent`.
>
> **`ask_parent`** is realized as a concurrent leaf + select loop: the leaf future and an ask-channel
> are driven in one `tokio::select!` (no `tokio::spawn`, so it works under both tokio and the demo's
> `pollster`). When the leaf calls `ask_parent(question)`, the loop runs one parent-model turn to
> answer it (seeded with the delegated task) and replies; if the parent side is dropped (gave up /
> over budget) the leaf's `ask_parent` returns an error result and the leaf continues — no deadlock.
> Write-glob FS enforcement is still deferred (needs FS-tool path gating).

#### Service

For a lack of a better word, a service works pretty much like an MCP to the **harness**, however it is not tied to it.
You can use it separately from the harness, or even in a different process.

For example, you have an agent service that registers all the agents. What if, for something else in your application, you just want to use the agent for its answering or agentic abilities and you just want to provide certain tools? For that, you don't need the entire product, but you just need the use of a single agent and provide the tools that it needs. You can use a mixture of `AgentService` and `ToolService`, maybe for something like that.

It accesses the external world in a _safe_ way and provides reasonable context to the agent.
It feeds the agent with the tools, notifications, skills, etc. that it needs to run the step perfectly.

Services have a lifecycle (`setup()` / `teardown()`) and communicate over a shared **`hookable` bus** — not a generic registry. In `setup()` a service registers handlers for the hooks it owns (keeping the returned unregister callbacks) and drops them in `teardown()`. The host — the Workflow within a product run, or a standalone composition — **sets up the services it needs** and drives the bus: it calls hooks like `scripts:create` or `tools:collect`, and the owning service handles them. (Within a workflow the Workflow sets services up once and hands the collected tools/skills to the Harness, which filters per step.) Contributions carry metadata/tags so the Step's allowlist controls what's active (**co-owned activation**: service declares, step filters).

Tools, skills, and scripts each have a dedicated service — `ToolService`, `SkillService`, `ScriptService` — and **each owns the _mechanism_ for its kind**. They differ in how they store and retrieve their capability: `ToolService` keeps code-registered tools in memory; `ScriptService` persists scripts under the workhorse directory and reads them back on demand; `SkillService` sources skill fragments (e.g. from `.workhorse/skills`). The capability _definitions_ themselves (`Tool`, `Skill`, `Script`) are global schema types in `src/schema`; the services just move instances of those definitions across the bus. Other services (Git, L1, L2, Agent, AST) and plugins contribute by calling the relevant hooks. Because services couple only to the bus — not the Harness — the same set can be composed standalone.

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

**Crash recovery — status-granularity resume.** Because `WorkflowRun` is the sans-IO state object (fully serializable), the orchestrator persists the **whole run** (current status + routing state + token total + phase) as JSON to `$XDG_STATE_HOME/workhorse/workflow/<issue-id>/run.json` after **each stage boundary** (`runtime::RunStore`, wired via `DriveOptions::with_persist`). On restart it rebuilds the `WorkflowProgram` from the frozen workflow TOML and `RunStore::load()`s the run to resume exactly where it left off. Mid-stage work is never resumed (stages are fresh-session anyway), so a crash loses at most the in-flight stage, which re-runs cleanly.

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

> **Status (preset→stage layer built).** `WorkflowConfig` carries `presets: HashMap<String,
> StepConfig>` (`[presets.<name>]`). A stage with `preset = "<name>"` is resolved at `compile_stage`
> time via `pipeline::merge_step(preset, stage_step)`: the stage's set scalar fields win and unset
> ones inherit the preset; `Vec` fields (tools/services/sub_agents) take the stage's when non-empty,
> else inherit the preset. The `WorkflowProgram` stores the fully-merged config, so the orchestrator
> sees resolved stages. The remaining cascade layers (global, project `.workhorse/config.toml` preset
> patches) belong with config-file discovery in the bootstrap slice.

### Orchestrator

The Orchestrator owns the full bootstrap lifecycle. It creates **GlobalContext** — shared infrastructure and registries — then creates a **WorkflowContext** per workflow run. There is no shared mutable state between workflows.

**GlobalContext** holds:

- Infrastructure: DB, hooks, config
- Registries: service definitions, adapter classes (definitions only — no instances)

**WorkflowContext** holds per-run instances of services and agents, instantiated from the GlobalContext registries.

**Issue intake** happens at the Orchestrator level, before a Workflow starts. The Orchestrator spawns a lightweight one-off agent (via AgentService) to fetch and structure issue details from any source (Jira MCP, GitHub MCP, etc.). The agent produces a structured JSON Issue object → DB record → worktree/branch creation → Workflow starts. Workflows are self-contained execution units and are not responsible for their own setup.

> **Status (facade load path built).** The `wh` crate is the facade: `wh::prepare_workflow(cwd, home,
> name)` discovers `<cwd>/.workhorse/workflows/<name>.toml` (falling back to `<home>`), layers the
> global (`<home>/.workhorse/config.toml`) and project (`<cwd>/.workhorse/config.toml`) `[presets.*]`
> patches into the workflow (global → project → workflow, later wins), and compiles to a runnable
> `WorkflowProgram` — completing the config cascade. The caller supplies the model + service toolset
> and drives with `runtime::run_with_limit`. The rest of the bootstrap (GlobalContext/WorkflowContext,
> DB, hooks bus, issue intake, worktree creation) is deferred to the integrations that own it.

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
