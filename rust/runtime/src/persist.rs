//! Crash-recovery persistence for a workflow run. `WorkflowRun` is the sans-IO
//! state object — fully serializable — so we persist the WHOLE run (current
//! stage, routing state, token total, phase) as JSON after each stage boundary.
//! On restart the orchestrator rebuilds the `WorkflowProgram` from the frozen
//! workflow TOML and loads the run to resume exactly where it left off.
//!
//! Layout (spec): `$XDG_STATE_HOME/workhorse/workflow/<issue-id>/run.json`.

use std::fs;
use std::io;
use std::path::{Path, PathBuf};

use crate::workflow::WorkflowRun;

/// The root directory for per-issue workflow state:
/// `$XDG_STATE_HOME/workhorse/workflow` (falling back to the OS data dir, then a
/// temp dir if neither is available).
#[must_use]
pub fn state_root() -> PathBuf {
    dirs::state_dir()
        .or_else(dirs::data_dir)
        .unwrap_or_else(std::env::temp_dir)
        .join("workhorse")
        .join("workflow")
}

/// A per-issue store for a single persisted `WorkflowRun` (`<dir>/run.json`).
#[derive(Debug, Clone)]
pub struct RunStore {
    dir: PathBuf,
}

impl RunStore {
    /// A store rooted at an explicit directory (the run file is `<dir>/run.json`).
    #[must_use]
    pub fn new(dir: impl Into<PathBuf>) -> Self {
        Self { dir: dir.into() }
    }

    /// A store under `root/<issue_id>/` — the canonical per-issue location.
    #[must_use]
    pub fn for_issue(root: impl AsRef<Path>, issue_id: &str) -> Self {
        Self::new(root.as_ref().join(issue_id))
    }

    /// The path of the persisted run file.
    #[must_use]
    pub fn run_path(&self) -> PathBuf {
        self.dir.join("run.json")
    }

    /// Persist the run as JSON, creating the directory if needed. Called after
    /// each stage boundary, so a crash loses at most the in-flight stage (which
    /// is fresh-session re-runnable).
    ///
    /// # Errors
    /// Returns any filesystem or serialization error.
    pub fn persist(&self, run: &WorkflowRun) -> io::Result<()> {
        fs::create_dir_all(&self.dir)?;
        let json = serde_json::to_string_pretty(run)
            .map_err(|e| io::Error::new(io::ErrorKind::InvalidData, e))?;
        fs::write(self.run_path(), json)
    }

    /// Load a previously persisted run, or `None` if there is none (or it cannot
    /// be read/parsed — a corrupt file is treated as no checkpoint).
    #[must_use]
    pub fn load(&self) -> Option<WorkflowRun> {
        let bytes = fs::read(self.run_path()).ok()?;
        serde_json::from_slice(&bytes).ok()
    }

    /// Remove the persisted run (e.g. after the workflow reaches a terminal
    /// state). Missing file is not an error.
    ///
    /// # Errors
    /// Returns a filesystem error other than "not found".
    pub fn clear(&self) -> io::Result<()> {
        match fs::remove_file(self.run_path()) {
            Ok(()) => Ok(()),
            Err(e) if e.kind() == io::ErrorKind::NotFound => Ok(()),
            Err(e) => Err(e),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn persist_then_load_roundtrips_the_run() {
        let tmp = std::env::temp_dir().join(format!("wh-persist-{}", std::process::id()));
        let store = RunStore::for_issue(&tmp, "ISSUE-1");

        let mut run = WorkflowRun::new("work", 5000);
        run = run.with_state(std::collections::HashMap::from([(
            "count".to_string(),
            serde_json::json!(2),
        )]));
        store.persist(&run).expect("persist");

        let loaded = store.load().expect("load");
        assert_eq!(loaded.current_stage(), "work");
        assert_eq!(loaded.total_tokens(), 0);

        store.clear().expect("clear");
        assert!(store.load().is_none(), "cleared run should be gone");
        let _ = fs::remove_dir_all(&tmp);
    }

    #[test]
    fn load_is_none_when_absent() {
        let tmp = std::env::temp_dir().join("wh-persist-absent-xyz");
        let store = RunStore::for_issue(&tmp, "NOPE");
        assert!(store.load().is_none());
    }
}
