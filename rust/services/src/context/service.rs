//! `ContextService` — a tiny persistent scratchpad the agent and the
//! orchestrator share across a loop. The memory-weaver stage writes learnings to
//! `<cwd>/.workhorse/context.md`; later stages read them back (the orchestrator
//! also folds the file into each stage's handoff).
//!
//! This is the **file-channel** half of the memory-weaver design. The other half
//! — a semantic/vector index the weaver populates and the agent queries (a
//! future `query_memory` tool backed by embeddings/BM25) — is a deliberate
//! follow-up, not built here. The file channel alone is enough to make a Ralph
//! loop converge: the weaver records "what was learned / where we are" and the
//! next iteration reads it instead of starting over.

use std::path::{Path, PathBuf};
use std::sync::Arc;

use schemars::JsonSchema;
use serde::Deserialize;
use tools::{ToolContext, ToolResult, define_tool};

use crate::service::{Contribution, Service};

/// Relative path of the shared context file: `.workhorse/context.md`.
pub const CONTEXT_SUBPATH: &str = ".workhorse/context.md";

/// An error reading or writing the context file.
#[derive(Debug, thiserror::Error)]
pub enum ContextError {
    /// Creating the directory or reading/writing the file failed.
    #[error("context io failed: {0}")]
    Io(#[from] std::io::Error),
}

/// A service exposing a shared `context.md` scratchpad as `read_context` /
/// `write_context` tools, and a direct API the orchestrator uses to seed prompts.
pub struct ContextService {
    cwd: PathBuf,
}

impl ContextService {
    /// Create a service rooted at `cwd` (the context file is `<cwd>/.workhorse/context.md`).
    #[must_use]
    pub fn new(cwd: impl Into<PathBuf>) -> Arc<Self> {
        Arc::new(Self { cwd: cwd.into() })
    }

    /// Absolute path of the context file.
    #[must_use]
    pub fn path(&self) -> PathBuf {
        context_path(&self.cwd)
    }

    /// Read the current context, or an empty string if it does not exist yet.
    #[must_use]
    pub fn read(&self) -> String {
        std::fs::read_to_string(self.path()).unwrap_or_default()
    }

    /// Write (or append to) the context file, creating the directory if needed.
    ///
    /// # Errors
    /// Returns [`ContextError`] if the directory cannot be created or the file
    /// cannot be written.
    pub fn write(&self, content: &str, append: bool) -> Result<(), ContextError> {
        let path = self.path();
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        if append {
            let mut existing = std::fs::read_to_string(&path).unwrap_or_default();
            if !existing.is_empty() && !existing.ends_with('\n') {
                existing.push('\n');
            }
            existing.push_str(content);
            std::fs::write(&path, existing)?;
        } else {
            std::fs::write(&path, content)?;
        }
        Ok(())
    }

    /// Clear the context file (best-effort; a missing file is fine).
    pub fn clear(&self) {
        let _ = std::fs::remove_file(self.path());
    }
}

/// Absolute path of the context file under `cwd`.
#[must_use]
pub fn context_path(cwd: &Path) -> PathBuf {
    cwd.join(CONTEXT_SUBPATH)
}

#[derive(Deserialize, JsonSchema)]
struct WriteContextArgs {
    /// The learnings / notes to persist for later stages to read.
    content: String,
    /// Append to the existing context instead of replacing it (default: false).
    #[serde(default)]
    append: Option<bool>,
}

#[async_trait::async_trait]
impl Service for ContextService {
    fn name(&self) -> &'static str {
        "context"
    }

    async fn setup(self: Arc<Self>, _ctx: &ToolContext) -> Contribution {
        let read_svc = self.clone();
        let read = define_tool(
            "read_context",
            "Read the shared context scratchpad (context.md): notes and learnings \
             persisted by earlier stages of this run. Read it before working so you \
             build on prior attempts instead of starting over.",
            move |_args: (), _ctx: &ToolContext| {
                let svc = read_svc.clone();
                async move {
                    let content = svc.read();
                    if content.is_empty() {
                        Ok(ToolResult::ok("(context is empty)"))
                    } else {
                        Ok(ToolResult::ok(content))
                    }
                }
            },
        )
        .build();

        let write_svc = self.clone();
        let write = define_tool(
            "write_context",
            "Persist learnings to the shared context scratchpad (context.md) so later \
             stages can build on them. Use append=true to add without erasing prior notes.",
            move |args: WriteContextArgs, _ctx: &ToolContext| {
                let svc = write_svc.clone();
                async move {
                    match svc.write(&args.content, args.append.unwrap_or(false)) {
                        Ok(()) => Ok(ToolResult::ok("Context saved.")),
                        Err(e) => Ok(ToolResult::fail(e.to_string())),
                    }
                }
            },
        )
        .build();

        Contribution {
            tools: vec![read, write],
        }
    }

    async fn teardown(&self, _ctx: &ToolContext) {}
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn write_then_read_roundtrips() {
        let tmp = tempfile::tempdir().unwrap();
        let svc = ContextService::new(tmp.path());
        assert_eq!(svc.read(), "");
        svc.write("first lesson", false).unwrap();
        assert_eq!(svc.read(), "first lesson");
    }

    #[test]
    fn append_adds_a_newline_between_entries() {
        let tmp = tempfile::tempdir().unwrap();
        let svc = ContextService::new(tmp.path());
        svc.write("a", false).unwrap();
        svc.write("b", true).unwrap();
        assert_eq!(svc.read(), "a\nb");
    }

    #[test]
    fn clear_removes_the_file() {
        let tmp = tempfile::tempdir().unwrap();
        let svc = ContextService::new(tmp.path());
        svc.write("x", false).unwrap();
        svc.clear();
        assert_eq!(svc.read(), "");
    }
}
