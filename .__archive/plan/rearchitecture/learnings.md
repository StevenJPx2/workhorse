# Rearchitecture Learnings

Decisions and open questions from the design interview session.

## Decisions Made

### Migration Strategy

- **Parallel package (core-v2)**: Build the new architecture in a new `packages/core-v2/` from scratch. Migrate plugins one at a time, eventually replace `packages/core`.

### Bootstrap & Context

- **Orchestrator-owned bootstrap**: The Orchestrator owns the full lifecycle. It creates GlobalContext (config, db, hooks, registered service definitions, adapter classes), and each Workflow gets a WorkflowContext from it.
- **Registries global, instances per-workflow**: GlobalContext holds infrastructure (DB, hooks, config) + registries (service definitions, adapter classes). WorkflowContext instantiates services and agents from those registries per workflow run. No shared mutable state between workflows.

### Workflow

- **Status-block step selection**: Status is a _block_, not a selector (see Resolved Loopholes #5). Steps sharing a status run in declaration order and loop back to the block's first step until an exit condition fires; then status advances to the next block. The Workflow watches deterministic conditions (e.g., "all todos complete") to drive block exits.
- **Declarative config objects (pure data — TOML/JSON)**: Workflow types are defined as pure data files, not TypeScript. Transition conditions are named built-in conditions, not arbitrary functions.
- **Built-in conditions + composites**: Ship a set of named conditions (`todos_complete`, `token_budget_exceeded`, `step_idle`, `status_changed`, etc.) with AND/OR combinators. Add a generic `state_check` condition for custom scenarios.
- **Fully pluggable workflow types from day one**: Design the system so custom workflow types can be loaded from `.workhorse/workflows/`. Ralph ships as built-in.
- **External state inspection for transitions**: The Workflow checks external state (todo files on disk, git status, token count) to decide transitions. Runs on a poll/hook basis while the step's agent is working. Agent doesn't need to know about transitions.

### Step

- **Fresh agent session per step**: Each Step creates a new agent session via the Harness. Context flows through prologue (system prompt) and epilogue (final prompt whose response feeds the next step's prologue). No conversation history shared between steps.
- **Prologue = system prompt, Epilogue = final prompt to agent**: The epilogue asks the current agent to summarize/produce context. The agent's response becomes input for the next step's prologue. Both are prompt strings, not structured data.
- **Step defines everything except execution**: Prologue, epilogue, tool filters, service activation, agent/model preferences, sub-agent templates, transition conditions — all in the Step config.

### Harness

- **Single generic Harness**: One universal Harness that executes any step. All differentiation happens at the Step level. The Harness is the execution engine ("how to run"), the Step is the configuration ("what to run").
- **Named harness types from the original plan become Step presets**: `prompt`, `planning`, `coding`, `memory`, `compaction` are preconfigured step configs, not separate harness implementations.
- **Handoff step dropped**: The original handoff concept (agent interviewing previous agent) is replaced by the prologue/epilogue mechanism. PR creation is handled by plugin-injected steps (see below).

### Agent Adapter

- **Minimal interface**: `run(prompt, tools, options): AsyncIterable<AgentEvent>`, `notify(message: string): void`, `interrupt(): void`.
- `run()` takes a prompt and tools, yields events (tool_call, message, done), and can be interrupted.
- `notify()` pushes messages (notifications, user messages) into the running session via stream injection. Required on all adapters with a no-op default.
- `interrupt()` stops the agent.
- Worktree creation is NOT the adapter's responsibility (Orchestrator handles it).

### Sub-Agents

- **Step config defines sub-agent templates**: Named profiles with predefined constraints (tools, write_globs, agent/model).
- **Config defines max permissions, parent can narrow at spawn time**: Parent agent can restrict write_globs further but never exceed the config's ceiling.
- **Sub-agents CANNOT spawn their own sub-agents**: Always leaf nodes. One level deep only (parent → sub-agents).
- **Synchronous `ask_parent` tool**: Sub-agent calls `ask_parent(question)`, Harness pauses the sub-agent, routes question to parent via `notify()`, waits for parent's response, returns it.

### Services

- **Lifecycle + contribution interface**: Services have `setup()`, `teardown()`, and contribute tools, skills, notifications, and prompt sections to the agent.
- **Co-owned activation**: Services declare all their contributions with metadata/tags. Step definitions specify which contributions are allowed (allow/deny patterns). The Harness intersects them.
- **BasicService is the gateway**: Exposes hooks (`tools.add`, `skills.add`, `scripts.add`, `prompt.add`) that plugins and other services use to contribute things to the agent. BasicService collects, filters per-step, and provides to the agent.

### Plugins

- **Completely decoupled from harness internals**: Plugins interact ONLY via hooks. They contribute tools/skills/prompts through BasicService hooks (`tools.add`, etc.) at plugin setup time (globally).
- **Can inject steps at status transitions**: Plugins register pre-transition steps that run synchronously before the workflow's own steps for that status. Example: GitHub plugin injects a PR-creation step when transitioning to `in_review`.

### Tool Output

- **Harness-enforced truncation, configurable per-step**: Default limit configurable (suggested 2000-3000 chars). Tools return full output; Harness truncates and adds range hint. Applies to all tools.

### Directory & State

- **`<worktree>/.workhorse/`**: Project config, skills — committed to git.
- **`$XDG_STATE_HOME/workhorse/workflow/<issue-id>/`**: Runtime state (todos, memory, step outputs). Shared across workflow runs. Only accessible via tools (agents cannot directly read/write via FS tools).
- **Agent path scopes**: Worktree for code (direct FS access), XDG state only through dedicated tools.

### Issue Intake

- **Orchestrator-level, before workflow**: No parser system. Orchestrator spawns a lightweight one-off agent (via AgentService) to fetch/structure issue details from any source (Jira MCP, GitHub MCP, etc.). Agent produces structured JSON → Issue object → DB record → worktree/branch creation → Workflow starts. Workflow is a self-contained execution unit, not responsible for its own setup.

### Memory

- **Memory Weaver does NOT reset code**: No git reset. It only captures learnings/patterns/feedback into memory. The next iteration continues where the Coder left off with all code changes intact.
- **L1 compaction step**: Summarizes older L1 session entries into condensed summaries. Runs periodically to prevent context.md bloat.

### Database

- **Minimal expansion**: Keep issues, notifications, events in SQLite. Add a `workflow_runs` table for cross-workflow queries (`issue_id`, `workflow_type`, `status`, `started_at`, `completed_at`). All other runtime state lives in XDG state as files.

---

## Items to Update in `plan/rearchitecture.md`

### Additions

- [ ] Orchestrator bootstrap lifecycle and GlobalContext shape (infrastructure + registries)
- [ ] WorkflowContext instantiation model (instances from registries)
- [ ] Pure data (TOML/JSON) workflow type definition format with examples
- [ ] Built-in transition conditions catalog (`todos_complete`, `token_budget_exceeded`, `step_idle`, `status_changed`, `always`, `state_check`, AND/OR composites)
- [ ] Prologue/epilogue flow: prologue = system prompt, epilogue = final prompt → agent response → next prologue
- [ ] Single generic Harness concept (replaces multiple harness types)
- [ ] Step presets (prompt, planning, coding, memory, compaction) as preconfigured step configs
- [ ] New AgentAdapter interface: `run()`, `notify()`, `interrupt()` with AsyncIterable<AgentEvent>
- [ ] Sub-agent templates in step config with write_glob scoping and ask_parent/respond_to_child tools
- [ ] One-level-deep sub-agent constraint (no nested spawning)
- [ ] Plugin-injected pre-transition steps mechanism
- [ ] Issue intake flow via Orchestrator-spawned agent (replaces parser system)
- [ ] XDG state directory for runtime state (tool-access only)
- [ ] Harness-enforced tool output truncation with configurable limits
- [ ] `workflow_runs` DB table schema

### Updates

- [ ] Harness diagram: change from multiple harness types to single generic harness + step configs
- [ ] Agent struct: update interface to `run()`, `notify()`, `interrupt()` (remove `sendMessage`, `selectModel`)
- [ ] Services section: add BasicService as the gateway pattern with hook-based contributions
- [ ] Services section: add co-owned activation model (service declares, step filters)
- [ ] Workflow diagram: add plugin-injected pre-transition steps
- [ ] Ralph Loop example: clarify Memory Weaver does NOT reset code
- [ ] Step struct: add sub-agent templates, remove `whenIdle()` (now a workflow-level concern)
- [ ] Plugin section: clarify plugins are fully decoupled, contribute only via BasicService hooks
- [ ] Directory layout: split `.workhorse/` (committed) from XDG state (runtime, tool-access only)

### Deletions

- [ ] Remove `handoff` harness type
- [ ] Remove parser/tracker concept (replaced by orchestrator-level intake agent)
- [ ] Remove `whenIdle()` from Step (moved to Workflow transition logic)
- [ ] Remove registry concept from plugins (replaced by BasicService hooks)

---

## Resolved Loopholes (adversarial pass)

Decisions from the loophole review. All are now reflected in `rearchitecture.md`.

1. **Duplicate `Agent` struct → two planes.** The runtime `Agent` (bones: `run`/`notify`/`interrupt`) stays named `Agent`. The static struct becomes `AgentDefinition`, an authored **config-plane** entry that is a _provider_ of capabilities (tools/skills/scripts/models) for a backend. No "Adapter" jargon. A new "Config Plane vs Runtime Plane" section documents this.
2. **Filtering double-ownership.** `BasicService` **declares/collects** contributions (tagged with metadata). The **Harness intersects** providers against the step allowlist at run time. Single owner for the live narrowing context.
3. **Concurrent transition precedence.** Dissolved by the block model — `next` (intra-block jump) and `next_status` (block exit) operate at different scopes and never compete for a winner.
4. **Unreachable `done`.** Terminal: a `next_status` to a status with no step block ends `Workflow.run()` and sets the tag as a side-effect. There is no "done step."
5. **Status→step ambiguity → status blocks.** Status is a **block**, not a selector. Steps sharing a status run in declaration order and loop back to the block's first step until an exit condition fires; then the status advances and execution enters the next block's first step.
6. **Orphaned `blocked`.** Entered via an agent-set condition (a tool marks blocked); exited via external `status_changed`. It is a normal block (may hold or poll).
7. **Mid-tool interrupt safety.** The Harness interrupts only at **tool-call boundaries** — in-flight tool call completes, then it halts before the next. No partial writes/commits.
8. _(merged into 7)_
9. **`ask_parent` deadlock.** All tools have a **default timeout + per-tool override**; `ask_parent` is bound by it. If the parent goes idle/over-budget before answering, the paused sub-agent is cancelled at the next boundary and the unanswered question surfaces in the parent's output.
10. **Epilogue chain vs injected steps.** Plugin pre-transition steps are **out-of-band** — the prologue→epilogue handoff flows around them; their side-effects (PR, notify) don't enter the chain.
11. **`state_check` escape hatch.** Constrained to **declarative predicates over known state keys** (`file_exists`, `git_clean`, `git_ahead`, `todo_count`, `token_used`, `iteration_count`, `status`) with a fixed operator set (`eq`/`ne`/`gt`/`gte`/`lt`/`lte`/`exists`/`matches`). No arbitrary code.
12. **`.workhorse/` writability.** **Read-only** to agents via FS tools.
13. **Workflow-TOML tampering.** Definitions are **parsed/validated once at workflow start** and frozen for the run — no mid-run reload.
14. **tool vs service allowlist precedence.** `services[]` gates which services are active; `tools[]` is the final per-tool filter. A tool must pass **both** — most-restrictive wins.
15. **Monitoring with no actions.** Wired to a **`resource_exceeded`** built-in transition condition (configurable thresholds, per-step override).

Supporting additions: `Step` gained `tokenBudget` and `toolTimeout`. The "Config gates; it never provides" principle is the unifying rule behind #1, #2, and #14.

---

## Resolved (session 2 — blocking design questions)

Now reflected in `rearchitecture.md`.

### Agent Event Stream

- **Event set**: `tool_call`, `tool_result`, `message`, `token_usage`, `idle`, `done`, `error`. `token_usage` feeds `token_budget_exceeded`; `idle` feeds `step_idle`; `tool_call`/`tool_result` let the Harness enforce timeout + truncation; a failed sub-agent surfaces as an error `tool_result`.
- **Termination contract**: the iterable **always** ends with a `done` event carrying `reason: completed | interrupted | error` — never dangles. `interrupt()` finishes the in-flight tool call, emits `done{ interrupted }`, closes the iterable.

### Error Handling & Recovery

- **Fail-fast to `blocked`**: `Step.retry` defaults to **0**. On failure (agent `error`, fatal tool error, unexpected budget blow) the step retries `retry` times, then sets `status = blocked` with the error captured. `blocked` now has three entry paths: agent-set, retry-exhaustion, fail-fast. Exited by external `status_changed`.
- **Sub-agent errors surface inline**: a failing sub-agent returns an error `tool_result` to the parent (does not directly fail the parent step) — consistent with `ask_parent` timeout handling.
- **Status-granularity resume**: the Workflow persists **only the current `status`** to XDG state. On restart it re-enters that block at its first step. Step id is not checkpointed; persisted memory/todos/L1 carry the real work.

### Configuration Cascade

- **Order**: `global → project → workflow type → preset → step` (later wins, most-specific wins).
- **Project may patch presets by name**: e.g. `[presets.coding] agent = "codex"` in `.workhorse/config.toml` retunes the preset repo-wide; explicit step fields still override.

---

## Open Questions for Next Session

### TUI Integration

- How does the TUI observe the new Workflow → Step → Harness hierarchy?
- Does the TUI need new renderers for step transitions, sub-agent trees, workflow loop iterations?
- How does the TUI display the status-block model (loop iterations within a block, block transitions) in real time?

### Steering Rules

- Do steering rules survive in core-v2, or are they replaced by the workflow transition system?
- If they survive, do they live at the Workflow level or the Harness level?
- How do steering rules interact with plugin-injected steps?

### Multi-Workflow Coordination

- Can multiple workflows share the same worktree (e.g., two issues in the same repo)?
- How does the Orchestrator handle resource contention (same repo, different branches)?
- Is there a workflow queue or priority system?

### L2 Memory in core-v2

- Does the L2 store (semantic search via retriv) survive as-is?
- Does it become a service (L2Service) that contributes to the prompt via BasicService hooks?
- How does L2 indexing work with the new XDG state directory?

### Testing Strategy for core-v2

- What's the testing approach for the parallel package?
- Can existing test helpers/factories be reused?
- How do you test workflow type configs (declarative TOML) without running agents?
- How do you test plugin-injected steps in isolation?

### Plugin Migration Path

- In what order do plugins migrate to core-v2? (pi-adapter first since it's the adapter, then jira/github?)
- What's the minimum plugin API surface in core-v2 for the first plugin to work?
- Do plugins need to support both core and core-v2 during migration?

### Compaction Trigger

- What triggers the compaction step? (every N iterations? when context.md exceeds N bytes? on-demand?)
- Is compaction a step within the workflow loop, or a background maintenance task?
- Can the workflow type config specify compaction frequency?
