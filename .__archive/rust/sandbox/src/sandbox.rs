use std::path::PathBuf;

use async_trait::async_trait;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone)]
pub struct SandboxCommand {
    pub program: PathBuf,
    pub args: Vec<String>,
    pub env: Vec<(String, String)>,
    pub preopens: Vec<(PathBuf, String)>,
}

impl SandboxCommand {
    #[must_use]
    pub fn new(program: impl Into<PathBuf>) -> Self {
        Self {
            program: program.into(),
            args: Vec::new(),
            env: Vec::new(),
            preopens: Vec::new(),
        }
    }

    #[must_use]
    pub fn arg(mut self, arg: impl Into<String>) -> Self {
        self.args.push(arg.into());
        self
    }

    #[must_use]
    pub fn env(mut self, key: impl Into<String>, value: impl Into<String>) -> Self {
        self.env.push((key.into(), value.into()));
        self
    }

    #[must_use]
    pub fn preopen(mut self, host_path: impl Into<PathBuf>, guest_path: impl Into<String>) -> Self {
        self.preopens.push((host_path.into(), guest_path.into()));
        self
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct SandboxOutput {
    pub stdout: String,
    pub stderr: String,
    pub exit_code: i32,
}

#[derive(Debug, thiserror::Error)]
pub enum SandboxError {
    #[error("sandbox setup failed: {0}")]
    Setup(String),
    #[error("module compilation failed: {0}")]
    Compile(String),
    #[error("execution failed: {0}")]
    Exec(String),
    #[error("program not found: {0}")]
    NotFound(PathBuf),
}

#[async_trait]
pub trait Sandbox: Send + Sync {
    /// Run `command` inside the sandbox boundary.
    ///
    /// # Errors
    /// Returns [`SandboxError`] on setup, module compilation, execution failure,
    /// or a missing program.
    async fn exec(&self, command: SandboxCommand) -> Result<SandboxOutput, SandboxError>;
}
