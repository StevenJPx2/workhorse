//! Panel: the config → pipeline compiler (pipeline crate, spike C).
//!
//! Edit a `snake_case` workflow config (`TOML`) → `compile_stage` → see each stage's
//! compiled `when`-guarded exits, and run a stage's lowered `ValueOp` pipeline.

use eframe::egui;
use egui_phosphor::regular as icon;
use pipeline::compile_stage;
use pipeline::compiler::WorkflowConfig;
use serde_json::{Value, json};

use crate::widgets;

pub(crate) const SAMPLE: &str = r#"name = "demo"
version = "1"

[[states]]
name = "plan"
steps = ["draft"]
[[states.exits]]
when = "todo_count == 0"
to = "review"
epilogue = "Summarize the plan for review."

[[states]]
name = "review"
steps = ["inspect"]
[[states.exits]]
when = "status == \"approved\""
to = "done"
epilogue = "Approved - proceed."
[[states.exits]]
when = "status == \"changes_requested\""
to = "plan"
epilogue = "Address the requested changes."

[[states]]
name = "done"
steps = []

[steps.draft]
prologue = "You are planning."
epilogue = "List remaining todos."

[steps.inspect]
prologue = "You are reviewing."
"#;

pub struct CompilerState {
    config_toml: String,
    run_stage: String,
    run_input: String,
    run_output: Option<String>,
}

impl Default for CompilerState {
    fn default() -> Self {
        Self {
            config_toml: SAMPLE.to_string(),
            run_stage: "plan".to_string(),
            run_input: "{ \"task\": \"ship it\" }".to_string(),
            run_output: None,
        }
    }
}

pub fn ui(ui: &mut egui::Ui, st: &mut CompilerState) {
    ui.label("Lower a declarative config into a WorkflowProgram, then run a stage's pipeline.");
    ui.add_space(6.0);

    egui::ScrollArea::vertical().show(ui, |ui| {
        ui.strong("workflow config (TOML)");
        widgets::code_input(ui, "cfg", &mut st.config_toml, 14);
        ui.add_space(8.0);

        let config: WorkflowConfig = match toml::from_str(&st.config_toml) {
            Ok(c) => c,
            Err(e) => {
                widgets::status(ui, false, &format!("TOML parse error: {e}"));
                return;
            }
        };

        let program = match compile_stage(&config) {
            Ok(p) => p,
            Err(e) => {
                widgets::status(ui, false, &format!("compile error: {e}"));
                return;
            }
        };
        widgets::status(ui, true, "compiled");
        ui.add_space(6.0);

        render_stages(ui, &program);
        ui.add_space(10.0);
        render_runner(ui, st, &program);
    });
}

fn render_stages(ui: &mut egui::Ui, program: &pipeline::WorkflowProgram) {
    ui.strong("compiled stages");
    for stage in &program.config.states {
        let exits = program.compiled_exits.get(&stage.name);
        let exit_count = exits.map_or(0, Vec::len);
        let terminal = if exit_count == 0 {
            format!("  {} terminal", icon::FLAG_CHECKERED)
        } else {
            String::new()
        };
        let dot = icon::DOT_OUTLINE;
        egui::CollapsingHeader::new(format!(
            "{} {dot} steps[{}] {dot} exits[{}]{}",
            stage.name,
            stage.steps.len(),
            exit_count,
            terminal
        ))
        .id_salt(format!("stage_{}", stage.name))
        .show(ui, |ui| {
            if let Some(exits) = exits {
                for exit in exits {
                    let when = serde_json::to_string(&exit.expr).unwrap_or_default();
                    ui.label(format!("{} {}   when {}", icon::ARROW_RIGHT, exit.to, when));
                    if let Some(ep) = &exit.epilogue {
                        ui.weak(format!("   handoff: {ep}"));
                    }
                }
            }
        });
    }
}

fn render_runner(ui: &mut egui::Ui, st: &mut CompilerState, program: &pipeline::WorkflowProgram) {
    ui.strong("run a stage pipeline (ValueOp)");
    ui.horizontal(|ui| {
        ui.label("stage:");
        ui.text_edit_singleline(&mut st.run_stage);
        if ui.button(format!("{} run", icon::PLAY)).clicked() {
            st.run_output = Some(run_stage(program, &st.run_stage, &st.run_input));
        }
    });
    ui.label("input (JSON object):");
    widgets::code_input(ui, "run_in", &mut st.run_input, 2);
    if let Some(out) = &st.run_output {
        ui.add_space(4.0);
        ui.strong("output");
        widgets::code_output(ui, "run_out", out, 8);
    }
}

fn run_stage(program: &pipeline::WorkflowProgram, stage: &str, input: &str) -> String {
    let input: Value = serde_json::from_str(input).unwrap_or_else(|_| json!({}));
    match program.build_stage_pipeline(stage) {
        Ok(op) => {
            let out = pollster::block_on(op.call(input));
            serde_json::to_string_pretty(&out).unwrap_or_default()
        }
        Err(e) => format!("error: {e}"),
    }
}
