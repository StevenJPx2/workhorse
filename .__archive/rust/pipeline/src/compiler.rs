use std::collections::HashMap;

use indexmap::IndexMap;
use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::expr::{Expr, parse_expr};
use crate::op::{ChainOp, ClosureOp, ValueOp};

/// Errors raised while lowering a stage into its [`ValueOp`] pipeline.
#[derive(Debug, thiserror::Error)]
pub enum PipelineError {
    #[error("stage not found: {0}")]
    StageNotFound(String),
}

/// A stage IS its agent configuration plus its exits — there is no separate
/// "step". The agent fields are flattened in from [`StepConfig`] (so a stage's
/// TOML reads `[states.work]` with `prologue`/`tools`/… directly), and `exits`
/// drives all looping/routing. A stage that wants to reuse shared agent config
/// names a `preset` (in `StepConfig`); looping among multiple agents is expressed
/// as separate stages with exit edges, not an intra-stage step list.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct StageConfig {
    #[serde(flatten)]
    pub step: StepConfig,
    #[serde(default)]
    pub exits: Vec<ExitRule>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExitRule {
    pub when: String,
    pub to: String,
    #[serde(default)]
    pub epilogue: Option<String>,
}

/// The agent configuration for a stage: the prompt framing, capability
/// allowlists, budget, and optional `preset` to inherit shared config from.
/// Flattened into [`StageConfig`]; kept as its own type so the harness can borrow
/// just the agent config (`&stage.step`) and so presets can be expressed.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct StepConfig {
    #[serde(default)]
    pub preset: Option<String>,
    #[serde(default)]
    pub prologue: Option<String>,
    #[serde(default)]
    pub epilogue: Option<String>,
    #[serde(default)]
    pub tools: Vec<String>,
    #[serde(default)]
    pub services: Vec<String>,
    #[serde(default)]
    pub token_budget: Option<u64>,
    /// Sub-agent templates this stage's agent may spawn. Each is a named profile
    /// with a *ceiling* of permissions; the parent may narrow at spawn time but
    /// never exceed it. Sub-agents are leaf nodes (one level deep — they cannot
    /// spawn further sub-agents).
    #[serde(default)]
    pub sub_agents: Vec<SubAgentTemplate>,
}

/// A named sub-agent profile declared on a stage. Defines the *maximum*
/// capability a spawned sub-agent may have: its tool allowlist, write-glob
/// ceiling, and optional model override. The parent can restrict these further
/// when it spawns, but the spawn is rejected if it tries to exceed the ceiling.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct SubAgentTemplate {
    /// Template name the parent names when spawning (e.g. `"researcher"`).
    pub name: String,
    /// Optional model override for the sub-agent (else the parent's model).
    #[serde(default)]
    pub model: Option<String>,
    /// Tool allowlist ceiling — the sub-agent may use at most these tools.
    #[serde(default)]
    pub tools: Vec<String>,
    /// Write-glob ceiling — paths the sub-agent may write (empty = read-only).
    #[serde(default)]
    pub write_globs: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkflowConfig {
    pub name: String,
    pub version: String,
    /// The status to start in. Required because `states` is an (unordered) map
    /// keyed by status name, so there is no implicit "first stage".
    pub initial: String,
    /// Stages keyed by status name (e.g. `[states.work]`). An ordered map so the
    /// declaration order is preserved for stable round-trips and display. Each
    /// stage carries its own agent config + exits (no separate step library).
    pub states: IndexMap<String, StageConfig>,
    /// Named agent-config presets (`[presets.<name>]`). A stage that sets
    /// `preset = "<name>"` inherits the preset's fields; the stage's own explicit
    /// fields override (most-specific wins). Resolved at compile time.
    #[serde(default)]
    pub presets: HashMap<String, StepConfig>,
}

pub struct WorkflowProgram {
    pub config: WorkflowConfig,
    pub compiled_exits: HashMap<String, Vec<CompiledExit>>,
}

pub struct CompiledExit {
    pub expr: Expr,
    pub to: String,
    pub epilogue: Option<String>,
}

/// Merge a preset (`base`) under a stage's explicit step config (`over`):
/// most-specific wins. Scalar `Option` fields take `over`'s value when set, else
/// inherit `base`'s; `Vec` fields take `over`'s when non-empty, else inherit
/// `base`'s (so a stage can both extend and fully replace a preset's lists). The
/// resolved step has no `preset` (it has been applied).
#[must_use]
pub fn merge_step(base: &StepConfig, over: &StepConfig) -> StepConfig {
    let pick_vec = |o: &[String], b: &[String]| {
        if o.is_empty() { b.to_vec() } else { o.to_vec() }
    };
    StepConfig {
        preset: None,
        prologue: over.prologue.clone().or_else(|| base.prologue.clone()),
        epilogue: over.epilogue.clone().or_else(|| base.epilogue.clone()),
        tools: pick_vec(&over.tools, &base.tools),
        services: pick_vec(&over.services, &base.services),
        token_budget: over.token_budget.or(base.token_budget),
        sub_agents: if over.sub_agents.is_empty() {
            base.sub_agents.clone()
        } else {
            over.sub_agents.clone()
        },
    }
}

/// Lower a workflow config into a [`WorkflowProgram`], parsing every stage's
/// `when` exit guards into [`Expr`] ASTs and resolving `preset` inheritance.
///
/// # Errors
/// Returns [`crate::expr::ExprError`] if any exit's `when` string fails to parse.
pub fn compile_stage(config: &WorkflowConfig) -> Result<WorkflowProgram, crate::expr::ExprError> {
    let mut compiled_exits = HashMap::new();

    for (name, stage) in &config.states {
        let mut exits = Vec::new();
        for exit in &stage.exits {
            let expr = parse_expr(&exit.when)?;
            exits.push(CompiledExit {
                expr,
                to: exit.to.clone(),
                epilogue: exit.epilogue.clone(),
            });
        }
        compiled_exits.insert(name.clone(), exits);
    }

    // Resolve `preset` inheritance into a cloned config so all downstream reads
    // (the orchestrator's stage_step_config, etc.) see fully-merged step configs.
    let mut resolved = config.clone();
    for stage in resolved.states.values_mut() {
        if let Some(name) = &stage.step.preset
            && let Some(preset) = config.presets.get(name)
        {
            stage.step = merge_step(preset, &stage.step);
        } else {
            // No preset (or unknown name) — clear the marker so the resolved
            // config has no dangling `preset` reference.
            stage.step.preset = None;
        }
    }

    Ok(WorkflowProgram {
        config: resolved,
        compiled_exits,
    })
}

impl WorkflowProgram {
    /// Build the lowered `ValueOp` pipeline for one stage from its agent config
    /// (prologue/epilogue), tagging the output with the stage name.
    ///
    /// # Errors
    /// Returns [`PipelineError::StageNotFound`] if the stage name is unknown.
    pub fn build_stage_pipeline(
        &self,
        stage_name: &str,
    ) -> Result<Box<dyn ValueOp>, PipelineError> {
        let stage = self
            .config
            .states
            .get(stage_name)
            .ok_or_else(|| PipelineError::StageNotFound(stage_name.to_string()))?;

        let prologue = stage.step.prologue.clone().unwrap_or_default();
        let epilogue = stage.step.epilogue.clone().unwrap_or_default();
        let stage_name_owned = stage_name.to_string();

        let op = ClosureOp::new(move |input: Value| {
            let prologue = prologue.clone();
            let epilogue = epilogue.clone();
            let stage_name = stage_name_owned.clone();
            Box::pin(async move {
                let mut output = input.clone();
                if !prologue.is_empty()
                    && let Value::Object(map) = &mut output
                {
                    map.insert("prologue".into(), Value::String(prologue));
                }
                if !epilogue.is_empty()
                    && let Value::Object(map) = &mut output
                {
                    map.insert("epilogue".into(), Value::String(epilogue));
                }
                if let Value::Object(map) = &mut output {
                    map.insert("stage".into(), Value::String(stage_name));
                }
                output
            })
        });

        Ok(Box::new(ChainOp::new(vec![Box::new(op)])))
    }
}
