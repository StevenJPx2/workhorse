//! `wh` — the workhorse facade.
//!
//! Ties the core crates together behind one ergonomic surface: discover and
//! cascade workflow + preset config from a real `.workhorse/` directory
//! ([`config`]), compile it, and drive it to completion through the runtime
//! orchestrator. The heavier bootstrap pieces the architecture spec describes
//! (DB, hooks bus, issue intake via a one-off agent, worktree/branch creation)
//! are intentionally out of scope here — they belong with the integrations
//! (Jira/GitHub MCP, git) that own them.

pub mod config;

pub use config::{
    ConfigError, WhConfig, apply_preset_cascade, load_config_layer, load_workflow, read_workflow,
    workhorse_dir,
};

use std::path::Path;

use pipeline::compiler::{WorkflowProgram, compile_stage};

/// Errors from preparing a workflow run via the facade.
#[derive(Debug, thiserror::Error)]
pub enum WhError {
    #[error(transparent)]
    Config(#[from] ConfigError),
    #[error("compile error: {0}")]
    Compile(String),
}

/// Discover, cascade, and compile a workflow type by name into a runnable
/// [`WorkflowProgram`]. This is the facade's load path: it reads
/// `<cwd>/.workhorse/workflows/<name>.toml`, layers global/project preset patches
/// (global → project → workflow), and compiles — resolving each stage's `preset`.
///
/// The caller then supplies a model + toolset (provider-specific) and drives the
/// returned program with [`runtime::run_to_completion`] /
/// [`runtime::run_with_limit`]. `wh` deliberately does not own model/provider
/// selection or service wiring — those are composed by the host (e.g. wh-demo).
///
/// # Errors
/// Returns [`WhError::Config`] if discovery/parse fails, or [`WhError::Compile`]
/// if an exit guard fails to parse.
pub fn prepare_workflow(cwd: &Path, home: &Path, name: &str) -> Result<WorkflowProgram, WhError> {
    let config = load_workflow(cwd, home, name)?;
    compile_stage(&config).map_err(|e| WhError::Compile(e.to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn prepare_workflow_compiles_a_discovered_cascaded_workflow() {
        let tmp = tempfile::tempdir().unwrap();
        let cwd = tmp.path();
        std::fs::create_dir_all(cwd.join(".workhorse/workflows")).unwrap();
        std::fs::write(
            cwd.join(".workhorse/workflows/tiny.toml"),
            r#"name = "tiny"
version = "1"
initial = "draft"
[presets.writer]
prologue = "you write"
[states.draft]
preset = "writer"
[[states.draft.exits]]
when = "count >= 1"
to = "done"
[states.done]
"#,
        )
        .unwrap();

        let Ok(program) = prepare_workflow(cwd, tmp.path(), "tiny") else {
            panic!("prepare should succeed");
        };
        assert_eq!(program.config.initial, "draft");
        // The preset resolved into the stage.
        let draft = program.config.states.get("draft").unwrap().step.clone();
        assert_eq!(draft.prologue.as_deref(), Some("you write"));
        // The exit compiled.
        assert!(program.compiled_exits.contains_key("draft"));
    }

    #[test]
    fn prepare_workflow_surfaces_missing_workflow() {
        let tmp = tempfile::tempdir().unwrap();
        let result = prepare_workflow(tmp.path(), tmp.path(), "ghost");
        assert!(matches!(
            result,
            Err(WhError::Config(ConfigError::WorkflowNotFound(_)))
        ));
    }
}
