//! `ScriptService` — discovers `.sh` scripts, contributes `run_script`,
//! `read_script`, and `write_script` tools. All execution is mediated by the
//! `Sandbox` boundary. Ported from `packages/core-v2/src/services/script/`.

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Arc, RwLock};

use sandbox::Sandbox;
use schemars::JsonSchema;
use serde::Deserialize;
use tools::{ToolContext, ToolResult, define_tool};

use crate::script::discover::{discover_scripts, scripts_dir};
use crate::script::front_matter::{Script, ScriptArgs, serialize_front_matter};
use crate::script::invoke::{render_help, resolve_invocation};
use crate::script::run::run_command;
use crate::service::{Contribution, Service};

/// An error writing a script to disk.
#[derive(Debug, thiserror::Error)]
pub enum ScriptError {
    /// Creating the scripts directory or writing the script file failed.
    #[error("failed to write script: {0}")]
    Io(#[from] std::io::Error),
}

/// A service that discovers and runs reusable shell scripts inside a sandbox.
pub struct ScriptService {
    cwd: PathBuf,
    home: PathBuf,
    sandbox: Arc<dyn Sandbox>,
    scripts: RwLock<Vec<Script>>,
}

impl ScriptService {
    /// Create a service rooted at `cwd`, discovering scripts under it and `home`,
    /// running them through `sandbox`.
    #[must_use]
    pub fn new(
        cwd: impl Into<PathBuf>,
        home: impl Into<PathBuf>,
        sandbox: Arc<dyn Sandbox>,
    ) -> Arc<Self> {
        let svc = Arc::new(Self {
            cwd: cwd.into(),
            home: home.into(),
            sandbox,
            scripts: RwLock::new(Vec::new()),
        });
        svc.refresh();
        svc
    }

    /// Re-discover scripts into the in-memory cache.
    pub fn refresh(&self) {
        let found = discover_scripts(&self.cwd, &self.home);
        if let Ok(mut guard) = self.scripts.write() {
            *guard = found;
        }
    }

    /// Snapshot of the currently-cached scripts.
    #[must_use]
    pub fn list(&self) -> Vec<Script> {
        self.scripts.read().map(|g| g.clone()).unwrap_or_default()
    }

    /// Write a new script to `<cwd>/.workhorse/scripts/<name>.sh` and refresh.
    ///
    /// # Errors
    /// Returns [`ScriptError`] if creating the scripts directory or writing the
    /// script file fails.
    pub fn write(&self, script: &Script) -> Result<(), ScriptError> {
        let dir = scripts_dir(&self.cwd);
        std::fs::create_dir_all(&dir)?;
        let path = dir.join(format!("{}.sh", script.name));
        std::fs::write(&path, serialize_front_matter(script))?;
        self.refresh();
        Ok(())
    }
}

#[derive(Deserialize, JsonSchema, Default)]
struct RunArgs {
    #[serde(default)]
    help: Option<bool>,
    #[serde(default)]
    name: Option<String>,
    #[serde(default)]
    options: Option<HashMap<String, String>>,
    #[serde(default)]
    positional: Option<Vec<String>>,
}

#[derive(Deserialize, JsonSchema)]
struct ReadArgs {
    /// Name of the script to read.
    name: String,
}

#[derive(Deserialize, JsonSchema)]
struct WriteArgs {
    name: String,
    command: String,
    #[serde(default)]
    description: String,
    #[serde(default)]
    args: Option<WriteArgsSpec>,
}

#[derive(Deserialize, JsonSchema, Default)]
struct WriteArgsSpec {
    #[serde(default)]
    options: Vec<WriteOption>,
    #[serde(default)]
    positional: Vec<WritePositional>,
}

#[derive(Deserialize, JsonSchema)]
struct WritePositional {
    name: String,
    #[serde(default)]
    description: String,
    #[serde(default)]
    required: Option<bool>,
    #[serde(default)]
    default: Option<String>,
}

#[derive(Deserialize, JsonSchema)]
struct WriteOption {
    name: String,
    #[serde(default)]
    description: String,
    #[serde(default)]
    required: Option<bool>,
    #[serde(default)]
    default: Option<String>,
    #[serde(default)]
    alias: Option<String>,
}

#[async_trait::async_trait]
impl Service for ScriptService {
    fn name(&self) -> &'static str {
        "scripts"
    }

    async fn setup(self: Arc<Self>, _ctx: &ToolContext) -> Contribution {
        script_tools(self)
    }

    async fn teardown(&self, _ctx: &ToolContext) {
        if let Ok(mut guard) = self.scripts.write() {
            guard.clear();
        }
    }
}

/// Build the script tools, capturing `svc`.
#[must_use]
fn script_tools(svc: Arc<ScriptService>) -> Contribution {
    let run_svc = svc.clone();
    let run = define_tool(
        "run_script",
        "Run a named script with optional positional args and named options. \
         Call with no name to list scripts; pass help=true to show usage.",
        move |args: RunArgs, ctx: &ToolContext| {
            let svc = run_svc.clone();
            let cwd = ctx.cwd.clone();
            async move { Ok(run_tool(&svc, &cwd, args).await) }
        },
    )
    .build();

    let read_svc = svc.clone();
    let read = define_tool(
        "read_script",
        "Read a named script's source (the raw .sh body, front-matter included) \
         so you can inspect what it does before running it.",
        move |args: ReadArgs, _ctx: &ToolContext| {
            let svc = read_svc.clone();
            async move { Ok(read_tool(&svc, &args.name)) }
        },
    )
    .build();

    let write = define_tool(
        "write_script",
        "Save a reusable shell script so it can be run later with run_script. \
         Re-using a name overwrites the existing script.",
        move |args: WriteArgs, _ctx: &ToolContext| {
            let svc = svc.clone();
            async move { Ok(write_tool(&svc, args)) }
        },
    )
    .build();

    Contribution {
        tools: vec![run, read, write],
    }
}

fn read_tool(svc: &ScriptService, name: &str) -> ToolResult {
    match svc.list().iter().find(|s| s.name == name) {
        Some(script) => ToolResult::ok(script.command.clone()),
        None => ToolResult::fail(format!("No script named \"{name}\".")),
    }
}

async fn run_tool(svc: &ScriptService, cwd: &std::path::Path, args: RunArgs) -> ToolResult {
    let scripts = svc.list();
    let Some(name) = args.name else {
        let listing = if scripts.is_empty() {
            "No scripts are available.".to_string()
        } else {
            scripts
                .iter()
                .map(|s| format!("- **{}**: {}", s.name, s.description))
                .collect::<Vec<_>>()
                .join("\n")
        };
        return ToolResult::ok(listing);
    };

    let Some(script) = scripts.iter().find(|s| s.name == name) else {
        return ToolResult::fail(format!("No script named \"{name}\"."));
    };

    if args.help == Some(true) {
        return ToolResult::ok(render_help(script));
    }

    let options = args.options.unwrap_or_default();
    let positional = args.positional.unwrap_or_default();
    match resolve_invocation(script, &options, &positional) {
        Ok(inv) => run_command(&svc.sandbox, &script.command, cwd, &inv).await,
        Err(e) => ToolResult::fail(e.to_string()),
    }
}

fn write_tool(svc: &ScriptService, args: WriteArgs) -> ToolResult {
    let spec = args.args.unwrap_or_default();
    let script = Script {
        name: args.name.clone(),
        description: args.description,
        command: args.command,
        args: ScriptArgs {
            options: spec.options.into_iter().map(Into::into).collect(),
            positional: spec.positional.into_iter().map(Into::into).collect(),
        },
    };
    match svc.write(&script) {
        Ok(()) => ToolResult::ok(format!("Saved script \"{}\".", args.name)),
        Err(e) => ToolResult::fail(e.to_string()),
    }
}

impl From<WritePositional> for crate::script::front_matter::ArgSpec {
    fn from(p: WritePositional) -> Self {
        Self {
            name: p.name,
            description: p.description,
            default: p.default,
            required: p.required,
        }
    }
}

impl From<WriteOption> for crate::script::front_matter::OptionSpec {
    fn from(o: WriteOption) -> Self {
        Self {
            name: o.name,
            description: o.description,
            default: o.default,
            required: o.required,
            alias: o.alias,
        }
    }
}
