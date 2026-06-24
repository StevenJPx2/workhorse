use std::collections::HashMap;

use pipeline::WorkflowProgram;
use serde::{Deserialize, Serialize};
use serde_json::Value;

/// A sans-IO step machine that governs a workflow at the stage grain, mirroring
/// rig's `AgentRun` one grain up. Holds only serializable run state; the
/// `WorkflowProgram` (the compiled "code") is passed in at each step so a parked
/// run can serialize, move processes, and resume against a rebuilt program.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkflowRun {
    current_stage: String,
    state: HashMap<String, Value>,
    total_tokens: u64,
    token_budget: u64,
    phase: Phase,
    pending_handoff: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
enum Phase {
    ReadyToRun,
    AwaitingResult,
    Suspended,
    Done,
    Cancelled,
}

#[derive(Debug, Clone, PartialEq)]
pub enum WorkflowRunStep {
    RunStage {
        stage: String,
        handoff: Option<String>,
    },
    Suspend {
        stage: String,
    },
    Done {
        stage: String,
    },
    Cancelled,
}

#[derive(Debug, thiserror::Error)]
pub enum WorkflowError {
    #[error("token budget exceeded: used {used}, budget {budget}")]
    BudgetExceeded { used: u64, budget: u64 },
    #[error("protocol violation: {0}")]
    Protocol(String),
    #[error("gating error: {0}")]
    Gating(String),
}

impl WorkflowRun {
    pub fn new(initial_stage: impl Into<String>, token_budget: u64) -> Self {
        Self {
            current_stage: initial_stage.into(),
            state: HashMap::new(),
            total_tokens: 0,
            token_budget,
            phase: Phase::ReadyToRun,
            pending_handoff: None,
        }
    }

    #[must_use]
    pub fn with_state(mut self, state: HashMap<String, Value>) -> Self {
        self.state = state;
        self
    }

    /// Advance the governor one step, returning the next [`WorkflowRunStep`] for
    /// the Orchestrator to perform IO for.
    ///
    /// # Errors
    /// Returns [`WorkflowError::Protocol`] if called while a stage result is
    /// still pending (call `stage_complete` first).
    pub fn next_step(
        &mut self,
        program: &WorkflowProgram,
    ) -> Result<WorkflowRunStep, WorkflowError> {
        match self.phase {
            Phase::Cancelled => Ok(WorkflowRunStep::Cancelled),
            Phase::Done => Ok(WorkflowRunStep::Done {
                stage: self.current_stage.clone(),
            }),
            Phase::Suspended => Ok(WorkflowRunStep::Suspend {
                stage: self.current_stage.clone(),
            }),
            Phase::ReadyToRun => {
                if self.is_terminal(program) {
                    self.phase = Phase::Done;
                    Ok(WorkflowRunStep::Done {
                        stage: self.current_stage.clone(),
                    })
                } else {
                    self.phase = Phase::AwaitingResult;
                    Ok(WorkflowRunStep::RunStage {
                        stage: self.current_stage.clone(),
                        handoff: self.pending_handoff.clone(),
                    })
                }
            }
            Phase::AwaitingResult => Err(WorkflowError::Protocol(
                "next_step called while awaiting a stage result; call stage_complete first".into(),
            )),
        }
    }

    /// Record a finished stage: merge its state updates, add its token cost, and
    /// evaluate the stage's exit guards to route to the next stage (or park).
    ///
    /// # Errors
    /// Returns [`WorkflowError::Protocol`] if no `RunStage` is pending,
    /// [`WorkflowError::BudgetExceeded`] if the token budget is blown, or
    /// [`WorkflowError::Gating`] if an exit guard fails to evaluate.
    pub fn stage_complete(
        &mut self,
        program: &WorkflowProgram,
        updates: HashMap<String, Value>,
        tokens: u64,
    ) -> Result<(), WorkflowError> {
        if self.phase != Phase::AwaitingResult {
            return Err(WorkflowError::Protocol(
                "stage_complete called without a pending RunStage".into(),
            ));
        }

        self.merge(updates);
        self.total_tokens += tokens;
        if self.total_tokens > self.token_budget {
            return Err(WorkflowError::BudgetExceeded {
                used: self.total_tokens,
                budget: self.token_budget,
            });
        }

        self.evaluate_exits(program)
    }

    /// Resume a parked run on an external event, merging updates and re-evaluating
    /// the current stage's exit guards.
    ///
    /// # Errors
    /// Returns [`WorkflowError::Protocol`] if the run is not suspended, or
    /// [`WorkflowError::Gating`] if an exit guard fails to evaluate.
    pub fn resume(
        &mut self,
        program: &WorkflowProgram,
        updates: HashMap<String, Value>,
    ) -> Result<(), WorkflowError> {
        if self.phase != Phase::Suspended {
            return Err(WorkflowError::Protocol(
                "resume called when the run is not suspended".into(),
            ));
        }

        self.merge(updates);
        self.evaluate_exits(program)
    }

    pub fn cancel(&mut self) {
        self.phase = Phase::Cancelled;
    }

    #[must_use]
    pub fn total_tokens(&self) -> u64 {
        self.total_tokens
    }

    #[must_use]
    pub fn current_stage(&self) -> &str {
        &self.current_stage
    }

    #[must_use]
    pub fn is_done(&self) -> bool {
        self.phase == Phase::Done
    }

    #[must_use]
    pub fn is_suspended(&self) -> bool {
        self.phase == Phase::Suspended
    }

    fn merge(&mut self, updates: HashMap<String, Value>) {
        for (k, v) in updates {
            self.state.insert(k, v);
        }
    }

    fn evaluate_exits(&mut self, program: &WorkflowProgram) -> Result<(), WorkflowError> {
        if let Some(exits) = program.compiled_exits.get(&self.current_stage) {
            for exit in exits {
                let fired = exit
                    .expr
                    .evaluate(&self.state)
                    .map_err(|e| WorkflowError::Gating(e.to_string()))?;
                if fired {
                    self.current_stage = exit.to.clone();
                    self.pending_handoff = exit.epilogue.clone();
                    self.phase = Phase::ReadyToRun;
                    return Ok(());
                }
            }
        }
        self.phase = Phase::Suspended;
        Ok(())
    }

    fn is_terminal(&self, program: &WorkflowProgram) -> bool {
        program
            .compiled_exits
            .get(&self.current_stage)
            .is_none_or(Vec::is_empty)
    }
}
