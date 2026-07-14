//! Panel: the `WorkflowRun` governor (runtime crate, spike E).
//!
//! Drive the sans-IO governor by hand — exactly as the Orchestrator would:
//!   `next_step` → `RunStage`, then `stage_complete(updates, tokens)` → gate,
//!   a stage with no firing exit parks (`Suspend`), `resume(updates)` unparks it,
//!   a terminal stage reports `Done`. The serialized snapshot proves a parked run
//!   round-trips to JSON and back.

use std::collections::HashMap;

use eframe::egui;
use egui_phosphor::regular as icon;
use pipeline::{WorkflowProgram, compile_stage, compiler::WorkflowConfig};
use runtime::{WorkflowRun, WorkflowRunStep};
use serde_json::{Value, json};

use crate::{compiler_panel, widgets};

const BUDGET: u64 = 100_000;

/// Guards read state keys that must already exist (an `UnknownKey` is an error,
/// not a falsy default), so the run starts with the keys its exits reference.
fn seed_state() -> HashMap<String, Value> {
    HashMap::from([
        ("todo_count".to_string(), json!(1)),
        ("status".to_string(), json!("pending")),
    ])
}

fn fresh_run() -> WorkflowRun {
    WorkflowRun::new("plan", BUDGET).with_state(seed_state())
}

pub struct WorkflowState {
    program: WorkflowProgram,
    run: WorkflowRun,
    updates_json: String,
    tokens: u64,
    log: Vec<String>,
    snapshot: String,
}

impl Default for WorkflowState {
    fn default() -> Self {
        let program = build_program();
        let run = fresh_run();
        let mut st = Self {
            program,
            run,
            updates_json: "{ \"todo_count\": 0 }".to_string(),
            tokens: 500,
            log: vec!["run created at stage `plan`".to_string()],
            snapshot: String::new(),
        };
        st.refresh_snapshot();
        st
    }
}

fn build_program() -> WorkflowProgram {
    let config: WorkflowConfig =
        toml::from_str(compiler_panel::SAMPLE).expect("sample config parses");
    compile_stage(&config).expect("sample config compiles")
}

pub fn ui(ui: &mut egui::Ui, st: &mut WorkflowState) {
    let a = icon::ARROW_RIGHT;
    ui.label(format!("Hand-drive the governor. Try: next_step {a} stage_complete{{todo_count:0}} {a} next_step {a} stage_complete{{}} (parks) {a} resume{{status:\"approved\"}} {a} next_step (done)."));
    ui.add_space(6.0);

    render_status(ui, st);
    ui.add_space(6.0);
    render_controls(ui, st);
    ui.separator();

    egui::ScrollArea::vertical().show(ui, |ui| {
        ui.strong("event log");
        for line in st.log.iter().rev() {
            ui.monospace(line);
        }
        ui.add_space(8.0);
        ui.strong("serialized WorkflowRun (the park snapshot)");
        widgets::code_output(ui, "wf_snap", &st.snapshot, 12);
    });
}

fn render_status(ui: &mut egui::Ui, st: &WorkflowState) {
    let phase = if st.run.is_done() {
        "DONE"
    } else if st.run.is_suspended() {
        "SUSPENDED (parked)"
    } else {
        "active"
    };
    ui.horizontal(|ui| {
        ui.strong("stage:");
        ui.monospace(st.run.current_stage());
        ui.separator();
        ui.strong("phase:");
        widgets::status(ui, !st.run.is_suspended(), phase);
        ui.separator();
        ui.strong("tokens:");
        ui.monospace(format!("{} / {}", st.run.total_tokens(), BUDGET));
    });
}

fn render_controls(ui: &mut egui::Ui, st: &mut WorkflowState) {
    ui.horizontal(|ui| {
        if ui
            .button(format!("{} next_step", icon::ARROW_RIGHT))
            .clicked()
        {
            do_next_step(st);
        }
        if ui
            .button(format!("{} stage_complete", icon::CHECK))
            .clicked()
        {
            do_stage_complete(st);
        }
        if ui.button(format!("{} resume", icon::PLAY)).clicked() {
            do_resume(st);
        }
        if ui.button(format!("{} cancel", icon::PROHIBIT)).clicked() {
            st.run.cancel();
            st.log
                .push(format!("cancel() {} run cancelled", icon::ARROW_RIGHT));
            st.refresh_snapshot();
        }
        if ui
            .button(format!("{} reset", icon::ARROW_COUNTER_CLOCKWISE))
            .clicked()
        {
            st.run = fresh_run();
            st.log = vec![format!("reset {} stage `plan`", icon::ARROW_RIGHT)];
            st.refresh_snapshot();
        }
    });
    ui.horizontal(|ui| {
        ui.label("updates (JSON):");
        ui.add(egui::TextEdit::singleline(&mut st.updates_json).desired_width(360.0));
        ui.label("tokens:");
        ui.add(egui::DragValue::new(&mut st.tokens).range(0..=50_000));
    });
}

fn do_next_step(st: &mut WorkflowState) {
    match st.run.next_step(&st.program) {
        Ok(step) => st.log.push(format!(
            "next_step {} {}",
            icon::ARROW_RIGHT,
            describe(&step)
        )),
        Err(e) => st.log.push(format!("next_step ERROR: {e}")),
    }
    st.refresh_snapshot();
}

fn do_stage_complete(st: &mut WorkflowState) {
    let updates = match parse_updates(&st.updates_json) {
        Ok(u) => u,
        Err(e) => {
            st.log.push(format!("updates JSON ERROR: {e}"));
            return;
        }
    };
    match st.run.stage_complete(&st.program, updates, st.tokens) {
        Ok(()) => st.log.push(format!(
            "stage_complete(+{} tok) {} now at `{}`{}",
            st.tokens,
            icon::ARROW_RIGHT,
            st.run.current_stage(),
            if st.run.is_suspended() {
                " [parked]"
            } else {
                ""
            }
        )),
        Err(e) => st.log.push(format!("stage_complete ERROR: {e}")),
    }
    st.refresh_snapshot();
}

fn do_resume(st: &mut WorkflowState) {
    let updates = match parse_updates(&st.updates_json) {
        Ok(u) => u,
        Err(e) => {
            st.log.push(format!("updates JSON ERROR: {e}"));
            return;
        }
    };
    match st.run.resume(&st.program, updates) {
        Ok(()) => st.log.push(format!(
            "resume {} now at `{}`{}",
            icon::ARROW_RIGHT,
            st.run.current_stage(),
            if st.run.is_suspended() {
                " [still parked]"
            } else {
                ""
            }
        )),
        Err(e) => st.log.push(format!("resume ERROR: {e}")),
    }
    st.refresh_snapshot();
}

fn parse_updates(s: &str) -> Result<HashMap<String, Value>, serde_json::Error> {
    let trimmed = s.trim();
    if trimmed.is_empty() {
        return Ok(HashMap::new());
    }
    serde_json::from_str(trimmed)
}

fn describe(step: &WorkflowRunStep) -> String {
    match step {
        WorkflowRunStep::RunStage { stage, handoff } => match handoff {
            Some(h) => format!("RunStage {{ stage: {stage}, handoff: {h:?} }}"),
            None => format!("RunStage {{ stage: {stage} }}"),
        },
        WorkflowRunStep::Suspend { stage } => format!("Suspend {{ stage: {stage} }}"),
        WorkflowRunStep::Done { stage } => format!("Done {{ stage: {stage} }}"),
        WorkflowRunStep::Cancelled => "Cancelled".to_string(),
    }
}

impl WorkflowState {
    fn refresh_snapshot(&mut self) {
        self.snapshot = serde_json::to_string_pretty(&self.run).unwrap_or_default();
    }
}
