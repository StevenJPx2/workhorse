use std::path::PathBuf;
use std::sync::Arc;

use eframe::egui;
use egui_phosphor::regular as icon;
use sandbox::LocalSandbox;
use services::{Registry, ScriptService};
use tools::ToolContext;

use crate::widgets;

pub struct RegistryState {
    cwd: String,
    log: Vec<String>,
    built: bool,
    tools: Vec<ToolRow>,
}

struct ToolRow {
    name: String,
    description: String,
    schema: String,
    args: String,
    result: String,
}

impl Default for RegistryState {
    fn default() -> Self {
        // Default to the demo crate's own dir so .workhorse/scripts is writable.
        let cwd = std::env::current_dir()
            .map_or_else(|_| "/tmp/wh-demo".into(), |p| p.display().to_string());
        Self {
            cwd,
            log: Vec::new(),
            built: false,
            tools: Vec::new(),
        }
    }
}

fn home() -> PathBuf {
    std::env::var("HOME").map_or_else(|_| PathBuf::from("/tmp"), PathBuf::from)
}

fn build_registry(cwd: &str) -> (Registry, Arc<ScriptService>) {
    let sandbox = Arc::new(LocalSandbox::new());
    let svc = ScriptService::new(PathBuf::from(cwd), home(), sandbox);
    let mut reg = Registry::new();
    reg.register(svc.clone());
    (reg, svc)
}

fn default_args(name: &str) -> String {
    match name {
        "run_script" => "{}".into(),
        "read_script" => r#"{"name":"greet"}"#.into(),
        "write_script" => {
            r#"{"name":"greet","command":"echo \"hello $1\"","description":"Greet someone","args":{"positional":[{"name":"who","description":"who to greet","required":true}]}}"#.into()
        }
        _ => "null".into(),
    }
}

pub fn ui(ui: &mut egui::Ui, st: &mut RegistryState) {
    ui.heading(format!("{} Registry", icon::CARDS));
    ui.add_space(4.0);
    ui.label("Real services contribute tools. ScriptService discovers .sh scripts under <cwd>/.workhorse/scripts.");
    ui.add_space(6.0);

    ui.horizontal(|ui| {
        ui.label(format!("{} cwd:", icon::FOLDER));
        ui.add(egui::TextEdit::singleline(&mut st.cwd).desired_width(420.0));
    });
    ui.add_space(4.0);

    if ui
        .button(format!("{} register ScriptService + build", icon::PLAY))
        .clicked()
    {
        st.log.clear();
        st.tools.clear();

        let (reg, _svc) = build_registry(&st.cwd);
        let ctx = ToolContext::new(&st.cwd);
        let toolset = pollster::block_on(reg.build_toolset(&ctx));
        let defs = pollster::block_on(toolset.get_tool_definitions()).unwrap_or_default();

        st.tools = defs
            .iter()
            .map(|d| ToolRow {
                name: d.name.clone(),
                description: d.description.clone(),
                schema: serde_json::to_string_pretty(&d.parameters).unwrap_or_default(),
                args: default_args(&d.name),
                result: String::new(),
            })
            .collect();
        st.built = true;
        st.log.push(format!(
            "{} registered scripts; built {} tool(s)",
            icon::CHECK,
            defs.len()
        ));
        pollster::block_on(reg.teardown(&ctx));
    }

    if !st.built {
        return;
    }
    ui.add_space(8.0);
    ui.separator();
    ui.label(format!(
        "{} Tools (each calls real code):",
        icon::LIST_BULLETS
    ));
    ui.add_space(4.0);

    // Rebuild a fresh toolset for calling.
    let (reg, _svc) = build_registry(&st.cwd);
    let ctx = ToolContext::new(&st.cwd);
    let toolset = pollster::block_on(reg.build_toolset(&ctx));

    for row in &mut st.tools {
        ui.horizontal(|ui| {
            ui.monospace(format!("{} {}", icon::WRENCH, row.name));
            if ui.button(format!("{} call", icon::PLAY)).clicked() {
                match pollster::block_on(toolset.call(&row.name, row.args.clone())) {
                    Ok(r) => row.result = r,
                    Err(e) => row.result = format!("error: {e}"),
                }
            }
        });
        // The exact description an agent sees when this tool is listed.
        ui.indent(&row.name, |ui| {
            ui.colored_label(egui::Color32::from_gray(0xb0), &row.description);
            ui.collapsing(format!("{} input schema", icon::CODE), |ui| {
                widgets::code_output(ui, &format!("{}-schema", row.name), &row.schema, 8);
            });
        });
        ui.horizontal(|ui| {
            ui.label("  args:");
            ui.add(
                egui::TextEdit::singleline(&mut row.args)
                    .code_editor()
                    .desired_width(440.0),
            );
        });
        if !row.result.is_empty() {
            render_result(ui, &row.name, &row.result);
        }
        ui.separator();
    }

    if !st.log.is_empty() {
        ui.separator();
        for line in &st.log {
            ui.monospace(line);
        }
    }
}

/// Render a tool-call result. `raw` is the exact JSON the tool returns to the
/// model (the serialized `ToolResult`). Show it verbatim in a multiline box —
/// the embedded `\n` render as real line breaks — so a human reads the same
/// payload the agent receives.
fn render_result(ui: &mut egui::Ui, name: &str, raw: &str) {
    let ok = !raw.contains("\"ok\":false") && !raw.starts_with("error");
    let (color, glyph) = if ok {
        (
            egui::Color32::from_rgb(0x4c, 0xaf, 0x50),
            icon::CHECK_CIRCLE,
        )
    } else {
        (
            egui::Color32::from_rgb(0xe5, 0x73, 0x73),
            icon::WARNING_CIRCLE,
        )
    };
    ui.indent(format!("{name}-result"), |ui| {
        ui.colored_label(color, format!("{glyph} agent receives this tool result:"));
        // The exact wire string the model gets is the serialized ToolResult,
        // e.g. {"ok":true,"output":"line1\nline2"}. Display the full envelope
        // (so it's clear what the agent sees) but turn the escaped `\n`/`\t`
        // into real line breaks so multi-line output is legible.
        let display = raw.replace("\\n", "\n").replace("\\t", "\t");
        widgets::code_output(ui, &format!("{name}-result-box"), &display, 6);
    });
}
