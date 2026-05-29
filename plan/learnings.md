# Rearchitecture Learnings

Decisions and open questions from the design interview session.

## Decisions Made

### Migration Strategy

- **Parallel package (core-v2)**: Build the new architecture in a new `packages/core-v2/` from scratch. Migrate plugins one at a time, eventually replace `packages/core`.

### Bootstrap & Context

- **Orchestrator-owned bootstrap**: The Orchestrator owns the full lifecycle. It creates GlobalContext (config, db, hooks, registered service definitions, adapter classes), and each Workflow gets a WorkflowContext from it.
- **Registries global, instances per-workflow**: GlobalContext holds infrastructure (DB, hooks, config) + registries (service definitions, adapter classes). WorkflowContext instantiates services and agents from those registries per workflow run. No shared mutable state between workflows.

### Workflow

- **Status-driven step selection**: Status is the primary driver of which steps run. The Workflow watches deterministic conditions (e.g., "all todos complete") to advance status, and status changes drive step selection.
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

## Open Questions for Next Session

### TUI Integration

- How does the TUI observe the new Workflow → Step → Harness hierarchy?
- Does the TUI need new renderers for step transitions, sub-agent trees, workflow loop iterations?
- How does the TUI display the status-driven step selection in real time?

### Steering Rules

- Do steering rules survive in core-v2, or are they replaced by the workflow transition system?
- If they survive, do they live at the Workflow level or the Harness level?
- How do steering rules interact with plugin-injected steps?

### Error Handling & Recovery

- What happens when a step fails (agent crashes, tool error, token budget exceeded unexpectedly)?
- Does the Workflow retry the step, skip it, or halt?
- How does error state propagate from sub-agents to the parent?
- Can a workflow resume from a specific step after a crash (checkpoint/restore)?

### Multi-Workflow Coordination

- Can multiple workflows share the same worktree (e.g., two issues in the same repo)?
- How does the Orchestrator handle resource contention (same repo, different branches)?
- Is there a workflow queue or priority system?

### Configuration Cascade

- How does the TOML config cascade work in core-v2? (global → project → workflow type → step?)
- Can step presets be overridden in project config? (e.g., "in this repo, the coding step uses Codex instead of Claude")

### Agent Event Stream

- What events does `AsyncIterable<AgentEvent>` yield? (tool_call, message, token_usage, idle, done, error?)
- How does the Harness map these events to external hooks?
- What's the contract for when the iterable completes vs when `interrupt()` is called?

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
