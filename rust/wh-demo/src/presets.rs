//! Bundled, ready-to-run workflow presets for the demo's Orchestrator panel and
//! the `--orchestrate` headless runner — so a user need not hand-write TOML.
//!
//! These are demo fixtures, not orchestrator engine: the `runtime` crate drives
//! any `WorkflowProgram` (see `runtime::run_to_completion`); the concrete sample
//! workflows that ship with the smoke-test app live here.

use std::collections::HashMap;

use serde_json::Value;

/// A tiny, tool-free two-stage workflow a real model can complete end to end:
/// `draft` (write a haiku) routes on `count >= 1` → `done`. The default for the
/// demo's Orchestrator panel and the `--orchestrate` headless runner.
pub const SIMPLE_TASK_CONFIG: &str = r#"name = "tiny-task"
version = "1"
initial = "draft"

[states.draft]
tools = ["increment_counter"]
prologue = "You are a concise writer. Write a short haiku about the sea, then call increment_counter to record that the draft is done."
epilogue = "Write the haiku, then call increment_counter once."
[[states.draft.exits]]
when = "count >= 1"
to = "done"
epilogue = "The draft is recorded."

[states.done]
"#;

/// The base task handed to every stage of [`SIMPLE_TASK_CONFIG`].
pub const SIMPLE_TASK_PROMPT: &str = "Write a short haiku about the sea.";

/// A Ralph-style autonomous loop modelling "one to-do per stage visit". `count`
/// is the number of to-dos completed, written ONLY by the deterministic
/// `increment_counter` tool. A to-do may take many tool calls; the stage advances
/// the moment THIS visit completes one — expressed as `count != count@entry`
/// (count changed since the stage started), the per-unit completion signal. The
/// `work` exits fire in order: `count >= 3` routes to `done` (all to-dos
/// finished, the absolute terminal check); else `count != count@entry` routes to
/// `memory_weaver` (this visit completed one to-do); else `builtin::paused`
/// routes to `memory_weaver` (nothing changed; never dead-stop). So the loop
/// genuinely iterates one increment per visit (`work` to `memory_weaver` to
/// `work` ... to `done`) rather than racing to the threshold in a single turn.
///
/// `<key>@entry` is the value `count` had when the stage started (snapshotted by
/// the governor); it works for any state type via `==`/`!=`. Per-step tool scoping:
/// only `work` holds `increment_counter`; `memory_weaver` is an observer with
/// only the context tools, so it cannot advance `count`.
pub const RALPH_LOOP_CONFIG: &str = r#"name = "ralph-loop"
version = "1"
initial = "work"

[states.work]
tools = ["increment_counter", "read_context", "write_context"]
prologue = "You are an autonomous worker. Complete ONE to-do this turn: do the work (any tools you need), then call increment_counter exactly once to mark that to-do complete. Do not complete more than one."
epilogue = "Complete one to-do, then call increment_counter exactly once to mark it done."
[[states.work.exits]]
when = "count >= 3"
to = "done"
epilogue = "All to-dos are complete."
[[states.work.exits]]
when = "count != count@entry"
to = "memory_weaver"
epilogue = "One to-do done this round. Record what you learned, then continue."
[[states.work.exits]]
when = "builtin::paused"
to = "memory_weaver"
epilogue = "No progress this round. Record what you learned, then try again."

[states.memory_weaver]
tools = ["read_context", "write_context"]
prologue = "You are the memory weaver: an OBSERVER. You do NOT advance the work. Read the worker's last number from the context/handoff and persist it."
epilogue = "Call write_context with content exactly 'To-dos completed: N' (N = the worker's last number). Then reply 'recorded'."
[[states.memory_weaver.exits]]
when = "builtin::paused"
to = "work"
epilogue = "Here is what was learned so far; continue with the next to-do."

[states.done]
"#;

/// Base task for [`RALPH_LOOP_CONFIG`].
pub const RALPH_LOOP_PROMPT: &str = "Complete three to-dos, one per turn.";

/// A workflow whose `work` stage spawns a `researcher` sub-agent (which may
/// `ask_parent`) before completing a to-do via the counter. Demonstrates
/// `spawn_subagent` + `ask_parent` + one-level-deep. The host wires the
/// `spawn_subagent` tool when a config references it (it needs the live model).
pub const SUBAGENT_DEMO_CONFIG: &str = r#"name = "subagent-demo"
version = "1"
initial = "work"

[states.work]
tools = ["spawn_subagent", "increment_counter", "read_context", "write_context"]
prologue = "Spawn a researcher sub-agent to survey the problem, then complete one to-do (increment the counter)."

[[states.work.exits]]
when = "count >= 1"
to = "done"

[states.done]
"#;

/// Base task for [`SUBAGENT_DEMO_CONFIG`].
pub const SUBAGENT_DEMO_PROMPT: &str = "Investigate and complete one to-do.";

/// A named, ready-to-run workflow for the demo's Orchestrator panel and the
/// `--orchestrate` runner, so a user need not hand-write TOML.
#[derive(Debug, Clone, Copy)]
pub struct WorkflowPreset {
    /// Short label shown in the UI (e.g. `"tiny"`, `"ralph-loop"`).
    pub name: &'static str,
    /// One-line description of what the workflow demonstrates.
    pub description: &'static str,
    /// The workflow config TOML.
    pub config: &'static str,
    /// The base task handed to every stage.
    pub task: &'static str,
}

impl WorkflowPreset {
    /// The seed state for this preset: every routing key its guards read, set to
    /// `0`, so numeric guards (e.g. `count >= 3`) have a value before any tool
    /// has run.
    ///
    /// # Panics
    /// Never in practice — the bundled preset configs are valid TOML that
    /// compiles; a malformed preset is a build-time authoring bug.
    #[must_use]
    pub fn seed(&self) -> HashMap<String, Value> {
        let config: pipeline::compiler::WorkflowConfig =
            toml::from_str(self.config).expect("preset config is valid TOML");
        let Ok(program) = pipeline::compile_stage(&config) else {
            return HashMap::new();
        };
        let mut seed = HashMap::new();
        for name in config.states.keys() {
            for key in runtime::stage_routing_keys(&program, name) {
                seed.entry(key).or_insert(Value::from(0));
            }
        }
        seed
    }
}

/// The bundled workflow presets, in display order. First is the default.
#[must_use]
pub fn presets() -> &'static [WorkflowPreset] {
    &[
        WorkflowPreset {
            name: "tiny",
            description: "one stage: write a haiku, record it (count >= 1), done",
            config: SIMPLE_TASK_CONFIG,
            task: SIMPLE_TASK_PROMPT,
        },
        WorkflowPreset {
            name: "ralph-loop",
            description: "autonomous loop: increment a counter to 3 (count >= 3); weave + retry until done",
            config: RALPH_LOOP_CONFIG,
            task: RALPH_LOOP_PROMPT,
        },
        WorkflowPreset {
            name: "subagent-demo",
            description: "work stage spawns a researcher sub-agent (which can ask_parent), then completes a to-do",
            config: SUBAGENT_DEMO_CONFIG,
            task: SUBAGENT_DEMO_PROMPT,
        },
    ]
}

#[cfg(test)]
mod tests {
    use super::presets;
    use pipeline::{compile_stage, compiler::WorkflowConfig};
    use runtime::stage_routing_keys;

    #[test]
    fn every_preset_compiles_and_seeds_its_routing_keys() {
        for preset in presets() {
            let config: WorkflowConfig = toml::from_str(preset.config)
                .unwrap_or_else(|e| panic!("preset `{}` is invalid TOML: {e}", preset.name));
            let program = compile_stage(&config)
                .unwrap_or_else(|e| panic!("preset `{}` failed to compile: {e}", preset.name));
            let seed = preset.seed();
            for name in config.states.keys() {
                for key in stage_routing_keys(&program, name) {
                    let base = key.split_once("@entry").map_or(key.as_str(), |(b, _)| b);
                    assert!(
                        seed.contains_key(base),
                        "preset `{}` seed missing routing key `{base}`",
                        preset.name
                    );
                }
            }
        }
    }
}
