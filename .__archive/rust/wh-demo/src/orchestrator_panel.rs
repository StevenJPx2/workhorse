//! Panel: the end-to-end Orchestrator (runtime crate).
//!
//! Ties every other panel together: a `WorkflowProgram` (compiler) is driven by
//! the sans-IO `WorkflowRun` governor, and each stage's step is executed through
//! the `Harness` against a real or mock model. Routing state is set ONLY by
//! deterministic tool outcomes (e.g. `increment_counter` writing `count`), never
//! by the agent — the governor's `when` guards (`count >= 3`) read that state to
//! pick the next stage. Run it and watch a workflow walk itself to `done`.

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;
use std::sync::mpsc;

use eframe::egui;
use egui_phosphor::regular as icon;
use pipeline::{WorkflowProgram, compile_stage, compiler::WorkflowConfig};
use rig::completion::CompletionModel;
use rig::tool::ToolSet;
use runtime::{
    Harness, HarnessConfig, HarnessEvent, MockClient, MockCompletionModel, MockResponse,
    OrchestratorEvent, Outcome, WorkflowRun,
};
use serde_json::Value;
use services::{ContextService, Registry};
use tools::{RigToolBridge, ToolContext};

use crate::widgets;

const BUDGET: u64 = 1_000_000;

/// A fresh per-run scratch cwd for this run's `context.md`.
fn run_cwd() -> PathBuf {
    std::env::temp_dir().join(format!(
        "wh-demo-orch-{}-{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map_or(0, |d| d.as_nanos())
    ))
}

/// Build the run's rig `ToolSet` (context + counter tools), the auto-seed of
/// state keys those tools own (`Tool::produces`), and an owned context reader.
fn context_setup(cwd: &std::path::Path) -> (ToolSet, HashMap<String, Value>, impl Fn() -> String) {
    let svc = ContextService::new(cwd);
    svc.clear();
    let mut reg = Registry::new();
    reg.register(svc.clone());
    reg.register(Arc::new(crate::demo_counter::CounterService::default()));
    let (toolset, produced) =
        pollster::block_on(reg.build_toolset_with_state(&ToolContext::new(cwd)));
    let read = svc.clone();
    (toolset, produced, move || read.read())
}

/// Add a `spawn_subagent` tool to `toolset`, capturing `model` for the leaf +
/// parent-answer turns. The lone `researcher` template is a leaf with no tools
/// (only the implicit `ask_parent`), so spawning + `ask_parent` + one-level-deep
/// are all exercised. Called per provider arm where the concrete model exists.
fn add_spawn_tool<M>(toolset: &mut ToolSet, model: M, cwd: &std::path::Path)
where
    M: CompletionModel + Clone + Send + Sync + 'static,
{
    let template = pipeline::compiler::SubAgentTemplate {
        name: "researcher".into(),
        model: None,
        tools: vec![],
        write_globs: vec![],
    };
    let ctx = ToolContext::new(cwd);
    let spawn = runtime::spawn_subagent_tool(
        model,
        vec![template],
        vec![], // leaf gets only ask_parent (true leaf, one level deep)
        ctx.clone(),
        HarnessConfig::default(),
    );
    toolset.add_tool(RigToolBridge::new(spawn, Arc::new(ctx)));
}

/// Whether a workflow config references the `spawn_subagent` tool (so we only pay
/// to wire it when a stage actually uses sub-agents).
fn uses_subagents(config_toml: &str) -> bool {
    config_toml.contains("spawn_subagent")
}

#[derive(PartialEq, Eq, Clone, Copy)]
enum Provider {
    Mock,
    Anthropic,
    OpenAICompat,
}

pub struct OrchestratorState {
    provider: Provider,
    preset_idx: usize,
    config_toml: String,
    task: String,
    seed_json: String,
    anthropic_model: String,
    anthropic_key: String,
    oai_base: String,
    oai_key: String,
    oai_model: String,
    log: Vec<String>,
    outcome: Option<String>,
    running: bool,
    rx: Option<mpsc::Receiver<OrchestratorEvent>>,
    cancel: Option<tokio_util::sync::CancellationToken>,
    persist: bool,
    store: Option<runtime::RunStore>,
    parked: bool,
    resume_event: String,
    facade_dir: String,
    facade_name: String,
}

impl Default for OrchestratorState {
    fn default() -> Self {
        let preset = crate::presets::presets()[0];
        Self {
            provider: Provider::Mock,
            preset_idx: 0,
            config_toml: preset.config.to_string(),
            task: preset.task.to_string(),
            seed_json: seed_json_for(&preset),
            anthropic_model: runtime::ANTHROPIC_DEFAULT_MODEL.to_string(),
            anthropic_key: String::new(),
            oai_base: runtime::OPENCODE_ZEN_BASE_URL.to_string(),
            oai_key: String::new(),
            oai_model: runtime::DEFAULT_OPENCODE_MODEL.to_string(),
            log: Vec::new(),
            outcome: None,
            running: false,
            rx: None,
            cancel: None,
            persist: false,
            store: None,
            parked: false,
            resume_event: "{\"approved\": true}".to_string(),
            facade_dir: String::new(),
            facade_name: "ralph".to_string(),
        }
    }
}

/// Pretty-print a preset's seed map as JSON for the editable seed box.
fn seed_json_for(preset: &crate::presets::WorkflowPreset) -> String {
    serde_json::to_string_pretty(&preset.seed()).unwrap_or_else(|_| "{}".to_string())
}

impl OrchestratorState {
    /// Load a workflow config (TOML) from another panel (e.g. the Builder),
    /// auto-seeding routing keys so it is ready to run.
    pub fn load_config_toml(&mut self, config_toml: String) {
        if let Ok(config) = toml::from_str::<WorkflowConfig>(&config_toml)
            && let Ok(program) = compile_stage(&config)
        {
            let mut seed = serde_json::Map::new();
            for name in config.states.keys() {
                for key in runtime::stage_routing_keys(&program, name) {
                    let base = key.split_once("@entry").map_or(key.as_str(), |(b, _)| b);
                    seed.entry(base.to_string()).or_insert(Value::from(0));
                }
            }
            self.seed_json = serde_json::to_string_pretty(&seed).unwrap_or_else(|_| "{}".into());
        }
        self.config_toml = config_toml;
        self.log.clear();
        self.outcome = None;
    }

    /// Mint a fresh cancellation token for a new run and stash it so the Cancel
    /// button can fire it.
    fn new_cancel(&mut self) -> tokio_util::sync::CancellationToken {
        let token = tokio_util::sync::CancellationToken::new();
        self.cancel = Some(token.clone());
        token
    }
}

/// Load a preset's config, task, and seed into the editable fields.
fn load_preset(st: &mut OrchestratorState, idx: usize) {
    let presets = crate::presets::presets();
    if let Some(preset) = presets.get(idx) {
        st.preset_idx = idx;
        st.config_toml = preset.config.to_string();
        st.task = preset.task.to_string();
        st.seed_json = seed_json_for(preset);
        st.log.clear();
        st.outcome = None;
    }
}

pub fn ui(ui: &mut egui::Ui, st: &mut OrchestratorState) {
    ui.label("Drive a whole workflow end to end: the WorkflowRun governor runs each stage's step through the Harness; deterministic tool outcomes (not the agent) set the state its `when` guards route on.");
    ui.add_space(6.0);

    drain_events(st);

    egui::ScrollArea::vertical().show(ui, |ui| {
        preset_selector(ui, st);
        provider_selector(ui, st);
        provider_fields(ui, st);
        ui.add_space(6.0);
        extras_controls(ui, st);
        ui.add_space(6.0);

        ui.strong("workflow config (TOML)");
        widgets::code_input(ui, "orch_cfg", &mut st.config_toml, 10);
        ui.add_space(4.0);
        ui.strong("base task (handed to every stage)");
        widgets::code_input(ui, "orch_task", &mut st.task, 2);
        ui.add_space(4.0);
        ui.strong("seed state (JSON - guards read these keys)");
        widgets::code_input(ui, "orch_seed", &mut st.seed_json, 4);
        ui.add_space(6.0);

        run_button(ui, st);

        if let Some(outcome) = &st.outcome {
            ui.add_space(6.0);
            let ok = outcome.starts_with("Done");
            widgets::status(ui, ok, &format!("outcome: {outcome}"));
        }

        if !st.log.is_empty() {
            ui.add_space(8.0);
            ui.strong("orchestrator transcript");
            for line in &st.log {
                ui.monospace(line);
            }
        }
    });
}

fn drain_events(st: &mut OrchestratorState) {
    if let Some(rx) = &st.rx {
        for ev in rx.try_iter() {
            if let OrchestratorEvent::Finished(outcome) = &ev {
                st.outcome = Some(describe_outcome(outcome));
                st.running = false;
            }
            st.log.push(describe(&ev));
        }
        if !st.running {
            st.rx = None;
        }
    }
}

/// Persistence toggle, the sub-agent demo loader, and the wh-facade loader.
fn extras_controls(ui: &mut egui::Ui, st: &mut OrchestratorState) {
    ui.horizontal(|ui| {
        ui.checkbox(
            &mut st.persist,
            format!("{} persist run", icon::FLOPPY_DISK),
        )
        .on_hover_text("Write the run to disk after each stage boundary (crash recovery)");
    });

    ui.horizontal(|ui| {
        ui.label(format!("{} .workhorse dir:", icon::FOLDER_OPEN));
        ui.add(egui::TextEdit::singleline(&mut st.facade_dir).desired_width(240.0));
        ui.label("workflow:");
        ui.add(egui::TextEdit::singleline(&mut st.facade_name).desired_width(100.0));
        if ui
            .button(format!("{} load from .workhorse", icon::DOWNLOAD_SIMPLE))
            .on_hover_text("Discover + cascade presets + compile via the wh facade")
            .clicked()
        {
            load_via_facade(st);
        }
    });
}

/// Load a workflow through the `wh` facade: discover from `<dir>/.workhorse`,
/// cascade global/project presets, and load the resolved TOML into the panel.
fn load_via_facade(st: &mut OrchestratorState) {
    let dir = st.facade_dir.trim();
    if dir.is_empty() {
        st.log.push(format!(
            "{} enter a .workhorse parent dir first",
            icon::WARNING_CIRCLE
        ));
        return;
    }
    let path = std::path::Path::new(dir);
    match wh::load_workflow(path, path, st.facade_name.trim()) {
        Ok(config) => match toml::to_string_pretty(&config) {
            Ok(toml_str) => {
                st.load_config_toml(toml_str);
                st.log.push(format!(
                    "{} loaded + cascaded `{}` via wh facade",
                    icon::CHECK_CIRCLE,
                    st.facade_name.trim()
                ));
            }
            Err(e) => st
                .log
                .push(format!("{} serialize: {e}", icon::WARNING_CIRCLE)),
        },
        Err(e) => st.log.push(format!("{} facade: {e}", icon::WARNING_CIRCLE)),
    }
}

fn preset_selector(ui: &mut egui::Ui, st: &mut OrchestratorState) {
    let presets = crate::presets::presets();
    ui.horizontal(|ui| {
        ui.strong(format!("{} preset:", icon::CARDS));
        let current = presets[st.preset_idx].name;
        let mut chosen = st.preset_idx;
        egui::ComboBox::from_id_salt("orch_preset")
            .selected_text(current)
            .show_ui(ui, |ui| {
                for (i, p) in presets.iter().enumerate() {
                    ui.selectable_value(&mut chosen, i, p.name);
                }
            });
        if chosen != st.preset_idx {
            load_preset(st, chosen);
        }
        if ui
            .button(format!("{} reload", icon::ARROW_COUNTER_CLOCKWISE))
            .on_hover_text("Reset config/task/seed to this preset")
            .clicked()
        {
            load_preset(st, st.preset_idx);
        }
    });
    ui.weak(presets[st.preset_idx].description);
    ui.add_space(4.0);
}

fn provider_selector(ui: &mut egui::Ui, st: &mut OrchestratorState) {
    ui.horizontal(|ui| {
        ui.strong("provider:");
        ui.selectable_value(
            &mut st.provider,
            Provider::Mock,
            format!("{} mock", icon::CUBE),
        );
        ui.selectable_value(
            &mut st.provider,
            Provider::Anthropic,
            format!("{} anthropic", icon::CLIPBOARD),
        );
        ui.selectable_value(
            &mut st.provider,
            Provider::OpenAICompat,
            format!("{} openai-compat", icon::CLOUD),
        );
    });
}

fn provider_fields(ui: &mut egui::Ui, st: &mut OrchestratorState) {
    match st.provider {
        Provider::Mock => {
            ui.label("Offline mock: scripted replies call increment_counter, and the deterministic count drives the workflow to done.");
        }
        Provider::Anthropic => {
            ui.horizontal(|ui| {
                ui.label("model:");
                ui.add(egui::TextEdit::singleline(&mut st.anthropic_model).desired_width(200.0));
            });
            let has_oauth = runtime::oauth::has_stored_tokens();
            widgets::status(
                ui,
                has_oauth,
                if has_oauth {
                    "OAuth tokens found (Bearer auth)"
                } else {
                    "No OAuth tokens - run `--auth` or set API key below"
                },
            );
            ui.horizontal(|ui| {
                ui.label("api key:");
                ui.add(egui::TextEdit::singleline(&mut st.anthropic_key).desired_width(360.0));
            });
        }
        Provider::OpenAICompat => {
            ui.horizontal(|ui| {
                ui.label("base url:");
                ui.add(egui::TextEdit::singleline(&mut st.oai_base).desired_width(400.0));
            });
            ui.horizontal(|ui| {
                ui.label("api key:");
                ui.add(egui::TextEdit::singleline(&mut st.oai_key).desired_width(360.0));
            });
            ui.horizontal(|ui| {
                ui.label("model:");
                ui.add(egui::TextEdit::singleline(&mut st.oai_model).desired_width(200.0));
            });
        }
    }
}

fn run_button(ui: &mut egui::Ui, st: &mut OrchestratorState) {
    let can_run = !st.running && can_run(st);
    ui.horizontal(|ui| {
        if ui
            .add_enabled(
                can_run,
                egui::Button::new(format!("{} run workflow", icon::PLAY)),
            )
            .clicked()
        {
            start_run(st);
        }
        if st.running {
            ui.spinner();
            ui.label("running...");
            // Cancel only works for threaded (real) runs; the mock runs inline.
            if let Some(token) = &st.cancel
                && ui
                    .button(format!("{} cancel", icon::PROHIBIT))
                    .on_hover_text("Stop at the next stage boundary")
                    .clicked()
            {
                token.cancel();
                st.log.push(format!("{} cancel requested", icon::PROHIBIT));
            }
        }
    });

    // After a run parks with persistence on, offer reload + resume from disk.
    if st.parked && st.store.is_some() {
        ui.add_space(6.0);
        ui.group(|ui| {
            ui.strong(format!("{} parked - resume from disk", icon::PAUSE_CIRCLE));
            ui.label("External event (JSON) merged into the reloaded run:");
            widgets::code_input(ui, "orch_resume_ev", &mut st.resume_event, 2);
            if ui
                .button(format!("{} reload & resume", icon::ARROW_COUNTER_CLOCKWISE))
                .clicked()
            {
                resume_from_disk(st);
            }
        });
    }
}

fn can_run(st: &OrchestratorState) -> bool {
    match st.provider {
        Provider::Mock => true,
        Provider::Anthropic => {
            runtime::oauth::has_stored_tokens() || !st.anthropic_key.trim().is_empty()
        }
        Provider::OpenAICompat => !st.oai_key.trim().is_empty(),
    }
}

fn start_run(st: &mut OrchestratorState) {
    st.log.clear();
    st.outcome = None;
    st.parked = false;
    st.store = None;

    let program = match build_program(&st.config_toml) {
        Ok(p) => p,
        Err(e) => {
            st.log
                .push(format!("{} config error: {e}", icon::WARNING_CIRCLE));
            return;
        }
    };
    let seed = match parse_seed(&st.seed_json) {
        Ok(s) => s,
        Err(e) => {
            st.log
                .push(format!("{} seed JSON error: {e}", icon::WARNING_CIRCLE));
            return;
        }
    };

    let initial = program.config.initial.clone();
    let task = st.task.clone();

    let preset_name = crate::presets::presets()[st.preset_idx].name;
    match st.provider {
        Provider::Mock => run_mock(st, &program, &initial, seed, &task, preset_name),
        Provider::Anthropic => spawn_anthropic(st, program, initial, seed, task),
        Provider::OpenAICompat => spawn_openai(st, program, initial, seed, task),
    }
}

/// Scripted mock replies that drive the deterministic counter. State is NEVER
/// set by the model: `work`/`draft` turns call `increment_counter`, the guards
/// route on the resulting `count`. The mock cycles its list as the loop revisits
/// stages.
fn mock_responses_for(_preset_name: &str, config_toml: &str) -> Vec<MockResponse> {
    let text = |s: &str| MockResponse {
        content: s.into(),
        tool_calls: vec![],
    };
    let call = |id: &str, name: &str, args: Value| MockResponse {
        content: format!("calling {name}"),
        tool_calls: vec![runtime::MockToolCall {
            id: id.into(),
            name: name.into(),
            arguments: args,
        }],
    };
    let inc = || call("c", "increment_counter", serde_json::json!({}));

    if uses_subagents(config_toml) {
        // Shared mock serves, in call order: parent spawns -> leaf asks parent ->
        // parent answers -> leaf final -> parent increments -> parent final.
        return vec![
            call(
                "s",
                "spawn_subagent",
                serde_json::json!({ "template": "researcher", "task": "survey the problem" }),
            ),
            call(
                "a",
                "ask_parent",
                serde_json::json!({ "question": "which area first?" }),
            ),
            text("focus on the parser"),
            text("researcher: surveyed the parser area"),
            inc(),
            text("incremented; one to-do done"),
        ];
    }

    vec![
        inc(),
        text("incremented; reporting the number"),
        text("recorded"),
    ]
}

fn run_mock(
    st: &mut OrchestratorState,
    program: &WorkflowProgram,
    initial: &str,
    seed: HashMap<String, Value>,
    task: &str,
    preset_name: &str,
) {
    // The counter tool (deterministic) drives routing; the model never sets state.
    let client = MockClient::new(mock_responses_for(preset_name, &st.config_toml));
    let model = MockCompletionModel::make(&client, "mock-model");
    let cwd = run_cwd();
    let (mut toolset, produced, reader) = context_setup(&cwd);
    if uses_subagents(&st.config_toml) {
        add_spawn_tool(&mut toolset, model.clone(), &cwd);
    }
    let harness = Harness::new(model, toolset, HarnessConfig::default());
    let mut seed = seed;
    seed.extend(produced); // tool-owned keys (Tool::produces) take precedence
    let mut run = WorkflowRun::new(initial, BUDGET).with_state(seed);

    // Optional crash-recovery store (persist after each boundary).
    let store = st
        .persist
        .then(|| runtime::RunStore::for_issue(&cwd, "orch-mock"));
    let mut opts = runtime::DriveOptions::default().with_context(&reader);
    if let Some(s) = &store {
        opts = opts.with_persist(s);
    }

    let (tx, rx) = mpsc::channel();
    let cap = runtime::DEFAULT_MAX_STAGE_RUNS;
    let outcome = pollster::block_on(runtime::run_with_limit(
        &harness, program, &mut run, task, cap, opts, &tx,
    ));
    drop(tx);
    for ev in rx.try_iter() {
        if let OrchestratorEvent::Finished(o) = &ev {
            st.outcome = Some(describe_outcome(o));
            st.parked = matches!(o, Outcome::Suspended { .. });
        }
        st.log.push(describe(&ev));
    }
    st.store = store;
    if let Some(s) = &st.store {
        st.log.push(format!(
            "{} persisted run to {}",
            icon::FLOPPY_DISK,
            s.run_path().display()
        ));
    }
    if let Err(e) = outcome {
        st.log.push(format!("{} error: {e}", icon::WARNING_CIRCLE));
    }
}

fn spawn_anthropic(
    st: &mut OrchestratorState,
    program: WorkflowProgram,
    initial: String,
    seed: HashMap<String, Value>,
    task: String,
) {
    let has_oauth = runtime::oauth::has_stored_tokens();
    let key = st.anthropic_key.trim().to_string();
    let model = st.anthropic_model.trim().to_string();
    let wants_spawn = uses_subagents(&st.config_toml);

    let (tx, rx) = mpsc::channel();
    st.rx = Some(rx);
    st.running = true;
    let cancel = st.new_cancel();

    std::thread::spawn(move || {
        let rt = tokio::runtime::Runtime::new().expect("tokio runtime");
        let cwd = run_cwd();
        let cap = runtime::DEFAULT_MAX_STAGE_RUNS;
        let mut seed = seed;
        // The OAuth and API-key paths return different concrete model types, so
        // each arm builds + drives its own Harness (they can't share a binding).
        let result = rt.block_on(async {
            // Build the toolset inside each branch so the spawn tool can capture
            // that branch's concrete model.
            let (mut toolset, produced, reader) = context_setup(&cwd);
            seed.extend(produced); // tool-owned keys take precedence
            let mut run = WorkflowRun::new(initial, BUDGET).with_state(seed);
            let opts = runtime::DriveOptions::default()
                .with_context(&reader)
                .with_cancel(&cancel);
            if has_oauth {
                let m = runtime::anthropic_model_from_oauth(&model)
                    .await
                    .map_err(|e| e.to_string())?;
                if wants_spawn {
                    add_spawn_tool(&mut toolset, m.clone(), &cwd);
                }
                let harness = Harness::new(m, toolset, HarnessConfig::default());
                runtime::run_with_limit(&harness, &program, &mut run, &task, cap, opts, &tx)
                    .await
                    .map_err(|e| e.to_string())
            } else {
                let m = runtime::anthropic_model_from_creds(&key, &model, None)
                    .await
                    .map_err(|e| e.to_string())?;
                if wants_spawn {
                    add_spawn_tool(&mut toolset, m.clone(), &cwd);
                }
                let harness = Harness::new(m, toolset, HarnessConfig::default());
                runtime::run_with_limit(&harness, &program, &mut run, &task, cap, opts, &tx)
                    .await
                    .map_err(|e| e.to_string())
            }
        });
        if let Err(e) = result {
            let _ = tx.send(OrchestratorEvent::Finished(Outcome::Done {
                stage: format!("error: {e}"),
            }));
        }
    });
}

fn spawn_openai(
    st: &mut OrchestratorState,
    program: WorkflowProgram,
    initial: String,
    seed: HashMap<String, Value>,
    task: String,
) {
    let base = st.oai_base.trim().to_string();
    let key = st.oai_key.trim().to_string();
    let model_id = st.oai_model.trim().to_string();
    let wants_spawn = uses_subagents(&st.config_toml);

    let (tx, rx) = mpsc::channel();
    st.rx = Some(rx);
    st.running = true;
    let cancel = st.new_cancel();

    std::thread::spawn(move || {
        let result = (|| {
            let model =
                runtime::openai_compat_model(&base, &key, &model_id).map_err(|e| e.to_string())?;
            let cwd = run_cwd();
            let (mut toolset, produced, reader) = context_setup(&cwd);
            if wants_spawn {
                add_spawn_tool(&mut toolset, model.clone(), &cwd);
            }
            let harness = Harness::new(model, toolset, HarnessConfig::default());
            let mut seed = seed;
            seed.extend(produced); // tool-owned keys (Tool::produces) take precedence
            let mut run = WorkflowRun::new(initial, BUDGET).with_state(seed);
            let cap = runtime::DEFAULT_MAX_STAGE_RUNS;
            let opts = runtime::DriveOptions::default()
                .with_context(&reader)
                .with_cancel(&cancel);
            let rt = tokio::runtime::Runtime::new().expect("tokio runtime");
            rt.block_on(runtime::run_with_limit(
                &harness, &program, &mut run, &task, cap, opts, &tx,
            ))
            .map_err(|e| e.to_string())
        })();
        if let Err(e) = result {
            let _ = tx.send(OrchestratorEvent::Finished(Outcome::Done {
                stage: format!("error: {e}"),
            }));
        }
    });
}

/// Reload the persisted run from disk and resume it on the seed-state external
/// event (`resume_event` JSON), driving to a terminal/parked outcome. Inline
/// (mock model) since a resumed terminal stage needs no model turn.
fn resume_from_disk(st: &mut OrchestratorState) {
    let Some(store) = st.store.clone() else {
        return;
    };
    let Some(mut run) = store.load() else {
        st.log.push(format!(
            "{} no persisted run to resume",
            icon::WARNING_CIRCLE
        ));
        return;
    };
    let updates: HashMap<String, Value> = match serde_json::from_str(st.resume_event.trim()) {
        Ok(u) => u,
        Err(e) => {
            st.log.push(format!(
                "{} resume event JSON error: {e}",
                icon::WARNING_CIRCLE
            ));
            return;
        }
    };
    let program = match build_program(&st.config_toml) {
        Ok(p) => p,
        Err(e) => {
            st.log
                .push(format!("{} config error: {e}", icon::WARNING_CIRCLE));
            return;
        }
    };

    st.log.push(format!(
        "{} reloaded run from disk at `{}`; resuming with {}",
        icon::ARROW_COUNTER_CLOCKWISE,
        run.current_stage(),
        st.resume_event.trim()
    ));

    let client = MockClient::new(vec![MockResponse {
        content: "resumed".into(),
        tool_calls: vec![],
    }]);
    let model = MockCompletionModel::make(&client, "mock-model");
    let cwd = run_cwd();
    let (toolset, _produced, reader) = context_setup(&cwd);
    let harness = Harness::new(model, toolset, HarnessConfig::default());

    let (tx, rx) = mpsc::channel();
    let outcome = pollster::block_on(runtime::resume_workflow(
        &harness,
        &program,
        &mut run,
        &st.task,
        runtime::DEFAULT_MAX_STAGE_RUNS,
        runtime::DriveOptions::default().with_context(&reader),
        runtime::ExternalEvent { updates },
        &tx,
    ));
    drop(tx);
    for ev in rx.try_iter() {
        if let OrchestratorEvent::Finished(o) = &ev {
            st.outcome = Some(describe_outcome(o));
            st.parked = matches!(o, Outcome::Suspended { .. });
        }
        st.log.push(describe(&ev));
    }
    if let Err(e) = outcome {
        st.log
            .push(format!("{} resume error: {e}", icon::WARNING_CIRCLE));
    }
}

fn build_program(config_toml: &str) -> Result<WorkflowProgram, String> {
    let config: WorkflowConfig = toml::from_str(config_toml).map_err(|e| e.to_string())?;
    compile_stage(&config).map_err(|e| e.to_string())
}

fn parse_seed(s: &str) -> Result<HashMap<String, Value>, serde_json::Error> {
    let trimmed = s.trim();
    if trimmed.is_empty() {
        return Ok(HashMap::new());
    }
    serde_json::from_str(trimmed)
}

fn describe_outcome(outcome: &Outcome) -> String {
    match outcome {
        Outcome::Done { stage } => format!("Done at `{stage}`"),
        Outcome::Suspended { stage } => format!("Suspended (parked) at `{stage}`"),
        Outcome::MaxIterations { stage, ran } => {
            format!("Max iterations ({ran}) at `{stage}` - loop did not converge")
        }
        Outcome::Cancelled => "Cancelled".to_string(),
    }
}

fn describe(ev: &OrchestratorEvent) -> String {
    let a = icon::ARROW_RIGHT;
    match ev {
        OrchestratorEvent::StageEntered { stage, handoff } => match handoff {
            Some(h) => format!("{} stage `{stage}` {a} handoff: {h:?}", icon::FLOW_ARROW),
            None => format!("{} stage `{stage}`", icon::FLOW_ARROW),
        },
        OrchestratorEvent::Harness(h) => format!("   {}", describe_harness(h)),
        OrchestratorEvent::StateParsed { stage, updates } => {
            let kv = serde_json::to_string(updates).unwrap_or_default();
            format!("   {} `{stage}` published state {kv}", icon::BRACKETS_CURLY)
        }
        OrchestratorEvent::StageRouted { from, now, parked } => {
            if *parked {
                format!("{} `{from}` {a} parked (no exit fired)", icon::PAUSE_CIRCLE)
            } else {
                format!("{} `{from}` {a} `{now}`", icon::ARROW_BEND_DOWN_RIGHT)
            }
        }
        OrchestratorEvent::Finished(o) => {
            format!("{} {}", icon::CHECK_CIRCLE, describe_outcome(o))
        }
    }
}

fn describe_harness(e: &HarnessEvent) -> String {
    let a = icon::ARROW_RIGHT;
    match e {
        HarnessEvent::ModelCall { turn } => format!("{} model call (turn {turn})", icon::BRAIN),
        HarnessEvent::TextChunk { text } => format!("{} {text}", icon::ARROW_BEND_DOWN_LEFT),
        HarnessEvent::ToolCall { name, args } => {
            format!("{} tool {a} {name}({args})", icon::WRENCH)
        }
        HarnessEvent::ToolResult {
            name,
            result,
            truncated,
        } => format!(
            "{} tool result {a} {name} {a} {result}{}",
            icon::ARROW_BEND_DOWN_LEFT,
            if *truncated { " [truncated]" } else { "" }
        ),
        HarnessEvent::Done { output, usage, .. } => {
            format!(
                "{} done {a} {output:?} ({} tok)",
                icon::CHECK,
                usage.total_tokens
            )
        }
        HarnessEvent::Cancelled => format!("{} cancelled", icon::PROHIBIT),
    }
}
