//! Sub-agents: a stage's agent can spawn a **leaf** sub-agent from a named
//! template. Templates declare a *ceiling* of permissions (tool allowlist,
//! write-glob ceiling, optional model); the parent may narrow at spawn time but
//! never exceed the ceiling. Sub-agents are one level deep — the leaf's toolset
//! never includes `spawn_subagent`, so it cannot spawn further sub-agents.
//!
//! **`ask_parent`**: the leaf runs on its own task, concurrently with the parent.
//! `spawn_subagent` does not block on the full leaf run — it drives a select loop
//! between "leaf finished" and "leaf asked a question". When the leaf calls
//! `ask_parent(question)`, the loop runs one parent-model turn to answer it and
//! replies to the leaf, then continues. If the parent side is dropped (gave up /
//! over budget), the leaf's `ask_parent` returns an error result and the leaf
//! continues — no deadlock (the tool-timeout/cancel-at-boundary contract).

use std::collections::BTreeSet;
use std::sync::Arc;

use pipeline::compiler::SubAgentTemplate;
use rig::completion::CompletionModel;
use rig::tool::ToolSet;
use schemars::JsonSchema;
use serde::Deserialize;
use tokio::sync::{mpsc as tmpsc, oneshot};
use tools::{RigToolBridge, Tool, ToolContext, ToolError, ToolResult, define_tool};

use crate::harness::{Harness, HarnessConfig, no_epilogue};

/// Errors from [`resolve_permissions`] when a parent agent requests capabilities
/// beyond its template's ceiling.
#[derive(Debug, thiserror::Error)]
pub enum PermissionError {
    #[error("sub-agent `{name}` requested tools not in its ceiling: {tools:?}")]
    ExceededTools { name: String, tools: Vec<String> },
    #[error("sub-agent `{name}` requested write_globs not in its ceiling: {globs:?}")]
    ExceededGlobs { name: String, globs: Vec<String> },
}

/// A question the leaf sub-agent asks its parent, with a one-shot channel for the
/// answer. Sent over the ask-channel `spawn_subagent` listens on.
struct AskRequest {
    question: String,
    reply: oneshot::Sender<String>,
}

/// Arguments the parent agent passes when calling `spawn_subagent`.
#[derive(Debug, Clone, JsonSchema, Deserialize)]
pub struct SpawnArgs {
    /// Name of a sub-agent template declared on the current stage.
    pub template: String,
    /// The task/instructions handed to the sub-agent as its prompt.
    pub task: String,
    /// Optional narrowing of the template's tool allowlist. Must be a subset of
    /// the template's `tools` ceiling; omitting it uses the full ceiling.
    #[serde(default)]
    pub tools: Option<Vec<String>>,
    /// Optional narrowing of the template's write-glob ceiling. Must be a subset
    /// of the template's `write_globs`; omitting it uses the full ceiling.
    #[serde(default)]
    pub write_globs: Option<Vec<String>>,
}

/// Resolve the effective permissions for a spawn: the requested narrowing
/// intersected against (and validated ⊆) the template's ceiling. Returns an error
/// if the parent tries to exceed the ceiling (a permission escalation).
///
/// # Errors
/// Returns [`PermissionError::ExceededTools`] or [`PermissionError::ExceededGlobs`]
/// if the parent requests capabilities beyond the template's ceiling.
pub fn resolve_permissions(
    template: &SubAgentTemplate,
    requested_tools: Option<&[String]>,
    requested_globs: Option<&[String]>,
) -> Result<(Vec<String>, Vec<String>), PermissionError> {
    let ceiling_tools: BTreeSet<&String> = template.tools.iter().collect();
    let tools = match requested_tools {
        None => template.tools.clone(),
        Some(req) => {
            let exceeded: Vec<String> = req
                .iter()
                .filter(|t| !ceiling_tools.contains(t))
                .cloned()
                .collect();
            if !exceeded.is_empty() {
                return Err(PermissionError::ExceededTools {
                    name: template.name.clone(),
                    tools: exceeded,
                });
            }
            req.to_vec()
        }
    };

    let ceiling_globs: BTreeSet<&String> = template.write_globs.iter().collect();
    let write_globs = match requested_globs {
        None => template.write_globs.clone(),
        Some(req) => {
            let exceeded: Vec<String> = req
                .iter()
                .filter(|g| !ceiling_globs.contains(g))
                .cloned()
                .collect();
            if !exceeded.is_empty() {
                return Err(PermissionError::ExceededGlobs {
                    name: template.name.clone(),
                    globs: exceeded,
                });
            }
            req.to_vec()
        }
    };

    Ok((tools, write_globs))
}

/// Arguments for the leaf's `ask_parent` tool.
#[derive(Debug, Clone, JsonSchema, Deserialize)]
struct AskArgs {
    /// The question to ask the parent agent.
    question: String,
}

/// Build the leaf-only `ask_parent` tool. Its handler sends the question over the
/// ask-channel and awaits the parent's answer; if the parent side is gone (the
/// `oneshot` is dropped), it returns an error result so the leaf continues rather
/// than hanging — the no-deadlock contract.
fn ask_parent_tool(ask_tx: tmpsc::Sender<AskRequest>) -> Arc<dyn Tool> {
    define_tool(
        "ask_parent",
        "Ask your parent agent a question and get its answer. Use this when you \
         need a decision or clarification only the parent can provide.",
        move |args: AskArgs, _ctx: &ToolContext| {
            let ask_tx = ask_tx.clone();
            async move {
                let (reply, answer) = oneshot::channel();
                if ask_tx
                    .send(AskRequest {
                        question: args.question,
                        reply,
                    })
                    .await
                    .is_err()
                {
                    return Err(ToolError::Execution(
                        "parent is no longer available to answer".into(),
                    ));
                }
                match answer.await {
                    Ok(text) => Ok(ToolResult::ok(text)),
                    Err(_) => Err(ToolError::Execution(
                        "parent did not answer (gave up or over budget)".into(),
                    )),
                }
            }
        },
    )
    .build()
}

/// Run one parent-model turn to answer a sub-agent's question. Tool-free, one
/// shot: the parent's model replies to `question` carried in the context of the
/// `parent_task` it delegated. Returns the answer text (or an error string).
async fn parent_answer<M>(
    model: M,
    parent_task: &str,
    question: &str,
    config: HarnessConfig,
) -> String
where
    M: CompletionModel + Clone + Send + Sync + 'static,
{
    let prompt = format!(
        "You delegated this task to a sub-agent: {parent_task}\n\nThe sub-agent asks: \
         {question}\n\nAnswer concisely so it can continue."
    );
    let harness = Harness::new(model, ToolSet::default(), config);
    match harness.run(&prompt).await {
        Ok(events) => events
            .iter()
            .rev()
            .find_map(|e| match e {
                crate::harness::HarnessEvent::Done { output, .. } => Some(output.clone()),
                _ => None,
            })
            .unwrap_or_default(),
        Err(e) => format!("(parent could not answer: {e})"),
    }
}

/// Build the `spawn_subagent` tool for a stage that declares `sub_agents`.
///
/// The returned tool captures the parent's `model` (cloned per spawn for the leaf
/// session), the stage's `templates`, and the pool of `leaf_tools` a sub-agent may
/// be granted (already excluding `spawn_subagent` itself — that is how one level
/// deep is enforced). When called it validates the requested narrowing against the
/// named template's ceiling, builds a fresh leaf `Harness` (plus an `ask_parent`
/// tool) running on its own task, and drives a select loop: answer each
/// `ask_parent` with a parent-model turn, and return the leaf's output when it
/// finishes.
#[must_use]
pub fn spawn_subagent_tool<M>(
    model: M,
    templates: Vec<SubAgentTemplate>,
    leaf_tools: Vec<Arc<dyn Tool>>,
    leaf_ctx: ToolContext,
    config: HarnessConfig,
) -> Arc<dyn Tool>
where
    M: CompletionModel + Clone + Send + Sync + 'static,
{
    let names: Vec<&str> = templates.iter().map(|t| t.name.as_str()).collect();
    // `define_tool` requires a `&'static str` description, so this is leaked once
    // per stage setup (not per spawn).
    let description = Box::leak(
        format!(
            "Spawn a leaf sub-agent from one of these templates to do a focused \
             sub-task, returning its result. Templates: {names:?}. Sub-agents \
             cannot spawn further sub-agents."
        )
        .into_boxed_str(),
    );

    define_tool(
        "spawn_subagent",
        description,
        move |args: SpawnArgs, _ctx: &ToolContext| {
            // Clone everything the 'static future needs.
            let model = model.clone();
            let templates = templates.clone();
            let leaf_tools = leaf_tools.clone();
            let leaf_ctx = leaf_ctx.clone();
            let config = config.clone();
            async move {
                let Some(template) = templates.iter().find(|t| t.name == args.template).cloned()
                else {
                    return Err(ToolError::Execution(format!(
                        "unknown sub-agent template `{}`",
                        args.template
                    )));
                };

                let (granted_tools, _write_globs) = resolve_permissions(
                    &template,
                    args.tools.as_deref(),
                    args.write_globs.as_deref(),
                )
                .map_err(|e| ToolError::Execution(e.to_string()))?;

                // The ask-channel: the leaf's `ask_parent` sends questions here;
                // this spawn loop answers them with parent-model turns.
                let (ask_tx, mut ask_rx) = tmpsc::channel::<AskRequest>(4);

                // Leaf toolset: the granted tools (⊆ ceiling) + `ask_parent`.
                // `spawn_subagent` is never in `leaf_tools`, so the leaf stays a
                // true leaf (one level deep).
                let allow: BTreeSet<String> = granted_tools.into_iter().collect();
                let mut toolset = ToolSet::default();
                for tool in &leaf_tools {
                    if allow.contains(tool.name()) {
                        toolset
                            .add_tool(RigToolBridge::new(tool.clone(), Arc::new(leaf_ctx.clone())));
                    }
                }
                toolset.add_tool(RigToolBridge::new(
                    ask_parent_tool(ask_tx),
                    Arc::new(leaf_ctx.clone()),
                ));

                // Drive the leaf future and the ask-channel in the SAME select loop
                // (no `tokio::spawn` — that needs the tokio reactor, but the demo's
                // selfcheck runs under `pollster`; `tokio::select!` + tokio's sync
                // channels are pure futures that work under any executor). The leaf
                // holds the only `ask_tx` sender, so when it finishes the channel
                // closes and `ask_rx.recv()` yields None.
                let leaf_harness = Harness::new(model.clone(), toolset, config.clone());
                let leaf_step_config = leaf_step(&template);
                let leaf_sink = mpsc_sink();
                let leaf_fut = leaf_harness.run_step(
                    &leaf_step_config,
                    &args.task,
                    None,
                    &no_epilogue,
                    &leaf_sink,
                );
                tokio::pin!(leaf_fut);

                loop {
                    tokio::select! {
                        done = &mut leaf_fut => {
                            let events = done.map_err(|e| ToolError::Execution(e.to_string()))?;
                            let output = events
                                .iter()
                                .rev()
                                .find_map(|e| match e {
                                    crate::harness::HarnessEvent::Done { output, .. } => {
                                        Some(output.clone())
                                    }
                                    _ => None,
                                })
                                .unwrap_or_default();
                            return Ok(ToolResult::ok(output));
                        }
                        Some(ask) = ask_rx.recv() => {
                            let answer =
                                parent_answer(model.clone(), &args.task, &ask.question, config.clone())
                                    .await;
                            // If the leaf dropped its receiver, ignore the send error.
                            let _ = ask.reply.send(answer);
                        }
                    }
                }
            }
        },
    )
    .build()
}

/// The leaf sub-agent's step config: model override from the template, no further
/// sub-agents (one level deep). Tool gating is applied via the leaf toolset.
fn leaf_step(template: &SubAgentTemplate) -> pipeline::compiler::StepConfig {
    pipeline::compiler::StepConfig {
        prologue: Some(format!(
            "You are the `{}` sub-agent. Complete the task and report the result \
             concisely. You cannot spawn further sub-agents.",
            template.name
        )),
        ..Default::default()
    }
}

/// A throwaway channel sender so the leaf run can emit `HarnessEvent`s without a
/// consumer (the parent only needs the final output, returned as the tool result).
fn mpsc_sink() -> std::sync::mpsc::Sender<crate::harness::HarnessEvent> {
    let (tx, _rx) = std::sync::mpsc::channel();
    tx
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{MockClient, MockCompletionModel, MockResponse, MockToolCall};

    fn template(name: &str, tools: &[&str], globs: &[&str]) -> SubAgentTemplate {
        SubAgentTemplate {
            name: name.to_string(),
            model: None,
            tools: tools.iter().map(ToString::to_string).collect(),
            write_globs: globs.iter().map(ToString::to_string).collect(),
        }
    }

    #[test]
    fn narrowing_within_ceiling_is_allowed() {
        let t = template("researcher", &["fs_read", "fs_grep"], &[]);
        let (tools, globs) =
            resolve_permissions(&t, Some(&["fs_read".to_string()]), None).expect("ok");
        assert_eq!(tools, vec!["fs_read".to_string()]);
        assert!(globs.is_empty());
    }

    #[test]
    fn omitting_narrowing_uses_the_full_ceiling() {
        let t = template("researcher", &["fs_read", "fs_grep"], &["**/*.md"]);
        let (tools, globs) = resolve_permissions(&t, None, None).expect("ok");
        assert_eq!(tools.len(), 2);
        assert_eq!(globs, vec!["**/*.md".to_string()]);
    }

    #[test]
    fn requesting_a_tool_outside_the_ceiling_is_rejected() {
        let t = template("researcher", &["fs_read"], &[]);
        // fs_write is NOT in the ceiling -> escalation -> error.
        let err = resolve_permissions(&t, Some(&["fs_write".to_string()]), None).unwrap_err();
        assert!(
            matches!(&err, PermissionError::ExceededTools { tools, .. } if tools.contains(&"fs_write".to_string())),
            "got: {err}"
        );
    }

    #[test]
    fn requesting_a_write_glob_outside_the_ceiling_is_rejected() {
        let t = template("tester", &["fs_write"], &["**/*.test.ts"]);
        let err = resolve_permissions(&t, None, Some(&["src/**/*.rs".to_string()])).unwrap_err();
        assert!(
            matches!(&err, PermissionError::ExceededGlobs { globs, .. } if globs.contains(&"src/**/*.rs".to_string())),
            "got: {err}"
        );
    }

    #[tokio::test]
    async fn spawn_runs_a_leaf_and_returns_its_output() {
        // Leaf model replies with a fixed line; the spawn tool returns it.
        let client = MockClient::new(vec![MockResponse {
            content: "sub-agent result: found 3 files".into(),
            tool_calls: vec![],
        }]);
        let model = MockCompletionModel::make(&client, "mock-model");
        let templates = vec![template("researcher", &[], &[])];
        let tool = spawn_subagent_tool(
            model,
            templates,
            vec![],
            ToolContext::new("/tmp/wt"),
            HarnessConfig::default(),
        );

        let ctx = ToolContext::new("/tmp/wt");
        let out = tool
            .execute(
                serde_json::json!({ "template": "researcher", "task": "count files" }),
                &ctx,
            )
            .await
            .expect("spawn ok");
        assert_eq!(
            out.output.as_deref(),
            Some("sub-agent result: found 3 files")
        );
    }

    #[tokio::test]
    async fn leaf_can_ask_parent_and_gets_an_answer() {
        // Shared mock client (leaf and parent answer use the same captured model),
        // so responses are consumed in call order:
        //   call 0 = leaf turn 1: call ask_parent
        //   call 1 = parent_answer turn
        //   call 2 = leaf turn 2: final reply incorporating the answer
        let client = MockClient::new(vec![
            MockResponse {
                content: "let me check with the parent".into(),
                tool_calls: vec![MockToolCall {
                    id: "a1".into(),
                    name: "ask_parent".into(),
                    arguments: serde_json::json!({ "question": "which dir?" }),
                }],
            },
            MockResponse {
                content: "use the src/ directory".into(),
                tool_calls: vec![],
            },
            MockResponse {
                content: "done: surveyed src/".into(),
                tool_calls: vec![],
            },
        ]);
        let model = MockCompletionModel::make(&client, "mock-model");
        let tool = spawn_subagent_tool(
            model,
            vec![template("researcher", &[], &[])],
            vec![],
            ToolContext::new("/tmp/wt"),
            HarnessConfig::default(),
        );
        let ctx = ToolContext::new("/tmp/wt");
        let out = tool
            .execute(
                serde_json::json!({ "template": "researcher", "task": "survey the code" }),
                &ctx,
            )
            .await
            .expect("spawn ok");
        // The leaf finished after asking the parent and using the answer.
        assert_eq!(out.output.as_deref(), Some("done: surveyed src/"));
    }

    #[tokio::test]
    async fn spawning_an_unknown_template_errors() {
        let client = MockClient::new(vec![MockResponse {
            content: "x".into(),
            tool_calls: vec![],
        }]);
        let model = MockCompletionModel::make(&client, "mock-model");
        let tool = spawn_subagent_tool(
            model,
            vec![template("researcher", &[], &[])],
            vec![],
            ToolContext::new("/tmp/wt"),
            HarnessConfig::default(),
        );
        let ctx = ToolContext::new("/tmp/wt");
        let err = tool
            .execute(
                serde_json::json!({ "template": "ghostwriter", "task": "x" }),
                &ctx,
            )
            .await
            .unwrap_err();
        assert!(matches!(err, ToolError::Execution(m) if m.contains("ghostwriter")));
    }

    #[test]
    fn spawn_tool_is_named_for_one_level_enforcement() {
        // The tool the parent gets is `spawn_subagent`; the leaf toolset is built
        // from `leaf_tools` which never contains it, so a leaf cannot re-spawn.
        let client = MockClient::new(vec![]);
        let model = MockCompletionModel::make(&client, "mock-model");
        let tool = spawn_subagent_tool(
            model,
            vec![template("researcher", &[], &[])],
            vec![],
            ToolContext::new("/tmp/wt"),
            HarnessConfig::default(),
        );
        assert_eq!(tool.name(), "spawn_subagent");
    }
}
