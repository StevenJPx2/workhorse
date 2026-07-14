//! Panel: the `Harness` driving `AgentRun` (runtime crate, spike D + real models).
//!
//! Proves the Harness is generic over the model (`Harness<M: CompletionModel>`):
//! pick a provider from the dropdown, configure credentials, and drive a real
//! or mock model through the step. The production app reads provider/model/key
//! from config; this panel is the demo surface.
//!
//! Real model calls run on a background thread with events streamed to the UI
//! as they happen via `run_step_streaming`.

use std::sync::mpsc;

use eframe::egui;
use egui_phosphor::regular as icon;
use rig::completion::CompletionModel as _;
use rig::tool::ToolSet;
use runtime::{
    Harness, HarnessConfig, HarnessEvent, MockClient, MockCompletionModel, MockResponse,
};

use crate::widgets;

#[derive(PartialEq, Eq, Clone, Copy)]
enum Provider {
    Mock,
    Anthropic,
    OpenAICompat,
}

pub struct HarnessPanelState {
    provider: Provider,
    prologue: String,
    epilogue: String,
    task: String,
    response: String,
    events: Vec<String>,
    sent: String,
    anthropic_model: String,
    anthropic_key: String,
    anthropic_base: String,
    oai_base: String,
    oai_key: String,
    oai_model: String,
    running: bool,
    rx: Option<mpsc::Receiver<HarnessEvent>>,
    text_buffer: String,
}

impl Default for HarnessPanelState {
    fn default() -> Self {
        Self {
            provider: Provider::Mock,
            prologue: "You are a planner.".to_string(),
            epilogue: "Output the plan.".to_string(),
            task: "Break the issue into todos.".to_string(),
            response: "Here is the plan: 1) scope 2) build 3) verify".to_string(),
            events: Vec::new(),
            sent: String::new(),
            anthropic_model: runtime::ANTHROPIC_DEFAULT_MODEL.to_string(),
            anthropic_key: String::new(),
            anthropic_base: String::new(),
            oai_base: runtime::OPENCODE_ZEN_BASE_URL.to_string(),
            oai_key: String::new(),
            oai_model: runtime::DEFAULT_OPENCODE_MODEL.to_string(),
            running: false,
            rx: None,
            text_buffer: String::new(),
        }
    }
}

pub fn ui(ui: &mut egui::Ui, st: &mut HarnessPanelState) {
    ui.label("Drive a model through the generic Harness<M: CompletionModel>. Pick a provider, configure credentials, and run.");
    ui.add_space(6.0);

    // Drain all pending events from the background thread.
    // TextChunk events are accumulated into a single running response line;
    // all other events flush the buffer first.
    if let Some(rx) = &st.rx {
        for ev in rx.try_iter() {
            let is_done = matches!(ev, HarnessEvent::Done { .. } | HarnessEvent::Cancelled);
            if let HarnessEvent::TextChunk { text } = &ev {
                st.text_buffer.push_str(text);
            } else {
                if !st.text_buffer.is_empty() {
                    st.events.push(format!(
                        "{} {}",
                        icon::ARROW_BEND_DOWN_LEFT,
                        st.text_buffer.clone()
                    ));
                    st.text_buffer.clear();
                }
                st.events.push(describe(&ev));
            }
            if is_done {
                if !st.text_buffer.is_empty() {
                    st.events.push(format!(
                        "{} {}",
                        icon::ARROW_BEND_DOWN_LEFT,
                        st.text_buffer.clone()
                    ));
                    st.text_buffer.clear();
                }
                st.running = false;
                st.rx = None;
                break;
            }
        }
    }

    egui::ScrollArea::vertical().show(ui, |ui| {
        provider_selector(ui, st);
        provider_fields(ui, st);
        step_config_fields(ui, st);
        run_button(ui, st);

        if !st.events.is_empty() {
            ui.strong("HarnessEvent stream");
            for e in &st.events {
                ui.monospace(e);
            }
            ui.add_space(8.0);
            ui.strong("messages the model received");
            widgets::code_output(ui, "h_sent", &st.sent, 8);
        }
    });
}

fn provider_selector(ui: &mut egui::Ui, st: &mut HarnessPanelState) {
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
    ui.add_space(4.0);
}

fn provider_fields(ui: &mut egui::Ui, st: &mut HarnessPanelState) {
    match st.provider {
        Provider::Mock => {
            ui.label("Offline mock with scripted responses. No credentials needed.");
        }
        Provider::Anthropic => {
            ui.label("Claude via Anthropic API. OAuth tokens take precedence over API key.");
            ui.horizontal(|ui| {
                ui.label("model:");
                ui.add(egui::TextEdit::singleline(&mut st.anthropic_model).desired_width(200.0));
            });
            let has_oauth = runtime::oauth::has_stored_tokens();
            if has_oauth {
                widgets::status(ui, true, "OAuth tokens found (will use Bearer auth)");
            } else {
                widgets::status(
                    ui,
                    false,
                    "No OAuth tokens — run `--auth` or set API key below",
                );
            }
            ui.horizontal(|ui| {
                ui.label("api key:");
                ui.add(egui::TextEdit::singleline(&mut st.anthropic_key).desired_width(360.0));
            });
            ui.horizontal(|ui| {
                ui.label("base url:");
                ui.add(egui::TextEdit::singleline(&mut st.anthropic_base).desired_width(360.0));
                ui.label("(optional)");
            });
        }
        Provider::OpenAICompat => {
            ui.label("OpenAI-compatible endpoint (opencode zen, gateways, OpenAI).");
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

fn step_config_fields(ui: &mut egui::Ui, st: &mut HarnessPanelState) {
    ui.add_space(6.0);
    ui.strong("step config");
    ui.horizontal(|ui| {
        ui.label("prologue:");
        ui.add(egui::TextEdit::singleline(&mut st.prologue).desired_width(360.0));
    });
    ui.horizontal(|ui| {
        ui.label("epilogue:");
        ui.add(egui::TextEdit::singleline(&mut st.epilogue).desired_width(360.0));
    });
    ui.add_space(4.0);
    ui.strong("task");
    widgets::code_input(ui, "h_task", &mut st.task, 2);
    if st.provider == Provider::Mock {
        ui.strong("scripted model response");
        widgets::code_input(ui, "h_resp", &mut st.response, 2);
    }
    ui.add_space(6.0);
}

fn run_button(ui: &mut egui::Ui, st: &mut HarnessPanelState) {
    let can_run = !st.running && can_run(st);
    ui.horizontal(|ui| {
        if ui
            .add_enabled(
                can_run,
                egui::Button::new(format!("{} run step", icon::PLAY)),
            )
            .clicked()
        {
            run_harness(st);
        }
        if st.running {
            ui.spinner();
            ui.label("running...");
        }
    });
    ui.add_space(8.0);
}

fn can_run(st: &HarnessPanelState) -> bool {
    match st.provider {
        Provider::Mock => true,
        Provider::Anthropic => {
            runtime::oauth::has_stored_tokens() || !st.anthropic_key.trim().is_empty()
        }
        Provider::OpenAICompat => !st.oai_key.trim().is_empty(),
    }
}

fn run_harness(st: &mut HarnessPanelState) {
    let step = pipeline::compiler::StepConfig {
        prologue: non_empty(&st.prologue),
        epilogue: non_empty(&st.epilogue),
        ..Default::default()
    };

    match st.provider {
        Provider::Mock => {
            // Mock is synchronous — no background thread needed.
            let client = MockClient::new(vec![MockResponse {
                content: st.response.clone(),
                tool_calls: vec![],
            }]);
            let model = MockCompletionModel::make(&client, "mock-model");
            let harness = Harness::new(model, ToolSet::builder().build(), HarnessConfig::default());
            let (tx, rx) = mpsc::channel();
            let result = pollster::block_on(harness.run_step(
                &step,
                &st.task,
                None,
                &runtime::no_epilogue,
                &tx,
            ));
            // Drain streamed events from the mock, accumulating text chunks.
            st.text_buffer.clear();
            for ev in rx.try_iter() {
                if let HarnessEvent::TextChunk { text } = &ev {
                    st.text_buffer.push_str(text);
                } else {
                    if !st.text_buffer.is_empty() {
                        st.events.push(format!(
                            "{} {}",
                            icon::ARROW_BEND_DOWN_LEFT,
                            st.text_buffer.clone()
                        ));
                        st.text_buffer.clear();
                    }
                    st.events.push(describe(&ev));
                }
            }
            if !st.text_buffer.is_empty() {
                st.events.push(format!(
                    "{} {}",
                    icon::ARROW_BEND_DOWN_LEFT,
                    st.text_buffer.clone()
                ));
                st.text_buffer.clear();
            }
            if let Err(e) = result {
                st.events
                    .push(format!("{} error: {e}", icon::WARNING_CIRCLE));
            }
            st.sent = client.received_text();
        }
        Provider::Anthropic => {
            st.sent = format!("(Anthropic: {})", st.anthropic_model.trim());
            st.events.clear();
            spawn_anthropic(st, step);
        }
        Provider::OpenAICompat => {
            st.sent = format!(
                "(openai-compat: {} @ {})",
                st.oai_model.trim(),
                st.oai_base.trim()
            );
            st.events.clear();
            spawn_openai_compat(st, step);
        }
    }
}

fn spawn_anthropic(st: &mut HarnessPanelState, step: pipeline::compiler::StepConfig) {
    let task = st.task.clone();
    let has_oauth = runtime::oauth::has_stored_tokens();
    let key = st.anthropic_key.trim().to_string();
    let model = st.anthropic_model.trim().to_string();
    let base = non_empty(st.anthropic_base.trim());

    let (tx, rx) = mpsc::channel();
    st.rx = Some(rx);
    st.running = true;

    std::thread::spawn(move || {
        let rt = tokio::runtime::Runtime::new().expect("tokio runtime");
        let result: Result<(), String> = if has_oauth {
            rt.block_on(async {
                let m = runtime::anthropic_model_from_oauth(&model)
                    .await
                    .map_err(|e| e.to_string())?;
                Harness::new(m, ToolSet::builder().build(), HarnessConfig::default())
                    .run_step(&step, &task, None, &runtime::no_epilogue, &tx)
                    .await
                    .map_err(|e| e.to_string())?;
                Ok(())
            })
        } else {
            rt.block_on(async {
                let m = runtime::anthropic_model_from_creds(&key, &model, base.as_deref())
                    .await
                    .map_err(|e| e.to_string())?;
                Harness::new(m, ToolSet::builder().build(), HarnessConfig::default())
                    .run_step(&step, &task, None, &runtime::no_epilogue, &tx)
                    .await
                    .map_err(|e| e.to_string())?;
                Ok(())
            })
        };
        send_error_or_done(&tx, result);
    });
}

fn spawn_openai_compat(st: &mut HarnessPanelState, step: pipeline::compiler::StepConfig) {
    let task = st.task.clone();
    let base = st.oai_base.trim().to_string();
    let key = st.oai_key.trim().to_string();
    let model_id = st.oai_model.trim().to_string();

    let (tx, rx) = mpsc::channel();
    st.rx = Some(rx);
    st.running = true;

    std::thread::spawn(move || {
        let result: Result<(), String> = (|| {
            let model =
                runtime::openai_compat_model(&base, &key, &model_id).map_err(|e| e.to_string())?;
            let harness = Harness::new(model, ToolSet::builder().build(), HarnessConfig::default());
            let rt = tokio::runtime::Runtime::new().expect("tokio runtime");
            rt.block_on(harness.run_step(&step, &task, None, &runtime::no_epilogue, &tx))
                .map_err(|e| e.to_string())?;
            Ok(())
        })();
        send_error_or_done(&tx, result);
    });
}

fn send_error_or_done<E: std::fmt::Display>(
    tx: &mpsc::Sender<HarnessEvent>,
    result: Result<(), E>,
) {
    if let Err(e) = result {
        let _ = tx.send(HarnessEvent::Done {
            output: format!("error: {e}"),
            usage: rig::completion::Usage::new(),
            state: std::collections::HashMap::new(),
        });
    }
}

fn non_empty(s: &str) -> Option<String> {
    if s.is_empty() {
        None
    } else {
        Some(s.to_string())
    }
}

fn describe(e: &HarnessEvent) -> String {
    let a = icon::ARROW_RIGHT;
    match e {
        HarnessEvent::ModelCall { turn } => format!("{} ModelCall {a} turn {turn}", icon::BRAIN),
        HarnessEvent::TextChunk { text } => format!("{} {text}", icon::ARROW_BEND_DOWN_LEFT),
        HarnessEvent::ToolCall { name, args } => {
            format!("{} ToolCall {a} {name}({args})", icon::WRENCH)
        }
        HarnessEvent::ToolResult {
            name,
            result,
            truncated,
        } => format!(
            "{} ToolResult {a} {name} {a} {result}{}",
            icon::ARROW_BEND_DOWN_LEFT,
            if *truncated { " [truncated]" } else { "" }
        ),
        HarnessEvent::Done { output, usage, .. } => format!(
            "{} Done {a} {output:?} (tokens: {})",
            icon::CHECK_CIRCLE,
            usage.total_tokens
        ),
        HarnessEvent::Cancelled => format!("{} Cancelled", icon::PROHIBIT),
    }
}
