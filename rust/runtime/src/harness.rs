use std::collections::BTreeSet;
use std::sync::mpsc;

use futures::StreamExt;
use pipeline::compiler::StepConfig;
use rig::OneOrMany;
use rig::agent::run::{AgentRun, AgentRunStep, ModelTurn};
use rig::completion::{CompletionModel, GetTokenUsage, ToolDefinition, Usage};
use rig::message::{Message, UserContent};
use rig::streaming::StreamedAssistantContent;
use rig::tool::ToolSet;
use tokio_util::sync::CancellationToken;

use crate::step::assemble_request;

/// A no-op epilogue resolver for `run_step` callers with no workflow exits to
/// check (the convenience `run`, harness-only panels, unit tests). Never triggers
/// a mid-run boundary, so the agent runs to its natural `Done`.
// The signature must match the `run_step` resolver callback exactly (default
// hasher), so it cannot be generalized over the hasher.
#[allow(
    clippy::implicit_hasher,
    reason = "must match run_step's resolver signature"
)]
#[must_use]
pub fn no_epilogue(
    _state: &std::collections::HashMap<String, serde_json::Value>,
) -> Option<String> {
    None
}

/// Sum the headline token counts of two rig `Usage` records. Folds the
/// live-session epilogue turn's usage (which runs outside the `AgentRun`) back
/// into the stage total; other `Usage` fields keep `base`'s values.
fn add_usage(base: Usage, extra: &Usage) -> Usage {
    Usage {
        input_tokens: base.input_tokens + extra.input_tokens,
        output_tokens: base.output_tokens + extra.output_tokens,
        total_tokens: base.total_tokens + extra.total_tokens,
        ..base
    }
}

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
        /// Deterministic state deltas published by this step's tool calls
        /// (`ToolResult.state`), merged in call order. This is the only state a
        /// step contributes to routing — the model's prose never sets state.
        state: std::collections::HashMap<String, serde_json::Value>,
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
        self.run_step(&StepConfig::default(), prompt, None, &no_epilogue, &tx)
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
        resolve_epilogue: &(
             dyn Fn(&std::collections::HashMap<String, serde_json::Value>) -> Option<String> + Sync
         ),
        tx: &mpsc::Sender<HarnessEvent>,
    ) -> Result<Vec<HarnessEvent>, HarnessError> {
        let mut events = Vec::new();
        let mut total_tokens: u64 = 0;
        // Deterministic state deltas published by this step's tool calls.
        let mut state_acc: std::collections::HashMap<String, serde_json::Value> =
            std::collections::HashMap::new();

        // Surface the contributed tools in the prompt (in addition to the
        // provider's native tool field) so the model sees its capabilities.
        // A non-empty `step.tools` scopes this step to just those tools, so a
        // stage can be granted a tool another stage is denied.
        let all_defs = self
            .toolset
            .get_tool_definitions()
            .await
            .map_err(|e| HarnessError::AgentRun(e.to_string()))?;
        let allowed: BTreeSet<String> = allowed_tool_names(&all_defs, step);
        let tool_defs: Vec<ToolDefinition> = all_defs
            .into_iter()
            .filter(|d| allowed.contains(&d.name))
            .collect();

        let mut messages = assemble_request(step, task, handoff, &tool_defs);
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

                    let (model_turn, usage) = self
                        .stream_model_turn(prompt, history, &tool_defs, tx)
                        .await?;
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
                    self.dispatch_tools(&calls, &mut run, tx, &mut events, &mut state_acc)
                        .await?;

                    // Boundary check: the in-flight tool batch just finished. If a
                    // real (non-fallback) exit guard is now satisfied, halt the
                    // agent's own agenda here, ask it the transition epilogue in
                    // the SAME session, and hand its response forward.
                    if let Some(epilogue) = resolve_epilogue(&state_acc) {
                        let history = run.full_history();
                        let (output, epi_usage) = self
                            .epilogue_turn(history, &epilogue, &tool_defs, &mut total_tokens, tx)
                            .await?;
                        // The epilogue follow-up turn runs outside the AgentRun, so
                        // its usage isn't in run.usage() — add it back so the stage
                        // bills the full cost (agenda turns + epilogue turn).
                        let ev = HarnessEvent::Done {
                            output,
                            usage: add_usage(run.usage(), &epi_usage),
                            state: state_acc.clone(),
                        };
                        let _ = tx.send(ev.clone());
                        events.push(ev);
                        return Ok(events);
                    }
                }

                AgentRunStep::Done(response) => {
                    let ev = HarnessEvent::Done {
                        output: response.output.clone(),
                        usage: run.usage(),
                        state: state_acc.clone(),
                    };
                    let _ = tx.send(ev.clone());
                    events.push(ev);
                    return Ok(events);
                }
            }
        }
    }

    /// Call the model with streaming, forwarding text chunks through `tx`.
    /// `tool_defs` is the pre-filtered list from `run_step` (already scoped to
    /// this step's allowed tools).
    async fn stream_model_turn(
        &self,
        prompt: Message,
        history: Vec<Message>,
        tool_defs: &[ToolDefinition],
        tx: &mpsc::Sender<HarnessEvent>,
    ) -> Result<(ModelTurn, Usage), HarnessError> {
        let request = self.model.completion_request(prompt);

        let mut stream = request
            .messages(history)
            .tools(tool_defs.to_vec())
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

    /// Ask the finishing agent the transition epilogue in its live session and
    /// return its text response — the handoff for the next stage. `history` is the
    /// agent's full conversation so far (so it answers with full working context);
    /// `epilogue` becomes a new user turn. One model turn, text only — tool calls
    /// in the response are ignored (this is a summary/handoff, not more work).
    /// `tool_defs` is the pre-filtered list from `run_step`.
    async fn epilogue_turn(
        &self,
        history: Vec<Message>,
        epilogue: &str,
        tool_defs: &[ToolDefinition],
        total_tokens: &mut u64,
        tx: &mpsc::Sender<HarnessEvent>,
    ) -> Result<(String, Usage), HarnessError> {
        let prompt = Message::user(epilogue);
        let ev = HarnessEvent::ModelCall { turn: 0 };
        let _ = tx.send(ev.clone());

        let request = self.model.completion_request(prompt);

        let mut stream = request
            .messages(history)
            .tools(tool_defs.to_vec())
            .stream()
            .await
            .map_err(|e| HarnessError::AgentRun(e.to_string()))?;

        let mut output = String::new();
        while let Some(chunk) = stream.next().await {
            match chunk {
                Ok(StreamedAssistantContent::Text(text)) => {
                    output.push_str(&text.text);
                    let _ = tx.send(HarnessEvent::TextChunk { text: text.text });
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
        *total_tokens += usage.total_tokens;
        if *total_tokens > self.config.token_budget {
            return Err(HarnessError::BudgetExceeded {
                used: *total_tokens,
                budget: self.config.token_budget,
            });
        }

        Ok((output, usage))
    }

    /// Dispatch tool calls and forward results through `tx`. Deterministic state
    /// deltas published by each tool (`ToolResult.state`) are merged into
    /// `state_acc` in call order — this is how a tool feeds routing state.
    async fn dispatch_tools(
        &self,
        calls: &[rig::agent::run::PendingToolCall],
        run: &mut AgentRun,
        tx: &mpsc::Sender<HarnessEvent>,
        events: &mut Vec<HarnessEvent>,
        state_acc: &mut std::collections::HashMap<String, serde_json::Value>,
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

            // The bridge serializes ToolResult to JSON (incl. a `state` object of
            // deterministic deltas). Recover that object generically — runtime
            // does not depend on the `tools` crate — and merge it in call order.
            if let Ok(serde_json::Value::Object(obj)) =
                serde_json::from_str::<serde_json::Value>(&result)
                && let Some(serde_json::Value::Object(state)) = obj.get("state")
            {
                for (k, v) in state {
                    state_acc.insert(k.clone(), v.clone());
                }
            }

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

/// The tool names a step is allowed to use. An empty `step.tools` means "all
/// contributed tools" (the default); a non-empty list scopes the step to just
/// those names, so a stage can be granted a tool another stage is denied.
fn allowed_tool_names(all_defs: &[ToolDefinition], step: &StepConfig) -> BTreeSet<String> {
    if step.tools.is_empty() {
        all_defs.iter().map(|d| d.name.clone()).collect()
    } else {
        step.tools.iter().cloned().collect()
    }
}

#[cfg(test)]
mod tests {
    use super::allowed_tool_names;
    use pipeline::compiler::StepConfig;
    use rig::completion::ToolDefinition;

    fn def(name: &str) -> ToolDefinition {
        ToolDefinition {
            name: name.to_string(),
            description: String::new(),
            parameters: serde_json::json!({}),
        }
    }

    #[test]
    fn empty_step_tools_allows_all_contributed_tools() {
        let all = [
            def("read_context"),
            def("write_context"),
            def("increment_counter"),
        ];
        let step = StepConfig::default(); // tools: []
        let allowed = allowed_tool_names(&all, &step);
        assert_eq!(allowed.len(), 3);
        assert!(allowed.contains("increment_counter"));
    }

    #[test]
    fn non_empty_step_tools_scopes_to_just_those() {
        // A `memory_weaver`-style step: context tools only, NO counter.
        let all = [
            def("read_context"),
            def("write_context"),
            def("increment_counter"),
        ];
        let step = StepConfig {
            tools: vec!["read_context".into(), "write_context".into()],
            ..StepConfig::default()
        };
        let allowed = allowed_tool_names(&all, &step);
        assert!(allowed.contains("read_context"));
        assert!(allowed.contains("write_context"));
        assert!(
            !allowed.contains("increment_counter"),
            "weaver must not be granted the counter"
        );
    }
}
