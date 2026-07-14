//! End-to-end orchestrator: drive a whole `WorkflowProgram` to completion by
//! running each stage's step through the [`Harness`] against a real model.
//!
//! This is the loop a production Orchestrator runs, one grain above the
//! `WorkflowRun` governor:
//!
//! 1. `run.next_step(program)` yields the next [`WorkflowRunStep`].
//! 2. On `RunStage { stage, handoff }`, look up the stage's first step config
//!    and drive it through `Harness::run_step` — a real model turn (+ tools).
//! 3. The model's reply is scanned for a trailing `@state { … }` JSON line; that
//!    object is merged into the run state as the stage's updates. No trailer →
//!    no updates → the stage parks (`Suspend`), exactly as the governor intends.
//! 4. `run.stage_complete(program, updates, tokens)` gates to the next stage.
//! 5. Repeat until `Done`, `Suspend`, or `Cancelled`.
//!
//! The model decides routing by emitting the state keys the `when` guards read,
//! so the workflow is genuinely driven by model output — not scripted advances.

use std::collections::HashMap;
use std::sync::mpsc;

use pipeline::WorkflowProgram;
use rig::completion::CompletionModel;
use serde_json::Value;

use crate::harness::{Harness, HarnessError, HarnessEvent};
use crate::workflow::{WorkflowRun, WorkflowRunStep};

/// How a finished end-to-end run ended.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Outcome {
    /// Reached a terminal stage.
    Done { stage: String },
    /// Parked on a stage whose exits did not fire (awaiting an external event).
    Suspended { stage: String },
    /// Hit the stage-run cap without reaching a terminal stage — the autonomous
    /// loop did not converge. A graceful stop, not an error.
    MaxIterations { stage: String, ran: usize },
    /// Cancelled via the harness cancel token.
    Cancelled,
}

/// Default cap on how many stages a single [`run_to_completion`] will run before
/// stopping with [`Outcome::MaxIterations`]. Bounds non-converging Ralph loops
/// independently of the token budget.
pub const DEFAULT_MAX_STAGE_RUNS: usize = 24;

/// One entry in the orchestrator's run transcript, for surfacing to a UI.
#[derive(Debug, Clone)]
pub enum OrchestratorEvent {
    /// A stage is about to run, with the inbound transition handoff (if any).
    StageEntered {
        stage: String,
        handoff: Option<String>,
    },
    /// A `HarnessEvent` produced while running the stage's step.
    Harness(HarnessEvent),
    /// The state updates parsed from the stage's model reply.
    StateParsed {
        stage: String,
        updates: HashMap<String, Value>,
    },
    /// The stage finished and the governor routed to `now` (or parked there).
    StageRouted {
        from: String,
        now: String,
        parked: bool,
    },
    /// The run finished.
    Finished(Outcome),
}

/// Drive `run` to a terminal/parked/cancelled state, running each stage's first
/// step through `harness` against the model. `task` is the base prompt handed to
/// every stage; `tx` receives the live transcript.
///
/// # Errors
/// Returns [`HarnessError`] if a stage's model turn fails, or a
/// [`crate::workflow::WorkflowError`] (wrapped as [`HarnessError::AgentRun`]) if
/// the governor rejects a transition (e.g. an exit guard reads an unseeded key).
pub async fn run_to_completion<M: CompletionModel>(
    harness: &Harness<M>,
    program: &WorkflowProgram,
    run: &mut WorkflowRun,
    task: &str,
    tx: &mpsc::Sender<OrchestratorEvent>,
) -> Result<Outcome, HarnessError> {
    run_with_limit(
        harness,
        program,
        run,
        task,
        DEFAULT_MAX_STAGE_RUNS,
        DriveOptions::default(),
        tx,
    )
    .await
}

/// A pull-on-demand reader for shared run context (e.g. `context.md`). The
/// orchestrator calls it before each stage so learnings a prior stage just wrote
/// are folded into the next stage's handoff. Returns `None`/empty when there is
/// nothing to inject. Kept as a closure so `runtime` needs no dependency on the
/// `services` crate that owns the context file.
pub type ContextReader<'a> = &'a (dyn Fn() -> String + Sync);

/// Optional knobs for driving a workflow: a shared-context reader folded into each
/// stage's handoff, and a cancellation token checked at each stage boundary. Both
/// default to off; build with [`DriveOptions::with_context`] / [`with_cancel`].
///
/// [`with_cancel`]: DriveOptions::with_cancel
#[derive(Default, Clone, Copy)]
pub struct DriveOptions<'a> {
    /// Pull-on-demand shared context (e.g. `context.md`) prepended to each
    /// stage's handoff.
    pub context: Option<ContextReader<'a>>,
    /// When set and cancelled, the driver stops at the next stage boundary with
    /// [`Outcome::Cancelled`] (never mid-tool-call).
    pub cancel: Option<&'a tokio_util::sync::CancellationToken>,
    /// When set, the run is persisted to this store after each stage boundary so a
    /// crash can resume at status granularity.
    pub persist: Option<&'a crate::persist::RunStore>,
}

impl<'a> DriveOptions<'a> {
    /// Set the shared-context reader.
    #[must_use]
    pub fn with_context(mut self, context: ContextReader<'a>) -> Self {
        self.context = Some(context);
        self
    }

    /// Set the cancellation token.
    #[must_use]
    pub fn with_cancel(mut self, cancel: &'a tokio_util::sync::CancellationToken) -> Self {
        self.cancel = Some(cancel);
        self
    }

    /// Set the crash-recovery run store.
    #[must_use]
    pub fn with_persist(mut self, store: &'a crate::persist::RunStore) -> Self {
        self.persist = Some(store);
        self
    }
}

/// [`run_to_completion`] with an explicit cap on stage runs and optional
/// [`DriveOptions`] (shared-context reader + cancellation token). When the cap is
/// hit before a terminal stage, returns [`Outcome::MaxIterations`] (a graceful
/// stop for a non-converging autonomous loop), not an error. When the context
/// reader yields non-empty text, it is prepended to each stage's handoff. When the
/// cancel token fires, the next boundary returns [`Outcome::Cancelled`].
///
/// # Errors
/// Returns [`HarnessError`] if a stage's model turn fails, or a
/// [`crate::workflow::WorkflowError`] (wrapped as [`HarnessError::AgentRun`]) if
/// the governor rejects a transition.
pub async fn run_with_limit<M: CompletionModel>(
    harness: &Harness<M>,
    program: &WorkflowProgram,
    run: &mut WorkflowRun,
    task: &str,
    max_stage_runs: usize,
    opts: DriveOptions<'_>,
    tx: &mpsc::Sender<OrchestratorEvent>,
) -> Result<Outcome, HarnessError> {
    let mut ran: usize = 0;
    loop {
        // Cancellation is checked at each stage boundary — never mid-tool-call.
        if let Some(token) = opts.cancel
            && token.is_cancelled()
        {
            run.cancel();
            let _ = tx.send(OrchestratorEvent::Finished(Outcome::Cancelled));
            return Ok(Outcome::Cancelled);
        }

        let step = run
            .next_step(program)
            .map_err(|e| HarnessError::AgentRun(e.to_string()))?;

        match step {
            WorkflowRunStep::Done { stage } => {
                let outcome = Outcome::Done { stage };
                let _ = tx.send(OrchestratorEvent::Finished(outcome.clone()));
                return Ok(outcome);
            }
            WorkflowRunStep::Suspend { stage } => {
                let outcome = Outcome::Suspended { stage };
                let _ = tx.send(OrchestratorEvent::Finished(outcome.clone()));
                return Ok(outcome);
            }
            WorkflowRunStep::Cancelled => {
                let _ = tx.send(OrchestratorEvent::Finished(Outcome::Cancelled));
                return Ok(Outcome::Cancelled);
            }
            WorkflowRunStep::RunStage { stage, handoff } => {
                if ran >= max_stage_runs {
                    let outcome = Outcome::MaxIterations { stage, ran };
                    let _ = tx.send(OrchestratorEvent::Finished(outcome.clone()));
                    return Ok(outcome);
                }
                ran += 1;

                // Fold the shared run context (e.g. context.md the memory-weaver
                // wrote on a prior pass) into this stage's handoff, so the agent
                // builds on accumulated learnings instead of starting fresh.
                let effective_handoff = with_context(handoff.clone(), opts.context);

                let _ = tx.send(OrchestratorEvent::StageEntered {
                    stage: stage.clone(),
                    handoff: effective_handoff.clone(),
                });

                // The step's own epilogue is used as-is. There is NO routing
                // contract injected: the agent never sets routing state. State
                // comes only from deterministic tool outcomes (below).
                let step_config = stage_step_config(program, &stage);

                // Forward harness events into the orchestrator transcript, collect
                // the deterministic state deltas (HarnessEvent::Done.state — the
                // ONLY thing that routes), and capture the finishing agent's
                // response (its answer to the epilogue, or its final output) to
                // carry forward as the next stage's handoff.
                let (htx, hrx) = mpsc::channel();
                let (updates, agent_output, tokens) = {
                    // The harness checks this after each tool batch: when a real
                    // (non-fallback) exit guard is satisfied by the deterministic
                    // state so far, it returns that exit's epilogue so the harness
                    // can halt the agent and ask the epilogue in its live session.
                    // Scoped here so its immutable borrow of `run` ends before
                    // `stage_complete` needs `&mut run`.
                    let resolve = |state: &HashMap<String, Value>| {
                        run.resolve_pending_epilogue(program, state)
                    };
                    let events = harness
                        .run_step(
                            &step_config,
                            task,
                            effective_handoff.as_deref(),
                            &resolve,
                            &htx,
                        )
                        .await?;
                    drop(htx);
                    for ev in &hrx {
                        let _ = tx.send(OrchestratorEvent::Harness(ev));
                    }
                    (
                        tool_state(&events),
                        final_output(&events),
                        stage_tokens(&events),
                    )
                };

                let _ = tx.send(OrchestratorEvent::StateParsed {
                    stage: stage.clone(),
                    updates: updates.clone(),
                });

                run.stage_complete(program, updates, tokens)
                    .map_err(|e| HarnessError::AgentRun(e.to_string()))?;

                // Persist the run at this stage boundary for crash recovery. A
                // write failure is logged but does not abort the run (the workflow
                // can still proceed in memory).
                if let Some(store) = opts.persist
                    && let Err(e) = store.persist(run)
                {
                    eprintln!("[orchestrator] persist failed: {e}");
                }

                // Carry the finishing agent's response forward as the handoff,
                // replacing the static exit epilogue — but only when the run
                // actually advanced (not parked) and the agent produced something.
                // `with_context` folds context.md ahead of it at the next entry.
                if !run.is_suspended() && !agent_output.is_empty() {
                    run.set_handoff(Some(agent_output));
                }

                let now = run.current_stage().to_string();
                let _ = tx.send(OrchestratorEvent::StageRouted {
                    from: stage,
                    now,
                    parked: run.is_suspended(),
                });
            }
        }
    }
}

/// An external signal delivered to a parked workflow — a webhook, a Jira/GitHub
/// status change, a human sign-off. It carries deterministic state deltas (the
/// same shape tools publish) that the governor merges before re-evaluating the
/// parked stage's exit guards. This is how a stage parked on, say, `approved`
/// wakes: the outside world delivers `{"approved": true}` and the guard fires.
#[derive(Debug, Clone, Default)]
pub struct ExternalEvent {
    pub updates: HashMap<String, Value>,
}

impl ExternalEvent {
    /// An event carrying a single state delta (e.g. `("approved", true)`).
    #[must_use]
    pub fn with(key: impl Into<String>, value: impl Into<Value>) -> Self {
        let mut updates = HashMap::new();
        updates.insert(key.into(), value.into());
        Self { updates }
    }
}

/// Resume a parked workflow on an external event, then drive it onward.
///
/// Merges the event's deterministic `updates` into the parked run and re-evaluates
/// the parked stage's exit guards: if one now fires the run advances and is driven
/// via [`run_with_limit`] to its next terminal/parked/cap state; if none fires the
/// run simply re-parks (returns [`Outcome::Suspended`] again). The caller owns the
/// serialized `WorkflowRun` across the park, so this is the resume half of the
/// park/resume pair — no separate handle type is needed.
///
/// # Errors
/// Returns [`HarnessError::AgentRun`] if the run is not parked (governor
/// `Protocol` error) or a guard fails to evaluate, or any [`HarnessError`] from a
/// subsequently driven stage.
// One arg over the pedantic limit: this is `run_with_limit` (already at 7) plus
// the event to merge first.
#[allow(
    clippy::too_many_arguments,
    reason = "thin resume wrapper over run_with_limit + event"
)]
pub async fn resume_workflow<M: CompletionModel>(
    harness: &Harness<M>,
    program: &WorkflowProgram,
    run: &mut WorkflowRun,
    task: &str,
    max_stage_runs: usize,
    opts: DriveOptions<'_>,
    event: ExternalEvent,
    tx: &mpsc::Sender<OrchestratorEvent>,
) -> Result<Outcome, HarnessError> {
    run.resume(program, event.updates)
        .map_err(|e| HarnessError::AgentRun(e.to_string()))?;

    // Still parked → the event didn't satisfy any guard; report it re-parked.
    if run.is_suspended() {
        let outcome = Outcome::Suspended {
            stage: run.current_stage().to_string(),
        };
        let _ = tx.send(OrchestratorEvent::Finished(outcome.clone()));
        return Ok(outcome);
    }

    run_with_limit(harness, program, run, task, max_stage_runs, opts, tx).await
}

/// The agent config for a stage — the stage's own embedded step config, or a
/// default when the stage is unknown (the governor still runs an empty step).
fn stage_step_config(program: &WorkflowProgram, stage: &str) -> pipeline::compiler::StepConfig {
    program
        .config
        .states
        .get(stage)
        .map(|s| s.step.clone())
        .unwrap_or_default()
}

/// Fold the current shared context (if any, non-empty) ahead of `handoff`, so
/// the agent sees accumulated learnings before the stage's transition note.
fn with_context(handoff: Option<String>, context: Option<ContextReader<'_>>) -> Option<String> {
    let ctx = context.map(|f| f()).filter(|c| !c.trim().is_empty());
    match (ctx, handoff) {
        (Some(ctx), Some(h)) => Some(format!("Context so far:\n{ctx}\n\n{h}")),
        (Some(ctx), None) => Some(format!("Context so far:\n{ctx}")),
        (None, h) => h,
    }
}

/// The distinct state keys every exit guard on `stage` reads, in first-seen
/// order — the keys a seed must define so the governor never errors on an
/// unseeded key. Public so panels can auto-seed an arbitrary config.
#[must_use]
pub fn stage_routing_keys(program: &WorkflowProgram, stage: &str) -> Vec<String> {
    let mut keys = Vec::new();
    if let Some(exits) = program.compiled_exits.get(stage) {
        for exit in exits {
            for key in exit.expr.known_keys() {
                if !keys.contains(&key) {
                    keys.push(key);
                }
            }
        }
    }
    keys
}

/// The deterministic state deltas a stage's tools published, from its harness
/// events. This is the ONLY state the orchestrator feeds into the governor — the
/// agent's text output never contributes routing state.
fn tool_state(events: &[HarnessEvent]) -> HashMap<String, Value> {
    events
        .iter()
        .rev()
        .find_map(|e| match e {
            HarnessEvent::Done { state, .. } => Some(state.clone()),
            _ => None,
        })
        .unwrap_or_default()
}

/// The finishing agent's final text output (its response to the transition
/// epilogue when a real guard fired mid-run, otherwise its natural final turn).
/// Carried forward as the next stage's handoff.
fn final_output(events: &[HarnessEvent]) -> String {
    events
        .iter()
        .rev()
        .find_map(|e| match e {
            HarnessEvent::Done { output, .. } => Some(output.clone()),
            _ => None,
        })
        .unwrap_or_default()
}

/// Token cost billed for a stage: the `total_tokens` from the stage's final
/// [`HarnessEvent::Done`] (the harness's accumulated usage across every model
/// turn, including the live-session epilogue turn). Fed to `stage_complete` so
/// the workflow token budget aggregates real usage and `budget_exceeded` can fire.
fn stage_tokens(events: &[HarnessEvent]) -> u64 {
    events
        .iter()
        .rev()
        .find_map(|e| match e {
            HarnessEvent::Done { usage, .. } => Some(usage.total_tokens),
            _ => None,
        })
        .unwrap_or(0)
}

/// Validate that every state key an exit guard reads is `available` — i.e.
/// produced by some in-scope tool (`Tool::produces`) or explicitly seeded. This
/// enforces the rule that a guard may only route on deterministic state some
/// tool owns; a guard reading an unproduced/unseeded key is a workflow authoring
/// error, caught before the run instead of erroring mid-flight on `UnknownKey`.
///
/// # Errors
/// Returns a message naming the first stage/key whose guard reads an unavailable
/// key.
pub fn validate_state_keys<S: std::hash::BuildHasher>(
    program: &WorkflowProgram,
    available: &std::collections::HashSet<String, S>,
) -> Result<(), String> {
    for name in program.config.states.keys() {
        for key in stage_routing_keys(program, name) {
            // `<key>@entry` is the governor-provided stage-entry snapshot of
            // `<key>`; it's available whenever the base key is, so validate the
            // base key.
            let base = key.split_once("@entry").map_or(key.as_str(), |(b, _)| b);
            if !available.contains(base) {
                return Err(format!(
                    "stage `{name}` has an exit guard that reads state key `{base}`, but no tool \
                     in scope produces it and it is not seeded — routing state must come from a \
                     deterministic source"
                ));
            }
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use pipeline::{compile_stage, compiler::WorkflowConfig};

    /// A looping `work ⇄ memory_weaver` fixture (the engine's exercising shape):
    /// `count >= 3` → done, else `count != count@entry` → weaver, else the
    /// `paused` fallback → weaver. Routes only on the deterministic `count` key.
    const RALPH_FIXTURE: &str = r#"name = "ralph-fixture"
version = "1"
initial = "work"

[states.work]
tools = ["increment_counter"]
prologue = "Complete one to-do, then increment the counter."
[[states.work.exits]]
when = "count >= 3"
to = "done"
[[states.work.exits]]
when = "count != count@entry"
to = "memory_weaver"
[[states.work.exits]]
when = "builtin::paused"
to = "memory_weaver"

[states.memory_weaver]
prologue = "Record what was learned."
[[states.memory_weaver.exits]]
when = "builtin::paused"
to = "work"

[states.done]
"#;

    /// A one-stage fixture that routes on `count >= 1`.
    const SIMPLE_FIXTURE: &str = r#"name = "simple-fixture"
version = "1"
initial = "draft"

[states.draft]
tools = ["increment_counter"]
prologue = "Write something, then increment the counter."
[[states.draft.exits]]
when = "count >= 1"
to = "done"

[states.done]
"#;

    /// Seed covering the fixtures' lone routing key.
    fn count_seed() -> HashMap<String, Value> {
        HashMap::from([("count".to_string(), Value::from(0))])
    }

    #[test]
    fn validate_state_keys_flags_unproduced_guard_keys() {
        use std::collections::HashSet;
        let config: WorkflowConfig = toml::from_str(RALPH_FIXTURE).expect("toml");
        let program = compile_stage(&config).expect("compile");

        // `count` available (tool-produced/seeded) -> valid.
        let ok: HashSet<String> = ["count".to_string()].into_iter().collect();
        assert!(validate_state_keys(&program, &ok).is_ok());

        // `count` missing -> error naming the stage + key.
        let empty: HashSet<String> = HashSet::new();
        let err = validate_state_keys(&program, &empty).unwrap_err();
        assert!(err.contains("work") && err.contains("count"), "{err}");
    }

    #[test]
    fn simple_config_compiles_and_routes_on_deterministic_count() {
        let config: WorkflowConfig = toml::from_str(SIMPLE_FIXTURE).expect("toml");
        let program = compile_stage(&config).expect("compile");
        // The draft stage routes on the deterministic `count` key (count >= 1).
        assert_eq!(stage_routing_keys(&program, "draft"), vec!["count"]);
        // Terminal stage has no routing keys.
        assert!(stage_routing_keys(&program, "done").is_empty());
    }

    #[test]
    fn ralph_loop_has_an_unconditional_fallback_on_work() {
        let config: WorkflowConfig = toml::from_str(RALPH_FIXTURE).expect("toml");
        let program = compile_stage(&config).expect("compile");
        let exits = program.compiled_exits.get("work").expect("work exits");
        // Three exits, in order: `count >= 3` -> done (terminal), the per-stage
        // `count != count@entry` -> weaver (one to-do done this visit), and the
        // builtin::paused fallback last (never dead-stop).
        assert_eq!(exits.len(), 3);
        assert!(matches!(&exits[0].expr, pipeline::Expr::Comparison { .. }));
        assert_eq!(exits[0].to, "done");
        assert!(matches!(&exits[1].expr, pipeline::Expr::Comparison { .. }));
        assert_eq!(exits[1].to, "memory_weaver");
        assert!(matches!(&exits[2].expr, pipeline::Expr::Builtin { name } if name == "paused"));
        assert_eq!(exits[2].to, "memory_weaver");
    }

    #[test]
    fn entry_snapshot_guard_routes_on_per_stage_change() {
        // Directly exercise the governor: a `count != count@entry` guard fires
        // only when the stage changed `count`, using the entry snapshot.
        let cfg = r#"name = "t"
version = "1"
initial = "work"
[states.work]
prologue = "x"
[[states.work.exits]]
when = "count != count@entry"
to = "done"
[states.done]
"#;
        let config: WorkflowConfig = toml::from_str(cfg).expect("toml");
        let program = compile_stage(&config).expect("compile");

        // Start count=0; the stage runs (snapshots entry=0), then a tool-like
        // update bumps count to 1 -> guard fires -> routes to done.
        let mut run = WorkflowRun::new("work", 1_000_000)
            .with_state(HashMap::from([("count".to_string(), Value::from(0))]));
        assert!(matches!(
            run.next_step(&program).unwrap(),
            WorkflowRunStep::RunStage { .. }
        ));
        run.stage_complete(
            &program,
            HashMap::from([("count".to_string(), Value::from(1))]),
            0,
        )
        .expect("complete");
        assert_eq!(run.current_stage(), "done");

        // If the stage does NOT change count, the guard does not fire -> parks.
        let mut run = WorkflowRun::new("work", 1_000_000)
            .with_state(HashMap::from([("count".to_string(), Value::from(5))]));
        run.next_step(&program).unwrap();
        run.stage_complete(&program, HashMap::new(), 0)
            .expect("complete");
        assert!(run.is_suspended(), "no change -> no exit fires -> parked");
    }

    // A run-scoped counter tool (mirrors the demo's increment_counter) that
    // publishes the authoritative count into ToolResult.state — the only way the
    // loop's `count >= 3` guard ever advances. Returns the toolset + a handle.
    fn counting_toolset() -> rig::tool::ToolSet {
        use std::sync::{Arc, Mutex};
        use tools::{ToolContext, ToolResult, define_tool};
        let count = Arc::new(Mutex::new(0i64));
        let tool = define_tool(
            "increment_counter",
            "increment the run counter",
            move |_args: (), _ctx: &ToolContext| {
                let count = count.clone();
                async move {
                    let mut n = count.lock().unwrap();
                    *n += 1;
                    Ok(ToolResult::ok(n.to_string()).with_state("count", serde_json::json!(*n)))
                }
            },
        )
        .produces("count", serde_json::json!(0))
        .build();
        let mut toolset = rig::tool::ToolSet::default();
        toolset.add_tool(tools::RigToolBridge::new(
            tool,
            Arc::new(ToolContext::new(std::env::temp_dir())),
        ));
        toolset
    }

    // Mock for the ralph loop: each `work` turn calls increment_counter (the
    // deterministic state source); weaver turns are plain text. No @state.
    fn ralph_mock() -> crate::MockClient {
        use crate::{MockResponse, MockToolCall};
        let tool_turn = |id: &str| MockResponse {
            content: "incrementing".into(),
            tool_calls: vec![MockToolCall {
                id: id.into(),
                name: "increment_counter".into(),
                arguments: serde_json::json!({}),
            }],
        };
        let text = |s: &str| MockResponse {
            content: s.into(),
            tool_calls: vec![],
        };
        // work(call increment -> final), weaver(text), repeated; the cycling mock
        // re-serves these as the loop revisits the stages.
        crate::MockClient::new(vec![
            tool_turn("c1"),
            text("done incrementing"),
            text("recorded"),
        ])
    }

    #[tokio::test]
    async fn ralph_loop_advances_on_deterministic_counter_then_completes() {
        use crate::{Harness, HarnessConfig, MockCompletionModel};
        use rig::completion::CompletionModel as _;

        let config: WorkflowConfig = toml::from_str(RALPH_FIXTURE).expect("toml");
        let program = compile_stage(&config).expect("compile");

        let client = ralph_mock();
        let model = MockCompletionModel::make(&client, "mock-model");
        let harness = Harness::new(model, counting_toolset(), HarnessConfig::default());

        let mut run = WorkflowRun::new("work", 100_000_000).with_state(count_seed());

        let (tx, rx) = mpsc::channel();
        let outcome = run_to_completion(&harness, &program, &mut run, "go", &tx)
            .await
            .expect("run");
        drop(tx);

        // It reached done ONLY because the counter tool drove count to >= 3, and
        // it passed through memory_weaver between work attempts.
        let weaver_runs = rx
            .iter()
            .filter(|e| matches!(e, OrchestratorEvent::StageEntered { stage, .. } if stage == "memory_weaver"))
            .count();
        assert_eq!(
            outcome,
            Outcome::Done {
                stage: "done".into()
            }
        );
        assert!(weaver_runs >= 1, "loop should pass through memory_weaver");
    }

    #[tokio::test]
    async fn loop_with_no_state_source_stops_at_max_iterations() {
        use crate::{Harness, HarnessConfig, MockCompletionModel, MockResponse};
        use rig::completion::CompletionModel as _;
        use rig::tool::ToolSet;

        let config: WorkflowConfig = toml::from_str(RALPH_FIXTURE).expect("toml");
        let program = compile_stage(&config).expect("compile");

        // No counter tool in the toolset, so `count` never advances → the loop
        // never converges and the guard stops it. Proves the agent CANNOT
        // complete the workflow on its own (no @state escape hatch).
        let client = crate::MockClient::new(vec![MockResponse {
            content: "I'm done, I promise! complete=true".into(),
            tool_calls: vec![],
        }]);
        let model = MockCompletionModel::make(&client, "mock-model");
        let harness = Harness::new(model, ToolSet::builder().build(), HarnessConfig::default());

        let mut run = WorkflowRun::new("work", 100_000_000).with_state(count_seed());

        let (tx, _rx) = mpsc::channel();
        let outcome = run_with_limit(
            &harness,
            &program,
            &mut run,
            "x",
            5,
            DriveOptions::default(),
            &tx,
        )
        .await
        .expect("run");

        assert!(
            matches!(outcome, Outcome::MaxIterations { ran, .. } if ran == 5),
            "agent prose must not complete the loop; got {outcome:?}"
        );
    }

    #[test]
    fn tool_state_extracts_last_done_state() {
        use std::collections::HashMap;
        let mut s = HashMap::new();
        s.insert("count".to_string(), serde_json::json!(2));
        let events = vec![
            HarnessEvent::ModelCall { turn: 1 },
            HarnessEvent::Done {
                output: "x".into(),
                usage: rig::completion::Usage::new(),
                state: s,
            },
        ];
        assert_eq!(
            tool_state(&events).get("count"),
            Some(&serde_json::json!(2))
        );
    }

    #[test]
    fn stage_tokens_reads_done_usage() {
        // The stage bills the total_tokens from its final Done event (real usage),
        // not a flat 0 — so the workflow budget can actually aggregate.
        let usage = rig::completion::Usage {
            total_tokens: 1234,
            ..rig::completion::Usage::new()
        };
        let events = vec![
            HarnessEvent::ModelCall { turn: 1 },
            HarnessEvent::Done {
                output: "x".into(),
                usage,
                state: std::collections::HashMap::new(),
            },
        ];
        assert_eq!(stage_tokens(&events), 1234);
        // No Done event -> 0.
        assert_eq!(stage_tokens(&[HarnessEvent::ModelCall { turn: 1 }]), 0);
    }

    #[tokio::test]
    async fn parks_then_resumes_on_external_event_to_done() {
        use crate::{Harness, HarnessConfig, MockCompletionModel, MockResponse};
        use rig::completion::CompletionModel as _;
        use rig::tool::ToolSet;

        // A stage that parks: its only exit needs `approved`, which no tool sets.
        // An external event delivers approved=true and wakes it to `done`.
        let cfg = r#"name = "review"
version = "1"
initial = "in_review"
[states.in_review]
prologue = "Wait for sign-off."
[[states.in_review.exits]]
when = "approved == true"
to = "done"
epilogue = "Signed off."
[states.done]
"#;
        let config: WorkflowConfig = toml::from_str(cfg).expect("toml");
        let program = compile_stage(&config).expect("compile");

        let client = crate::MockClient::new(vec![MockResponse {
            content: "awaiting review".into(),
            tool_calls: vec![],
        }]);
        let model = MockCompletionModel::make(&client, "mock-model");
        let harness = Harness::new(model, ToolSet::builder().build(), HarnessConfig::default());

        // Seed `approved=false` so the guard has a value; the stage runs, no tool
        // sets approved, so it parks.
        let mut run = WorkflowRun::new("in_review", 100_000_000).with_state(HashMap::from([(
            "approved".to_string(),
            Value::Bool(false),
        )]));

        let (tx, _rx) = mpsc::channel();
        let outcome = run_to_completion(&harness, &program, &mut run, "review", &tx)
            .await
            .expect("run");
        assert!(
            matches!(&outcome, Outcome::Suspended { stage } if stage == "in_review"),
            "expected park at in_review, got {outcome:?}"
        );
        assert!(run.is_suspended());

        // External sign-off arrives → resume → drives to Done.
        let (tx2, _rx2) = mpsc::channel();
        let resumed = resume_workflow(
            &harness,
            &program,
            &mut run,
            "review",
            DEFAULT_MAX_STAGE_RUNS,
            DriveOptions::default(),
            ExternalEvent::with("approved", true),
            &tx2,
        )
        .await
        .expect("resume");
        assert!(
            matches!(&resumed, Outcome::Done { stage } if stage == "done"),
            "expected Done after sign-off, got {resumed:?}"
        );
    }

    #[tokio::test]
    async fn persisted_run_can_be_reloaded_and_resumed_after_a_crash() {
        use crate::persist::RunStore;
        use crate::{Harness, HarnessConfig, MockClient, MockCompletionModel, MockResponse};
        use rig::tool::ToolSet;

        // A stage that parks on `approved`; we run it (persisting each boundary),
        // simulate a crash by dropping the run, reload from disk, and resume.
        let cfg = r#"name = "review"
version = "1"
initial = "in_review"
[states.in_review]
prologue = "Wait."
[[states.in_review.exits]]
when = "approved == true"
to = "done"
[states.done]
"#;
        let config: WorkflowConfig = toml::from_str(cfg).expect("toml");
        let program = compile_stage(&config).expect("compile");
        let make_harness = || {
            let client = MockClient::new(vec![MockResponse {
                content: "waiting".into(),
                tool_calls: vec![],
            }]);
            let model = MockCompletionModel::make(&client, "mock-model");
            Harness::new(model, ToolSet::builder().build(), HarnessConfig::default())
        };

        let tmp = std::env::temp_dir().join(format!("wh-orch-persist-{}", std::process::id()));
        let store = RunStore::for_issue(&tmp, "ISSUE-9");

        // Phase 1: run until it parks, persisting each boundary.
        {
            let harness = make_harness();
            let mut run = WorkflowRun::new("in_review", 100_000_000).with_state(HashMap::from([(
                "approved".to_string(),
                Value::Bool(false),
            )]));
            let (tx, _rx) = mpsc::channel();
            let outcome = run_with_limit(
                &harness,
                &program,
                &mut run,
                "review",
                DEFAULT_MAX_STAGE_RUNS,
                DriveOptions::default().with_persist(&store),
                &tx,
            )
            .await
            .expect("run");
            assert!(matches!(outcome, Outcome::Suspended { .. }));
            // run drops here — the "crash".
        }

        // Phase 2: reload from disk (fresh process would do this) and resume.
        let mut reloaded = store.load().expect("a persisted run exists");
        assert_eq!(reloaded.current_stage(), "in_review");
        let harness = make_harness();
        let (tx, _rx) = mpsc::channel();
        let resumed = resume_workflow(
            &harness,
            &program,
            &mut reloaded,
            "review",
            DEFAULT_MAX_STAGE_RUNS,
            DriveOptions::default().with_persist(&store),
            ExternalEvent::with("approved", true),
            &tx,
        )
        .await
        .expect("resume");
        assert!(
            matches!(&resumed, Outcome::Done { stage } if stage == "done"),
            "reloaded run should resume to Done, got {resumed:?}"
        );
        let _ = std::fs::remove_dir_all(&tmp);
    }

    #[tokio::test]
    async fn cancel_token_stops_at_the_next_stage_boundary() {
        use crate::{Harness, HarnessConfig, MockClient, MockCompletionModel, MockResponse};
        use rig::tool::ToolSet;
        use tokio_util::sync::CancellationToken;

        let cfg = r#"name = "c"
version = "1"
initial = "work"
[states.work]
prologue = "work"
[[states.work.exits]]
when = "builtin::paused"
to = "work"
[states.done]
"#;
        let config: WorkflowConfig = toml::from_str(cfg).expect("toml");
        let program = compile_stage(&config).expect("compile");
        let client = MockClient::new(vec![MockResponse {
            content: "loop".into(),
            tool_calls: vec![],
        }]);
        let model = MockCompletionModel::make(&client, "mock-model");
        let harness = Harness::new(model, ToolSet::builder().build(), HarnessConfig::default());
        let mut run = WorkflowRun::new("work", 100_000_000);

        // Pre-cancelled token → the driver stops at the very first boundary.
        let token = CancellationToken::new();
        token.cancel();
        let (tx, _rx) = mpsc::channel();
        let outcome = run_with_limit(
            &harness,
            &program,
            &mut run,
            "x",
            DEFAULT_MAX_STAGE_RUNS,
            DriveOptions::default().with_cancel(&token),
            &tx,
        )
        .await
        .expect("run");
        assert!(matches!(outcome, Outcome::Cancelled), "got {outcome:?}");
    }

    #[tokio::test]
    async fn resume_with_unsatisfying_event_reparks() {
        use crate::{Harness, HarnessConfig, MockCompletionModel, MockResponse};
        use rig::completion::CompletionModel as _;
        use rig::tool::ToolSet;

        let cfg = r#"name = "review"
version = "1"
initial = "in_review"
[states.in_review]
prologue = "Wait."
[[states.in_review.exits]]
when = "approved == true"
to = "done"
[states.done]
"#;
        let config: WorkflowConfig = toml::from_str(cfg).expect("toml");
        let program = compile_stage(&config).expect("compile");
        let client = crate::MockClient::new(vec![MockResponse {
            content: "waiting".into(),
            tool_calls: vec![],
        }]);
        let model = MockCompletionModel::make(&client, "mock-model");
        let harness = Harness::new(model, ToolSet::builder().build(), HarnessConfig::default());
        let mut run = WorkflowRun::new("in_review", 100_000_000).with_state(HashMap::from([(
            "approved".to_string(),
            Value::Bool(false),
        )]));

        let (tx, _rx) = mpsc::channel();
        run_to_completion(&harness, &program, &mut run, "x", &tx)
            .await
            .expect("run");

        // An event that does NOT satisfy the guard → re-parks, no advance.
        let (tx2, _rx2) = mpsc::channel();
        let outcome = resume_workflow(
            &harness,
            &program,
            &mut run,
            "x",
            DEFAULT_MAX_STAGE_RUNS,
            DriveOptions::default(),
            ExternalEvent::with("approved", false),
            &tx2,
        )
        .await
        .expect("resume");
        assert!(
            matches!(&outcome, Outcome::Suspended { .. }),
            "got {outcome:?}"
        );
        assert!(run.is_suspended());
    }
}
