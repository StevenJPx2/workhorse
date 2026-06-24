use std::collections::HashMap;

use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::expr::{Expr, parse_expr};
use crate::op::{ChainOp, ClosureOp, ValueOp};

/// Errors raised while lowering a stage into its [`ValueOp`] pipeline.
#[derive(Debug, thiserror::Error)]
pub enum PipelineError {
    #[error("stage not found: {0}")]
    StageNotFound(String),
    #[error("step not found: {0}")]
    StepNotFound(String),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StageConfig {
    pub name: String,
    pub steps: Vec<String>,
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
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkflowConfig {
    pub name: String,
    pub version: String,
    pub states: Vec<StageConfig>,
    pub steps: HashMap<String, StepConfig>,
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

/// Lower a workflow config into a [`WorkflowProgram`], parsing every stage's
/// `when` exit guards into [`Expr`] ASTs.
///
/// # Errors
/// Returns [`crate::expr::ExprError`] if any exit's `when` string fails to parse.
pub fn compile_stage(config: &WorkflowConfig) -> Result<WorkflowProgram, crate::expr::ExprError> {
    let mut compiled_exits = HashMap::new();

    for stage in &config.states {
        let mut exits = Vec::new();
        for exit in &stage.exits {
            let expr = parse_expr(&exit.when)?;
            exits.push(CompiledExit {
                expr,
                to: exit.to.clone(),
                epilogue: exit.epilogue.clone(),
            });
        }
        compiled_exits.insert(stage.name.clone(), exits);
    }

    Ok(WorkflowProgram {
        config: config.clone(),
        compiled_exits,
    })
}

impl WorkflowProgram {
    /// Build the lowered `ValueOp` pipeline for one stage by chaining its steps.
    ///
    /// # Errors
    /// Returns [`PipelineError::StageNotFound`] if the stage name is unknown, or
    /// [`PipelineError::StepNotFound`] if it references a step id that is not
    /// defined in the config.
    pub fn build_stage_pipeline(
        &self,
        stage_name: &str,
    ) -> Result<Box<dyn ValueOp>, PipelineError> {
        let stage = self
            .config
            .states
            .iter()
            .find(|s| s.name == stage_name)
            .ok_or_else(|| PipelineError::StageNotFound(stage_name.to_string()))?;

        let mut ops: Vec<Box<dyn ValueOp>> = Vec::new();

        for step_id in &stage.steps {
            let step = self
                .config
                .steps
                .get(step_id)
                .ok_or_else(|| PipelineError::StepNotFound(step_id.clone()))?;

            let prologue = step.prologue.clone().unwrap_or_default();
            let epilogue = step.epilogue.clone().unwrap_or_default();
            let step_id_owned = step_id.clone();

            ops.push(Box::new(ClosureOp::new(move |input: Value| {
                let prologue = prologue.clone();
                let epilogue = epilogue.clone();
                let step_id = step_id_owned.clone();
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
                        map.insert("step".into(), Value::String(step_id));
                    }
                    output
                })
            })));
        }

        Ok(Box::new(ChainOp::new(ops)))
    }
}
