//! Config discovery + the preset cascade.
//!
//! A workflow type lives at `<workhorse>/workflows/<name>.toml`. Presets can be
//! patched per-repo (project) and per-user (global) via a `<workhorse>/config.toml`
//! `[presets.<name>]` table. The cascade layers preset libraries
//! **global → project → workflow** (later wins) before `compile_stage` resolves
//! each stage's `preset` — so a project can retune a preset for the whole repo
//! without editing any workflow TOML, and a workflow's own `[presets]` still wins.

use std::collections::HashMap;
use std::path::{Path, PathBuf};

use pipeline::compiler::{StepConfig, WorkflowConfig};
use serde::Deserialize;

/// Errors loading workflow/config files.
#[derive(Debug, thiserror::Error)]
pub enum ConfigError {
    #[error("workflow `{0}` not found under any .workhorse/workflows directory")]
    WorkflowNotFound(String),
    #[error("failed to read {path}: {source}")]
    Read {
        path: PathBuf,
        source: std::io::Error,
    },
    #[error("failed to parse {path}: {source}")]
    Parse {
        path: PathBuf,
        source: toml::de::Error,
    },
}

/// A `.workhorse/config.toml` layer — currently just preset patches.
#[derive(Debug, Default, Deserialize)]
pub struct WhConfig {
    /// Preset patches by name, layered into the cascade.
    #[serde(default)]
    pub presets: HashMap<String, StepConfig>,
}

/// The `.workhorse` directory for a working dir (`<cwd>/.workhorse`).
#[must_use]
pub fn workhorse_dir(cwd: &Path) -> PathBuf {
    cwd.join(".workhorse")
}

/// Load a `.workhorse/config.toml` preset-patch layer if present. A missing file
/// is `Ok(None)`; a present-but-unparseable file is an error.
///
/// # Errors
/// Returns [`ConfigError::Read`]/[`ConfigError::Parse`] on I/O or parse failure.
pub fn load_config_layer(workhorse: &Path) -> Result<Option<WhConfig>, ConfigError> {
    let path = workhorse.join("config.toml");
    match std::fs::read_to_string(&path) {
        Ok(text) => {
            let cfg = toml::from_str(&text).map_err(|source| ConfigError::Parse {
                path: path.clone(),
                source,
            })?;
            Ok(Some(cfg))
        }
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(source) => Err(ConfigError::Read { path, source }),
    }
}

/// Read and parse a workflow type TOML from `<workhorse>/workflows/<name>.toml`.
///
/// # Errors
/// Returns [`ConfigError::WorkflowNotFound`] if absent, or a read/parse error.
pub fn read_workflow(workhorse: &Path, name: &str) -> Result<WorkflowConfig, ConfigError> {
    let path = workhorse.join("workflows").join(format!("{name}.toml"));
    let text = match std::fs::read_to_string(&path) {
        Ok(t) => t,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
            return Err(ConfigError::WorkflowNotFound(name.to_string()));
        }
        Err(source) => return Err(ConfigError::Read { path, source }),
    };
    toml::from_str(&text).map_err(|source| ConfigError::Parse { path, source })
}

/// Layer preset libraries into `workflow.presets` with **global → project →
/// workflow** precedence (later wins). The workflow's own presets are kept on top,
/// so a workflow can always override a project/global patch. Mutates the workflow
/// config in place; `compile_stage` then resolves each stage's `preset` against
/// the fully-cascaded set.
pub fn apply_preset_cascade(
    workflow: &mut WorkflowConfig,
    global: Option<&WhConfig>,
    project: Option<&WhConfig>,
) {
    let mut cascaded: HashMap<String, StepConfig> = HashMap::new();
    if let Some(g) = global {
        cascaded.extend(g.presets.clone());
    }
    if let Some(p) = project {
        cascaded.extend(p.presets.clone()); // project overrides global
    }
    cascaded.extend(workflow.presets.clone()); // workflow overrides both
    workflow.presets = cascaded;
}

/// Discover and fully resolve a workflow type: read `<cwd>/.workhorse/workflows/
/// <name>.toml`, layer the global (`<home>/.workhorse/config.toml`) and project
/// (`<cwd>/.workhorse/config.toml`) preset patches into it (global → project →
/// workflow), and return the cascaded [`WorkflowConfig`] ready for
/// `compile_stage`.
///
/// # Errors
/// Returns a [`ConfigError`] if the workflow is missing or any file fails to
/// read/parse.
pub fn load_workflow(cwd: &Path, home: &Path, name: &str) -> Result<WorkflowConfig, ConfigError> {
    let project_wh = workhorse_dir(cwd);
    let global_wh = workhorse_dir(home);

    let mut workflow = read_workflow(&project_wh, name).or_else(|e| match e {
        // Fall back to a global workflow library if the project has none.
        ConfigError::WorkflowNotFound(_) => read_workflow(&global_wh, name),
        other => Err(other),
    })?;

    let global = load_config_layer(&global_wh)?;
    let project = load_config_layer(&project_wh)?;
    apply_preset_cascade(&mut workflow, global.as_ref(), project.as_ref());
    Ok(workflow)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn write(path: &Path, body: &str) {
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        std::fs::write(path, body).unwrap();
    }

    #[test]
    fn loads_workflow_and_cascades_presets_project_over_global() {
        let tmp = tempfile::tempdir().unwrap();
        let cwd = tmp.path().join("repo");
        let home = tmp.path().join("home");

        // Workflow uses preset "coding"; declares no presets of its own.
        write(
            &cwd.join(".workhorse/workflows/ralph.toml"),
            r#"name = "ralph"
version = "1"
initial = "work"
[states.work]
preset = "coding"
[states.done]
"#,
        );
        // Global config: coding -> model gpt; Project config: coding -> model codex
        // (project should win).
        write(
            &home.join(".workhorse/config.toml"),
            "[presets.coding]\nprologue = \"global\"\ntoken_budget = 100\n",
        );
        write(
            &cwd.join(".workhorse/config.toml"),
            "[presets.coding]\nprologue = \"project\"\n",
        );

        let workflow = load_workflow(&cwd, &home, "ralph").expect("load");
        let coding = workflow.presets.get("coding").expect("coding preset");
        // Project's prologue wins; global's token_budget is NOT inherited because
        // project's [presets.coding] table fully replaces global's (extend by key).
        assert_eq!(coding.prologue.as_deref(), Some("project"));
        assert_eq!(coding.token_budget, None);

        // And it compiles + resolves the stage's preset.
        let program = pipeline::compiler::compile_stage(&workflow).expect("compile");
        let work = program.config.states.get("work").unwrap().step.clone();
        assert_eq!(work.prologue.as_deref(), Some("project"));
    }

    #[test]
    fn missing_workflow_errors() {
        let tmp = tempfile::tempdir().unwrap();
        let err = load_workflow(tmp.path(), tmp.path(), "nope").unwrap_err();
        assert!(matches!(err, ConfigError::WorkflowNotFound(_)));
    }

    #[test]
    fn workflow_presets_override_project_and_global() {
        let tmp = tempfile::tempdir().unwrap();
        let cwd = tmp.path().join("repo");
        write(
            &cwd.join(".workhorse/workflows/w.toml"),
            r#"name = "w"
version = "1"
initial = "s"
[presets.coding]
prologue = "workflow wins"
[states.s]
preset = "coding"
[states.done]
"#,
        );
        write(
            &cwd.join(".workhorse/config.toml"),
            "[presets.coding]\nprologue = \"project\"\n",
        );
        let workflow = load_workflow(&cwd, tmp.path(), "w").expect("load");
        assert_eq!(
            workflow.presets.get("coding").unwrap().prologue.as_deref(),
            Some("workflow wins")
        );
    }
}
