use std::collections::BTreeSet;
use std::sync::mpsc;

use futures::StreamExt;
use pipeline::compiler::StepConfig;
use rig::OneOrMany;
use rig::agent::run::{AgentRun, AgentRunStep, ModelTurn};
use rig::completion::{CompletionModel, GetTokenUsage, Usage};
use rig::message::{Message, UserContent};
use rig::streaming::StreamedAssistantContent;
use rig::tool::ToolSet;
use tokio_util::sync::CancellationToken;

use crate::step::assemble_request;

#[derive(Debug, Clone)]
pub struct HarnessConfig {
    pub max_turns: usize,
    pub token_budget: u64,
    pub tool_output_limit: usize,
}

impl Default for HarnessConfig {
    fn default() -> Self {
        Self {
            max_turns: 5,
            token_budget: 100_000,
            tool_output_limit: 3000,
        }
    }
}

#[derive(Debug, thiserror::Error)]
pub enum HarnessError {
    #[error("agent run error: {0}")]
    AgentRun(String),
    #[error("token budget exceeded: used {used}, budget {budget}")]
    BudgetExceeded { used: u64, budget: u64 },
    #[error("cancelled")]
    Cancelled,
    #[error("max turns exceeded: {0}")]
    MaxTurns(usize),
}

#[derive(Debug, Clone)]
pub enum HarnessEvent {
    ModelCall {
        turn: usize,
    },
    TextChunk {
        text: String,
    },
    ToolCall {
        name: String,
        args: String,
    },
    ToolResult {
        name: String,
        result: String,
        truncated: bool,
    },
    Done {
        output: String,
        usage: Usage,
    },
    Cancelled,
}

pub struct Harness<M: CompletionModel> {
    config: HarnessConfig,
    model: M,
    toolset: ToolSet,
    cancel_token: CancellationToken,
}

impl<M: CompletionModel> Harness<M> {
    #[must_use]
    pub fn new(model: M, toolset: ToolSet, config: HarnessConfig) -> Self {
        Self {
            model,
            toolset,
            config,
            cancel_token: CancellationToken::new(),
        }
    }

    #[must_use]
    pub fn cancel_token(&self) -> CancellationToken {
        self.cancel_token.clone()
    }

    /// Run a single default step against `prompt`.
    ///
    /// # Errors
    /// Propagates any [`HarnessError`] from driving the agent (see `run_step`).
    pub async fn run(&self, prompt: &str) -> Result<Vec<HarnessEvent>, HarnessError> {
        let (tx, _rx) = mpsc::channel();
        self.run_step(&StepConfig::default(), prompt, None, &tx)
            .await
    }

    /// Hand-drive `AgentRun` for one step: build the request, call the model,
    /// gate + dispatch tools, enforce budget/cancel, mapping each step to a
    /// [`HarnessEvent`].
    ///
    /// Every event is sent through `tx` as it happens, enabling real-time UI
    /// updates while the run is in progress. If the receiver has been dropped,
    /// sends are silently ignored.
    ///
    /// # Errors
    /// Returns [`HarnessError`] on a model/completion failure, a budget overflow,
    /// or an `AgentRun` protocol error.
    ///
    /// # Panics
    /// Panics if `assemble_request` yields no messages, which never happens — it
    /// always produces at least the user turn used as the prompt.
    pub async fn run_step(
        &self,
        step: &StepConfig,
        task: &str,
        handoff: Option<&str>,
        tx: &mpsc::Sender<HarnessEvent>,
    ) -> Result<Vec<HarnessEvent>, HarnessError> {
        let mut events = Vec::new();
        let mut total_tokens: u64 = 0;

        let mut messages = assemble_request(step, task, handoff);
        let prompt = messages
            .pop()
            .expect("assemble_request always yields a user turn");

        let mut run = AgentRun::new(prompt).max_turns(self.config.max_turns);
        if !messages.is_empty() {
            run = run.with_history(messages);
        }

        loop {
            if self.cancel_token.is_cancelled() {
                let ev = HarnessEvent::Cancelled;
                let _ = tx.send(ev.clone());
                events.push(ev);
                return Ok(events);
            }

            let step = run
                .next_step()
                .map_err(|e| HarnessError::AgentRun(e.to_string()))?;

            match step {
                AgentRunStep::CallModel {
                    prompt, history, ..
                } => {
                    let turn = run.turn();
                    let ev = HarnessEvent::ModelCall { turn };
                    let _ = tx.send(ev.clone());
                    events.push(ev);

                    let (model_turn, usage) = self.stream_model_turn(prompt, history, tx).await?;
                    total_tokens += usage.total_tokens;
                    if total_tokens > self.config.token_budget {
                        return Err(HarnessError::BudgetExceeded {
                            used: total_tokens,
                            budget: self.config.token_budget,
                        });
                    }

                    run.model_response(model_turn)
                        .map_err(|e| HarnessError::AgentRun(e.to_string()))?;
                }

                AgentRunStep::CallTools { calls } => {
                    self.dispatch_tools(&calls, &mut run, tx, &mut events)
                        .await?;
                }

                AgentRunStep::Done(response) => {
                    let ev = HarnessEvent::Done {
                        output: response.output.clone(),
                        usage: run.usage(),
                    };
                    let _ = tx.send(ev.clone());
                    events.push(ev);
                    return Ok(events);
                }
            }
        }
    }

    /// Call the model with streaming, forwarding text chunks through `tx`.
    async fn stream_model_turn(
        &self,
        prompt: Message,
        history: Vec<Message>,
        tx: &mpsc::Sender<HarnessEvent>,
    ) -> Result<(ModelTurn, Usage), HarnessError> {
        let request = self.model.completion_request(prompt);
        let tool_defs = self
            .toolset
            .get_tool_definitions()
            .await
            .map_err(|e| HarnessError::AgentRun(e.to_string()))?;

        let mut stream = request
            .messages(history)
            .tools(tool_defs.clone())
            .stream()
            .await
            .map_err(|e| HarnessError::AgentRun(e.to_string()))?;

        while let Some(chunk) = stream.next().await {
            match chunk {
                Ok(StreamedAssistantContent::Text(text)) => {
                    let ev = HarnessEvent::TextChunk { text: text.text };
                    let _ = tx.send(ev.clone());
                }
                Ok(_) => {}
                Err(e) => return Err(HarnessError::AgentRun(e.to_string())),
            }
        }

        let usage = stream
            .response
            .as_ref()
            .map(GetTokenUsage::token_usage)
            .unwrap_or_default();
        let executable: BTreeSet<String> = tool_defs.iter().map(|d| d.name.clone()).collect();
        let allowed = executable.clone();

        let model_turn = ModelTurn::new(
            stream.message_id.clone(),
            stream.choice.clone(),
            usage,
            executable,
            allowed,
        );
        Ok((model_turn, usage))
    }

    /// Dispatch tool calls and forward results through `tx`.
    async fn dispatch_tools(
        &self,
        calls: &[rig::agent::run::PendingToolCall],
        run: &mut AgentRun,
        tx: &mpsc::Sender<HarnessEvent>,
        events: &mut Vec<HarnessEvent>,
    ) -> Result<(), HarnessError> {
        let mut results = Vec::new();

        for pending in calls {
            let tc = &pending.tool_call;
            let ev = HarnessEvent::ToolCall {
                name: tc.function.name.clone(),
                args: tc.function.arguments.to_string(),
            };
            let _ = tx.send(ev.clone());
            events.push(ev);

            let result = self
                .toolset
                .call(&tc.function.name, tc.function.arguments.to_string())
                .await
                .map_err(|e| HarnessError::AgentRun(e.to_string()))?;

            let (result_str, truncated) = if result.len() > self.config.tool_output_limit {
                (result[..self.config.tool_output_limit].to_string(), true)
            } else {
                (result, false)
            };

            let ev = HarnessEvent::ToolResult {
                name: tc.function.name.clone(),
                result: result_str.clone(),
                truncated,
            };
            let _ = tx.send(ev.clone());
            events.push(ev);

            results.push(UserContent::tool_result(
                tc.id.clone(),
                OneOrMany::one(rig::message::ToolResultContent::text(result_str)),
            ));
        }

        run.tool_results(results)
            .map_err(|e| HarnessError::AgentRun(e.to_string()))
    }
}
