//! Panel: the `when` expression language (pipeline crate, spike C).
//!
//! Type a guard string → `parse_expr` → see the `Expr` AST + the state keys it
//! reads → evaluate it against an editable JSON state map.

use std::collections::HashMap;

use eframe::egui;
use egui_phosphor::regular as icon;
use pipeline::parse_expr;
use serde_json::Value;

use crate::widgets;

pub struct WhenState {
    expr_src: String,
    state_json: String,
}

impl Default for WhenState {
    fn default() -> Self {
        Self {
            expr_src: "todo_count == 0 and git_clean".to_string(),
            state_json: "{\n  \"todo_count\": 0,\n  \"git_clean\": true\n}".to_string(),
        }
    }
}

pub fn ui(ui: &mut egui::Ui, st: &mut WhenState) {
    ui.label("A `when` guard is the edge a WorkflowRun evaluates. Parse one, then evaluate it.");
    ui.add_space(6.0);

    egui::ScrollArea::vertical().show(ui, |ui| {
        ui.strong("when expression");
        widgets::code_input(ui, "when_expr", &mut st.expr_src, 2);
        ui.add_space(6.0);

        ui.strong("state map (JSON)");
        widgets::code_input(ui, "when_state", &mut st.state_json, 6);
        ui.add_space(8.0);

        render_result(ui, st);
    });
}

fn render_result(ui: &mut egui::Ui, st: &WhenState) {
    let expr = match parse_expr(&st.expr_src) {
        Ok(e) => e,
        Err(e) => {
            widgets::status(ui, false, &format!("parse error: {e}"));
            return;
        }
    };
    widgets::status(ui, true, "parsed");

    ui.add_space(6.0);
    ui.strong("AST");
    let ast = serde_json::to_string_pretty(&expr).unwrap_or_default();
    widgets::code_output(ui, "when_ast", &ast, 10);

    ui.add_space(4.0);
    let keys = expr.known_keys();
    ui.label(format!("state keys read: {}", join_keys(&keys)));

    ui.add_space(8.0);
    let state: HashMap<String, Value> = match serde_json::from_str(&st.state_json) {
        Ok(s) => s,
        Err(e) => {
            widgets::status(ui, false, &format!("state JSON error: {e}"));
            return;
        }
    };

    match expr.evaluate(&state) {
        Ok(b) => {
            ui.strong(format!("evaluate {}", icon::ARROW_RIGHT));
            widgets::status(ui, b, if b { "true" } else { "false" });
        }
        Err(e) => widgets::status(ui, false, &format!("evaluate error: {e}")),
    }
}

fn join_keys(keys: &[String]) -> String {
    if keys.is_empty() {
        "(none)".to_string()
    } else {
        keys.join(", ")
    }
}
