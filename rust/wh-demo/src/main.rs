//! Native egui smoke-test surface for the workhorse Rust port.
//!
//! Three panels, each wired to the real crates (no logic mocked):
//!   • When  — parse a `when` string → AST → evaluate against an editable state map.
//!   • Compiler — lower a `snake_case` workflow config (`TOML`) → `WorkflowProgram`.
//!   • Workflow — step the sans-IO `WorkflowRun` governor: run → gate → park → resume → done.
//!
//! Run it: `cargo run -p wh-demo` (from `rust/`). No browser, no wasm — just a window.

mod compiler_panel;
mod harness_panel;
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
    Harness,
    Registry,
}

struct DemoApp {
    tab: Tab,
    when: when_panel::WhenState,
    compiler: compiler_panel::CompilerState,
    workflow: workflow_panel::WorkflowState,
    harness: harness_panel::HarnessPanelState,
    registry: registry_panel::RegistryState,
}

impl Default for DemoApp {
    fn default() -> Self {
        Self {
            tab: Tab::When,
            when: when_panel::WhenState::default(),
            compiler: compiler_panel::CompilerState::default(),
            workflow: workflow_panel::WorkflowState::default(),
            harness: harness_panel::HarnessPanelState::default(),
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
                    Tab::Harness,
                    format!("{} Harness", icon::ROBOT),
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
            Tab::Harness => harness_panel::ui(ui, &mut self.harness),
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
