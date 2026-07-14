use std::path::PathBuf;

use async_trait::async_trait;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ToolResult {
    pub ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub output: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    /// Deterministic state deltas this tool publishes into the workflow run
    /// state. This — not the model's text — is the ONLY way routing state is set:
    /// guards (e.g. `count >= 3`) evaluate over state fed by real tool outcomes,
    /// never by anything the agent asserts. Empty for tools with no state effect.
    #[serde(default, skip_serializing_if = "std::collections::HashMap::is_empty")]
    pub state: std::collections::HashMap<String, serde_json::Value>,
}

impl ToolResult {
    pub fn ok(output: impl Into<String>) -> Self {
        Self {
            ok: true,
            output: Some(output.into()),
            error: None,
            state: std::collections::HashMap::new(),
        }
    }

    pub fn fail(error: impl Into<String>) -> Self {
        Self {
            ok: false,
            output: None,
            error: Some(error.into()),
            state: std::collections::HashMap::new(),
        }
    }

    /// Attach a deterministic state delta (builder style): `key` is set to
    /// `value` in the run state when this tool result is processed.
    #[must_use]
    pub fn with_state(mut self, key: impl Into<String>, value: serde_json::Value) -> Self {
        self.state.insert(key.into(), value);
        self
    }
}

#[derive(Debug, Clone)]
pub struct ToolContext {
    pub cwd: PathBuf,
}

impl ToolContext {
    pub fn new(cwd: impl Into<PathBuf>) -> Self {
        Self { cwd: cwd.into() }
    }
}

#[derive(Debug, thiserror::Error)]
pub enum ToolError {
    #[error("argument validation failed: {0}")]
    Validation(#[from] serde_json::Error),
    #[error("tool execution failed: {0}")]
    Execution(String),
}

#[async_trait]
pub trait Tool: Send + Sync {
    fn name(&self) -> &str;
    fn description(&self) -> &str;
    fn schema(&self) -> serde_json::Value;
    async fn execute(
        &self,
        args: serde_json::Value,
        ctx: &ToolContext,
    ) -> Result<ToolResult, ToolError>;

    /// The workflow state keys this tool controls, each with an initial value.
    /// A tool is the AUTHORITY for the keys it publishes (via [`ToolResult::state`]):
    /// `increment_counter` produces `("count", 0)` because it owns `count`. The
    /// system auto-seeds these keys and validates that exit guards only read keys
    /// some in-scope tool produces. Default: produces nothing.
    fn produces(&self) -> Vec<(String, serde_json::Value)> {
        Vec::new()
    }
}
