//! Native egui smoke-test surface for the workhorse Rust port.
//!
//! Three panels, each wired to the real crates (no logic mocked):
//!   • When  — parse a `when` string → AST → evaluate against an editable state map.
//!   • Compiler — lower a `snake_case` workflow config (`TOML`) → `WorkflowProgram`.
//!   • Workflow — step the sans-IO `WorkflowRun` governor: run → gate → park → resume → done.
//!
//! Run it: `cargo run -p wh-demo` (from `rust/`). No browser, no wasm — just a window.

mod builder_panel;
mod compiler_panel;
mod demo_counter;
mod harness_panel;
mod orchestrator_panel;
mod registry_panel;
mod selfcheck;
mod when_panel;
mod widgets;
mod workflow_panel;

use eframe::egui;
use egui_phosphor::regular as icon;

#[derive(PartialEq, Eq, Clone, Copy)]
enum Tab {
    When,
    Compiler,
    Workflow,
    Builder,
    Harness,
    Orchestrator,
    Registry,
}

struct DemoApp {
    tab: Tab,
    when: when_panel::WhenState,
    compiler: compiler_panel::CompilerState,
    workflow: workflow_panel::WorkflowState,
    builder: builder_panel::BuilderState,
    harness: harness_panel::HarnessPanelState,
    orchestrator: orchestrator_panel::OrchestratorState,
    registry: registry_panel::RegistryState,
}

impl Default for DemoApp {
    fn default() -> Self {
        Self {
            tab: Tab::When,
            when: when_panel::WhenState::default(),
            compiler: compiler_panel::CompilerState::default(),
            workflow: workflow_panel::WorkflowState::default(),
            builder: builder_panel::BuilderState::default(),
            harness: harness_panel::HarnessPanelState::default(),
            orchestrator: orchestrator_panel::OrchestratorState::default(),
            registry: registry_panel::RegistryState::default(),
        }
    }
}

impl eframe::App for DemoApp {
    fn ui(&mut self, ui: &mut egui::Ui, _frame: &mut eframe::Frame) {
        egui::Panel::top("tabs").show_inside(ui, |ui| {
            ui.add_space(4.0);
            ui.horizontal(|ui| {
                ui.heading(format!("{} workhorse", icon::HORSE));
                ui.separator();
                ui.selectable_value(
                    &mut self.tab,
                    Tab::When,
                    format!("{} when expr", icon::FUNNEL),
                );
                ui.selectable_value(
                    &mut self.tab,
                    Tab::Compiler,
                    format!(
                        "{} config {} pipeline",
                        icon::TREE_STRUCTURE,
                        icon::ARROW_RIGHT
                    ),
                );
                ui.selectable_value(
                    &mut self.tab,
                    Tab::Workflow,
                    format!("{} WorkflowRun", icon::FLOW_ARROW),
                );
                ui.selectable_value(
                    &mut self.tab,
                    Tab::Builder,
                    format!("{} Builder", icon::TREE_STRUCTURE),
                );
                ui.selectable_value(
                    &mut self.tab,
                    Tab::Harness,
                    format!("{} Harness", icon::ROBOT),
                );
                ui.selectable_value(
                    &mut self.tab,
                    Tab::Orchestrator,
                    format!("{} Orchestrator", icon::FLOW_ARROW),
                );
                ui.selectable_value(
                    &mut self.tab,
                    Tab::Registry,
                    format!("{} Registry", icon::CARDS),
                );
            });
            ui.add_space(4.0);
        });

        egui::CentralPanel::default().show_inside(ui, |ui| match self.tab {
            Tab::When => when_panel::ui(ui, &mut self.when),
            Tab::Compiler => compiler_panel::ui(ui, &mut self.compiler),
            Tab::Workflow => workflow_panel::ui(ui, &mut self.workflow),
            Tab::Builder => {
                builder_panel::ui(ui, &mut self.builder);
                // Builder asked to hand its config to the Orchestrator: load it
                // and jump to that tab so the user can run it immediately.
                if let Some(config) = self.builder.send_to_orchestrator.take() {
                    self.orchestrator.load_config_toml(config);
                    self.tab = Tab::Orchestrator;
                }
            }
            Tab::Harness => harness_panel::ui(ui, &mut self.harness),
            Tab::Orchestrator => orchestrator_panel::ui(ui, &mut self.orchestrator),
            Tab::Registry => registry_panel::ui(ui, &mut self.registry),
        });
    }
}

fn main() -> eframe::Result {
    // Headless smoke proof of the exact wiring the panels use — runnable in CI
    // where no window can open: `cargo run -p wh-demo -- --selfcheck`.
    if std::env::args().any(|a| a == "--selfcheck") {
        selfcheck::run();
        return Ok(());
    }

    // Headless end-to-end orchestrator against the resolved real provider:
    // `cargo run -p wh-demo -- --orchestrate` (default preset) or
    // `--orchestrate=<preset>`. Prints the transcript; exits non-zero on failure.
    // Falls back to the mock when no key/token is set.
    if std::env::args().any(|a| a == "--orchestrate" || a.starts_with("--orchestrate=")) {
        return orchestrate_headless();
    }

    // Interactive Anthropic OAuth login: `cargo run -p wh-demo -- --auth`.
    if std::env::args().any(|a| a == "--auth") {
        return auth_login();
    }

    let options = eframe::NativeOptions {
        viewport: egui::ViewportBuilder::default().with_inner_size([960.0, 720.0]),
        ..Default::default()
    };
    eframe::run_native(
        "workhorse demo",
        options,
        Box::new(|cc| {
            let mut fonts = egui::FontDefinitions::default();
            egui_phosphor::add_to_fonts(&mut fonts, egui_phosphor::Variant::Regular);
            // `add_to_fonts` only merges Phosphor into the Proportional family, so
            // icons rendered via `ui.monospace(...)` (e.g. the event log) would tofu.
            // Register it in the Monospace family too.
            if let Some(mono) = fonts.families.get_mut(&egui::FontFamily::Monospace) {
                mono.push("phosphor".into());
            }
            cc.egui_ctx.set_fonts(fonts);
            Ok(Box::new(DemoApp::default()) as Box<dyn eframe::App>)
        }),
    )
}

/// Interactive Anthropic OAuth login via PKCE. Opens the browser, prompts for
/// the authorization code, exchanges it for tokens, and stores them.
fn auth_login() -> eframe::Result {
    let req = runtime::launch_login()
        .map_err(|e| eframe::Error::AppCreation(Box::new(std::io::Error::other(e.to_string()))))?;

    println!("Opening browser for Anthropic login...");
    println!("If the browser didn't open, visit:\n  {}\n", req.url);
    println!("Paste the authorization code (or full callback URL) below:");

    let mut input = String::new();
    std::io::stdin()
        .read_line(&mut input)
        .map_err(|e| eframe::Error::AppCreation(Box::new(e)))?;

    let rt = tokio::runtime::Runtime::new()
        .map_err(|e| eframe::Error::AppCreation(Box::new(std::io::Error::other(e.to_string()))))?;

    match rt.block_on(runtime::exchange_code(&input, &req.verifier, &req.state)) {
        Ok(tokens) => {
            println!("\nLogin successful. Tokens stored.");
            println!(
                "  Access token: {}...",
                &tokens.access_token[..16.min(tokens.access_token.len())]
            );
            println!("  Expires at: {}", tokens.expires_at);
            Ok(())
        }
        Err(e) => {
            eprintln!("\nLogin failed: {e}");
            std::process::exit(1);
        }
    }
}

/// Drive the tiny default workflow end to end against the resolved real provider
/// (Anthropic, then OpenAI-compatible, else the offline mock), printing the live
/// transcript. Exits non-zero if the run errors or fails to reach `Done`.
fn orchestrate_headless() -> eframe::Result {
    use runtime::Outcome;

    // Pick the preset: `--orchestrate=<name>` (default: ralph-loop, the autonomous
    // loop). Falls back to the first preset if the name is unknown.
    let want = std::env::args()
        .find_map(|a| a.strip_prefix("--orchestrate=").map(str::to_string))
        .unwrap_or_else(|| "ralph-loop".to_string());
    let presets = runtime::presets();
    let preset = presets
        .iter()
        .find(|p| p.name == want)
        .copied()
        .unwrap_or(presets[0]);

    let config: pipeline::compiler::WorkflowConfig =
        toml::from_str(preset.config).expect("preset config parses");
    let program = pipeline::compile_stage(&config).expect("preset config compiles");
    let task = preset.task;
    let initial = config.initial.clone();
    let seed = preset.seed();
    let preset_name = preset.name;

    let rt = tokio::runtime::Runtime::new()
        .map_err(|e| eframe::Error::AppCreation(Box::new(std::io::Error::other(e.to_string()))))?;

    let provider = runtime::resolve_provider_from_env();
    println!("== orchestrator: `{}` workflow ==", preset.name);
    println!("{}", preset.description);
    println!("provider: {}\n", provider_label(&provider));

    // A scratch cwd for this run's context.md.
    let cwd = std::env::temp_dir().join(format!("wh-orchestrate-{}", std::process::id()));

    // The run forwards events on `tx`; drain and render the transcript after it
    // returns (the channel is unbounded, so sends never block).
    let (tx, rx) = std::sync::mpsc::channel();
    let outcome = rt.block_on(drive_workflow(
        provider,
        RunSpec {
            program: &program,
            cwd: &cwd,
            initial,
            seed,
            task,
            preset_name,
        },
        &tx,
    ));
    drop(tx);
    for ev in &rx {
        println!("{}", render_event(&ev));
    }

    match outcome {
        Ok(Outcome::Done { stage }) => {
            println!("\nworkflow reached Done at `{stage}`");
            Ok(())
        }
        Ok(other) => {
            eprintln!("\nworkflow did not complete: {other:?}");
            std::process::exit(1);
        }
        Err(e) => {
            eprintln!("\norchestrator error: {e}");
            std::process::exit(1);
        }
    }
}

/// The non-provider inputs for one orchestrated run.
struct RunSpec<'a> {
    program: &'a pipeline::WorkflowProgram,
    cwd: &'a std::path::Path,
    initial: String,
    seed: std::collections::HashMap<String, serde_json::Value>,
    task: &'a str,
    preset_name: &'a str,
}

/// Build the resolved provider's model, wrap it in a `Harness`, and drive the
/// workflow to an `Outcome`. Each provider arm builds its own `Harness` because
/// the concrete model types differ (notably Anthropic OAuth vs API-key).
async fn drive_workflow(
    provider: runtime::ResolvedProvider,
    spec: RunSpec<'_>,
    tx: &std::sync::mpsc::Sender<runtime::OrchestratorEvent>,
) -> Result<runtime::Outcome, String> {
    use runtime::{DriveOptions, HarnessConfig, ResolvedProvider, run_with_limit};
    use services::ContextService;

    let RunSpec {
        program,
        cwd,
        initial,
        seed,
        task,
        preset_name,
    } = spec;

    // A ContextService gives the run a shared context.md (read_context /
    // write_context tools) and lets us read it back to seed each stage.
    let context_svc = ContextService::new(cwd);
    context_svc.clear();

    let read_ctx = context_svc.clone();
    let context_reader = move || read_ctx.read();

    // Auto-seed the run from the keys the tools declare they OWN (Tool::produces),
    // merged over the preset's own seed. The tool is the authority for its keys.
    let (_probe, produced) = context_toolset_with_state(context_svc.clone(), cwd).await;
    let mut state = seed;
    state.extend(produced); // tool-owned keys take precedence over preset seed
    // Validate every guard's key is produced by a tool or seeded — fail fast.
    let available: std::collections::HashSet<String> = state.keys().cloned().collect();
    runtime::validate_state_keys(program, &available)?;

    let mut run = runtime::WorkflowRun::new(initial, 1_000_000).with_state(state);
    let cap = runtime::DEFAULT_MAX_STAGE_RUNS;

    // Each provider arm builds its own Harness (their model types differ) with a
    // freshly-built toolset carrying the context + counter tools.
    let toolset = || async { context_toolset_with_state(context_svc.clone(), cwd).await.0 };
    let opts = DriveOptions::default().with_context(&context_reader);

    match provider {
        ResolvedProvider::Anthropic {
            api_key,
            model,
            base_url: _,
        } if api_key == "oauth" => {
            let m = runtime::anthropic_model_from_oauth(&model)
                .await
                .map_err(|e| e.to_string())?;
            let h = runtime::Harness::new(m, toolset().await, HarnessConfig::default());
            run_with_limit(&h, program, &mut run, task, cap, opts, tx)
                .await
                .map_err(|e| e.to_string())
        }
        ResolvedProvider::Anthropic {
            api_key,
            model,
            base_url,
        } => {
            let m = runtime::anthropic_model_from_creds(&api_key, &model, base_url.as_deref())
                .await
                .map_err(|e| e.to_string())?;
            let h = runtime::Harness::new(m, toolset().await, HarnessConfig::default());
            run_with_limit(&h, program, &mut run, task, cap, opts, tx)
                .await
                .map_err(|e| e.to_string())
        }
        ResolvedProvider::OpenAICompat {
            base_url,
            api_key,
            model,
        } => {
            let m = runtime::openai_compat_model(&base_url, &api_key, &model)
                .map_err(|e| e.to_string())?;
            let h = runtime::Harness::new(m, toolset().await, HarnessConfig::default());
            run_with_limit(&h, program, &mut run, task, cap, opts, tx)
                .await
                .map_err(|e| e.to_string())
        }
        ResolvedProvider::Mock => {
            let client = runtime::MockClient::new(mock_responses_for(preset_name));
            let m = <runtime::MockCompletionModel as rig::completion::CompletionModel>::make(
                &client,
                "mock-model",
            );
            let h = runtime::Harness::new(m, toolset().await, HarnessConfig::default());
            run_with_limit(&h, program, &mut run, task, cap, opts, tx)
                .await
                .map_err(|e| e.to_string())
        }
    }
}

/// Build a fresh rig `ToolSet` for one Harness — context tools (`read_context` /
/// `write_context`) plus the demo counter (`increment_counter`) — and the
/// auto-seed of state keys those tools own (`Tool::produces`). Per-step `tools`
/// lists scope which stage may use each.
async fn context_toolset_with_state(
    svc: std::sync::Arc<services::ContextService>,
    cwd: &std::path::Path,
) -> (
    rig::tool::ToolSet,
    std::collections::HashMap<String, serde_json::Value>,
) {
    let mut reg = services::Registry::new();
    reg.register(svc);
    reg.register(std::sync::Arc::new(demo_counter::CounterService::default()));
    reg.build_toolset_with_state(&tools::ToolContext::new(cwd))
        .await
}

fn provider_label(p: &runtime::ResolvedProvider) -> String {
    match p {
        runtime::ResolvedProvider::Anthropic { model, api_key, .. } => {
            let auth = if api_key == "oauth" {
                "oauth"
            } else {
                "api-key"
            };
            format!("anthropic ({model}, {auth})")
        }
        runtime::ResolvedProvider::OpenAICompat {
            model, base_url, ..
        } => {
            format!("openai-compat ({model} @ {base_url})")
        }
        runtime::ResolvedProvider::Mock => "mock (offline)".to_string(),
    }
}

/// Preset-aware scripted mock replies for the offline `--orchestrate` fallback.
/// State is NEVER set by these replies — `work`/`draft` turns call
/// `increment_counter` (the deterministic source), and the guards route on the
/// resulting `count`. Weaver turns are plain text. The mock cycles its list.
fn mock_responses_for(preset_name: &str) -> Vec<runtime::MockResponse> {
    let text = |s: &str| runtime::MockResponse {
        content: s.into(),
        tool_calls: vec![],
    };
    let inc = || runtime::MockResponse {
        content: "incrementing".into(),
        tool_calls: vec![runtime::MockToolCall {
            id: "c".into(),
            name: "increment_counter".into(),
            arguments: serde_json::json!({}),
        }],
    };
    match preset_name {
        "ralph-loop" => vec![
            inc(),
            text("incremented; reporting the number"),
            text("recorded"),
        ],
        _ => vec![
            inc(),
            text(
                "Quiet tide breathes slow\nsalt air folds over the dunes\nmoon pulls the grey deep",
            ),
        ],
    }
}

fn render_event(ev: &runtime::OrchestratorEvent) -> String {
    use runtime::{HarnessEvent, OrchestratorEvent, Outcome};
    match ev {
        OrchestratorEvent::StageEntered { stage, handoff } => match handoff {
            Some(h) => format!("[stage] {stage}  (handoff: {h})"),
            None => format!("[stage] {stage}"),
        },
        OrchestratorEvent::Harness(h) => match h {
            HarnessEvent::ModelCall { turn } => format!("  [model] call (turn {turn})"),
            HarnessEvent::TextChunk { text } => format!("  [text] {text}"),
            HarnessEvent::ToolCall { name, args } => format!("  [tool] {name}({args})"),
            HarnessEvent::ToolResult { name, result, .. } => {
                format!("  [tool-result] {name} -> {result}")
            }
            HarnessEvent::Done { output, usage, .. } => {
                format!("  [done] {output:?} ({} tok)", usage.total_tokens)
            }
            HarnessEvent::Cancelled => "  [cancelled]".to_string(),
        },
        OrchestratorEvent::StateParsed { stage, updates } => {
            let kv = serde_json::to_string(updates).unwrap_or_default();
            format!("  [state] {stage} published {kv}")
        }
        OrchestratorEvent::StageRouted { from, now, parked } => {
            if *parked {
                format!("[route] {from} -> parked (no exit fired)")
            } else {
                format!("[route] {from} -> {now}")
            }
        }
        OrchestratorEvent::Finished(o) => match o {
            Outcome::Done { stage } => format!("[finished] Done at {stage}"),
            Outcome::Suspended { stage } => format!("[finished] Suspended at {stage}"),
            Outcome::MaxIterations { stage, ran } => {
                format!("[finished] MaxIterations ({ran}) at {stage}")
            }
            Outcome::Cancelled => "[finished] Cancelled".to_string(),
        },
    }
}
