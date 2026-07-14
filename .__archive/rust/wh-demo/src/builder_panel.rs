//! Panel: a visual workflow Builder.
//!
//! Two synced views of one editable model:
//! - a **flowchart** — draggable stage nodes with exit edges drawn between them;
//!   add/delete stages, draw edges, and edit a selected node in an inspector;
//! - a **config (TOML)** — the same workflow as `WorkflowConfig` text.
//!
//! Sync is bidirectional: editing the flowchart regenerates the TOML live, and
//! `Apply TOML` re-parses the text back into the model (re-laying-out nodes).
//! Node x/y positions are a VIEW concern kept in panel state only — they are
//! never written to the config, so the workflow TOML stays coordinate-free.

use std::collections::HashMap;

use eframe::egui;
use egui::{Color32, Pos2, Rect, Stroke, Vec2};
use egui_phosphor::regular as icon;
use pipeline::compiler::{ExitRule, StageConfig, StepConfig, WorkflowConfig};

use crate::widgets;

const NODE_W: f32 = 150.0;
const NODE_H: f32 = 52.0;

/// One stage in the editable model: its config + step fields + panel-only layout.
#[derive(Clone)]
struct StageNode {
    name: String,
    step: StepConfig,
    exits: Vec<ExitRule>,
    pos: Pos2,
}

/// What the user is currently dragging an edge from (a pending connection).
struct PendingEdge {
    from: usize,
}

pub struct BuilderState {
    name: String,
    version: String,
    nodes: Vec<StageNode>,
    selected: Option<usize>,
    pending_edge: Option<PendingEdge>,
    toml_buffer: String,
    /// Set when the live model and `toml_buffer` may differ (model edited).
    toml_dirty: bool,
    parse_error: Option<String>,
    status: Option<String>,
    /// A config the user asked to send to the Orchestrator (consumed by main).
    pub send_to_orchestrator: Option<String>,
    preset_idx: usize,
}

impl Default for BuilderState {
    fn default() -> Self {
        let mut st = Self {
            name: String::new(),
            version: "1".to_string(),
            nodes: Vec::new(),
            selected: None,
            pending_edge: None,
            toml_buffer: String::new(),
            toml_dirty: false,
            parse_error: None,
            status: None,
            send_to_orchestrator: None,
            preset_idx: 0,
        };
        st.load_preset(0);
        st
    }
}

impl BuilderState {
    /// Load a bundled preset's config into the model and re-layout.
    fn load_preset(&mut self, idx: usize) {
        let presets = crate::presets::presets();
        let Some(preset) = presets.get(idx) else {
            return;
        };
        self.preset_idx = idx;
        match toml::from_str::<WorkflowConfig>(preset.config) {
            Ok(config) => {
                self.load_config(&config);
                self.status = Some(format!("loaded preset `{}`", preset.name));
            }
            Err(e) => self.parse_error = Some(e.to_string()),
        }
    }

    /// Replace the model from a parsed config, auto-laying-out node positions.
    fn load_config(&mut self, config: &WorkflowConfig) {
        self.name.clone_from(&config.name);
        self.version.clone_from(&config.version);
        // Order nodes with the initial stage first, then the rest in map order.
        let mut names: Vec<String> = config.states.keys().cloned().collect();
        if let Some(i) = names.iter().position(|n| n == &config.initial) {
            names.swap(0, i);
        }
        self.nodes = names
            .iter()
            .filter_map(|name| config.states.get(name).map(|s| (name, s)))
            .map(|(name, s)| StageNode {
                name: name.clone(),
                step: s.step.clone(),
                exits: s.exits.clone(),
                pos: Pos2::ZERO,
            })
            .collect();
        self.selected = None;
        self.pending_edge = None;
        self.parse_error = None;
        auto_layout(&mut self.nodes);
        self.sync_toml();
    }

    /// Serialize the live model to the TOML buffer (model -> text).
    fn sync_toml(&mut self) {
        match toml::to_string_pretty(&self.to_config()) {
            Ok(text) => {
                self.toml_buffer = text;
                self.toml_dirty = false;
            }
            Err(e) => self.parse_error = Some(e.to_string()),
        }
    }

    /// Re-parse the TOML buffer back into the model (text -> model).
    fn apply_toml(&mut self) {
        match toml::from_str::<WorkflowConfig>(&self.toml_buffer) {
            Ok(config) => {
                self.load_config(&config);
                self.status = Some("applied config".to_string());
            }
            Err(e) => self.parse_error = Some(format!("parse error: {e}")),
        }
    }

    /// Build a `WorkflowConfig` from the live model (positions dropped). The
    /// first node is the `initial` stage; node order is preserved in the map.
    fn to_config(&self) -> WorkflowConfig {
        let states = self
            .nodes
            .iter()
            .map(|n| {
                (
                    n.name.clone(),
                    StageConfig {
                        step: n.step.clone(),
                        exits: n.exits.clone(),
                    },
                )
            })
            .collect();
        let initial = self
            .nodes
            .first()
            .map(|n| n.name.clone())
            .unwrap_or_default();
        WorkflowConfig {
            name: self.name.clone(),
            version: self.version.clone(),
            initial,
            states,
            presets: std::collections::HashMap::new(),
        }
    }

    fn mark_model_changed(&mut self) {
        self.toml_dirty = true;
        self.sync_toml();
    }
}

/// Auto-layout nodes left-to-right in dependency order (BFS from the first
/// stage over exit edges), falling back to declaration order. Positions are a
/// pure view concern — never written to the config.
#[allow(
    clippy::cast_precision_loss,
    reason = "layout coordinates are visual only; node counts are tiny"
)]
fn auto_layout(nodes: &mut [StageNode]) {
    if nodes.is_empty() {
        return;
    }
    let index: HashMap<String, usize> = nodes
        .iter()
        .enumerate()
        .map(|(i, n)| (n.name.clone(), i))
        .collect();

    // depth[i] = BFS distance from node 0 over exit edges; unreached keep order.
    let mut depth = vec![usize::MAX; nodes.len()];
    let mut queue = std::collections::VecDeque::new();
    depth[0] = 0;
    queue.push_back(0usize);
    while let Some(i) = queue.pop_front() {
        let targets: Vec<usize> = nodes[i]
            .exits
            .iter()
            .filter_map(|e| index.get(&e.to).copied())
            .collect();
        for t in targets {
            if depth[t] == usize::MAX {
                depth[t] = depth[i] + 1;
                queue.push_back(t);
            }
        }
    }
    // Assign columns by depth; rows by order within a column.
    let mut col_counts: HashMap<usize, usize> = HashMap::new();
    let origin = Vec2::new(40.0, 40.0);
    let (dx, dy) = (210.0, 90.0);
    for i in 0..nodes.len() {
        let col = if depth[i] == usize::MAX {
            i + 1
        } else {
            depth[i]
        };
        let row = *col_counts.get(&col).unwrap_or(&0);
        *col_counts.entry(col).or_insert(0) += 1;
        nodes[i].pos = Pos2::new(origin.x + col as f32 * dx, origin.y + row as f32 * dy);
    }
}

/// Center of a node rectangle.
fn node_rect(pos: Pos2) -> Rect {
    Rect::from_min_size(pos, Vec2::new(NODE_W, NODE_H))
}

/// Headless roundtrip used by selfcheck: parse `config_toml` into the builder
/// model and serialize it back, proving the model preserves a workflow's
/// structure (stages, steps, exits) losslessly. Returns the re-serialized TOML.
///
/// # Errors
/// Returns the parse/serialize error string on failure.
pub fn roundtrip(config_toml: &str) -> Result<String, String> {
    let config: WorkflowConfig = toml::from_str(config_toml).map_err(|e| e.to_string())?;
    let mut st = BuilderState {
        name: String::new(),
        version: String::new(),
        nodes: Vec::new(),
        selected: None,
        pending_edge: None,
        toml_buffer: String::new(),
        toml_dirty: false,
        parse_error: None,
        status: None,
        send_to_orchestrator: None,
        preset_idx: 0,
    };
    st.load_config(&config);
    if let Some(err) = st.parse_error {
        return Err(err);
    }
    Ok(st.toml_buffer)
}

pub fn ui(ui: &mut egui::Ui, st: &mut BuilderState) {
    st.send_to_orchestrator = None;
    toolbar(ui, st);
    ui.add_space(4.0);

    if let Some(err) = &st.parse_error {
        widgets::status(ui, false, err);
        ui.add_space(4.0);
    } else if let Some(msg) = &st.status {
        ui.weak(msg);
        ui.add_space(4.0);
    }

    // Left: flowchart canvas. Right: inspector + config view. Use an explicit
    // horizontal split (robust inside an already-central Ui) rather than nested
    // egui panels, which mis-measure when nested via show_inside.
    let full = ui.available_size();
    let right_w = 360.0_f32.min(full.x * 0.5);
    let left_w = (full.x - right_w - 12.0).max(200.0);
    ui.horizontal_top(|ui| {
        ui.allocate_ui(Vec2::new(left_w, full.y), |ui| {
            flowchart(ui, st);
        });
        ui.separator();
        ui.allocate_ui(Vec2::new(right_w, full.y), |ui| {
            egui::ScrollArea::vertical()
                .id_salt("builder_right")
                .show(ui, |ui| {
                    inspector(ui, st);
                    ui.separator();
                    config_view(ui, st);
                });
        });
    });
}

fn toolbar(ui: &mut egui::Ui, st: &mut BuilderState) {
    ui.horizontal(|ui| {
        ui.strong(format!("{} workflow builder", icon::TREE_STRUCTURE));
        ui.separator();

        let presets = crate::presets::presets();
        let mut chosen = st.preset_idx;
        egui::ComboBox::from_id_salt("builder_preset")
            .selected_text(format!("{} {}", icon::CARDS, presets[st.preset_idx].name))
            .show_ui(ui, |ui| {
                for (i, p) in presets.iter().enumerate() {
                    ui.selectable_value(&mut chosen, i, p.name);
                }
            });
        if chosen != st.preset_idx {
            st.load_preset(chosen);
        }

        if ui.button(format!("{} add stage", icon::PLUS)).clicked() {
            add_stage(st);
        }
        if ui
            .button(format!("{} send to Orchestrator", icon::FLOW_ARROW))
            .on_hover_text("Hand this config to the Orchestrator panel")
            .clicked()
        {
            st.send_to_orchestrator = Some(st.toml_buffer.clone());
            st.status = Some("sent to Orchestrator".to_string());
        }
    });
    ui.weak(format!(
        "drag nodes to arrange {} click a node to edit {} drag from a node's {} port to connect",
        icon::DOT,
        icon::DOT,
        icon::ARROW_RIGHT
    ));
}

fn add_stage(st: &mut BuilderState) {
    let name = unique_name(st, "stage");
    #[allow(
        clippy::cast_precision_loss,
        reason = "spawn offset is visual only; node counts are tiny"
    )]
    let pos = Pos2::new(60.0, 60.0 + st.nodes.len() as f32 * 20.0);
    st.nodes.push(StageNode {
        name,
        step: StepConfig::default(),
        exits: Vec::new(),
        pos,
    });
    st.selected = Some(st.nodes.len() - 1);
    st.mark_model_changed();
}

fn unique_name(st: &BuilderState, base: &str) -> String {
    if !st.nodes.iter().any(|n| n.name == base) {
        return base.to_string();
    }
    (1..=st.nodes.len() + 1)
        .map(|i| format!("{base}_{i}"))
        .find(|c| !st.nodes.iter().any(|n| &n.name == c))
        .unwrap_or_else(|| base.to_string())
}

// ── Flowchart ───────────────────────────────────────────────────────────────

fn flowchart(ui: &mut egui::Ui, st: &mut BuilderState) {
    let size = ui.available_size();
    let (canvas, painter) = ui.allocate_painter(size, egui::Sense::click_and_drag());
    let visuals = ui.visuals().clone();
    // Stored node positions are canvas-local; everything draws/interacts offset
    // by the canvas origin so nodes land inside the panel (not at screen 0,0).
    let origin = canvas.rect.min.to_vec2();
    painter.rect_filled(canvas.rect, 4.0, visuals.faint_bg_color);
    painter.rect_stroke(
        canvas.rect,
        4.0,
        Stroke::new(1.0, visuals.widgets.noninteractive.bg_stroke.color),
        egui::StrokeKind::Inside,
    );

    // Draw edges first (under nodes).
    draw_edges(st, &painter, &visuals, origin);

    // Nodes: draggable, clickable, with an output port.
    let mut clicked: Option<usize> = None;
    let mut port_started: Option<usize> = None;
    for i in 0..st.nodes.len() {
        let rect = node_rect(st.nodes[i].pos).translate(origin);
        let id = canvas.id.with(("node", i));
        let resp = ui.interact(rect, id, egui::Sense::click_and_drag());
        if resp.dragged() {
            st.nodes[i].pos += resp.drag_delta();
        }
        if resp.clicked() {
            clicked = Some(i);
        }

        let selected = st.selected == Some(i);
        let terminal = st.nodes[i].exits.is_empty();
        let fill = if selected {
            visuals.selection.bg_fill
        } else if terminal {
            Color32::from_rgb(60, 90, 60)
        } else {
            visuals.widgets.inactive.bg_fill
        };
        painter.rect_filled(rect, 6.0, fill);
        painter.rect_stroke(
            rect,
            6.0,
            Stroke::new(
                if selected { 2.0 } else { 1.0 },
                visuals.widgets.active.fg_stroke.color,
            ),
            egui::StrokeKind::Inside,
        );
        painter.text(
            rect.center_top() + Vec2::new(0.0, 10.0),
            egui::Align2::CENTER_CENTER,
            &st.nodes[i].name,
            egui::FontId::proportional(14.0),
            visuals.text_color(),
        );
        let sub = if terminal {
            "terminal".to_string()
        } else {
            format!("{} exit(s)", st.nodes[i].exits.len())
        };
        painter.text(
            rect.center_top() + Vec2::new(0.0, 32.0),
            egui::Align2::CENTER_CENTER,
            sub,
            egui::FontId::proportional(10.0),
            visuals.weak_text_color(),
        );

        // Output port on the right edge: drag from here to another node to connect.
        let port = rect.right_center();
        let port_id = canvas.id.with(("port", i));
        let port_resp = ui.interact(
            Rect::from_center_size(port, Vec2::splat(14.0)),
            port_id,
            egui::Sense::click_and_drag(),
        );
        painter.circle_filled(port, 5.0, visuals.hyperlink_color);
        if port_resp.drag_started() {
            port_started = Some(i);
        }
    }

    if let Some(i) = port_started {
        st.pending_edge = Some(PendingEdge { from: i });
    }

    // While dragging a pending edge, draw a rubber-band line to the pointer.
    if let Some(pending) = &st.pending_edge {
        let from = node_rect(st.nodes[pending.from].pos)
            .translate(origin)
            .right_center();
        if let Some(ptr) = ui.ctx().pointer_latest_pos() {
            painter.line_segment([from, ptr], Stroke::new(2.0, visuals.hyperlink_color));
        }
        // On release, connect to whatever node is under the pointer.
        if ui.input(|i| i.pointer.any_released()) {
            let target = ui.ctx().pointer_latest_pos().and_then(|p| {
                st.nodes
                    .iter()
                    .position(|n| node_rect(n.pos).translate(origin).contains(p))
            });
            if let Some(to) = target {
                connect(st, pending.from, to);
            }
            st.pending_edge = None;
        }
    }

    if let Some(i) = clicked {
        st.selected = Some(i);
    }
}

fn draw_edges(st: &BuilderState, painter: &egui::Painter, visuals: &egui::Visuals, origin: Vec2) {
    let index: HashMap<&str, usize> = st
        .nodes
        .iter()
        .enumerate()
        .map(|(i, n)| (n.name.as_str(), i))
        .collect();
    for node in &st.nodes {
        let from = node_rect(node.pos).translate(origin).right_center();
        for exit in &node.exits {
            let Some(&j) = index.get(exit.to.as_str()) else {
                continue;
            };
            let to = node_rect(st.nodes[j].pos).translate(origin).left_center();
            let fallback = exit.when == "builtin::paused";
            let color = if fallback {
                Color32::from_rgb(200, 150, 60)
            } else {
                visuals.weak_text_color()
            };
            painter.line_segment([from, to], Stroke::new(1.5, color));
            // arrowhead
            let dir = (to - from).normalized();
            let tip = to - dir * 4.0;
            let perp = Vec2::new(-dir.y, dir.x);
            painter.add(egui::Shape::convex_polygon(
                vec![
                    tip,
                    tip - dir * 9.0 + perp * 5.0,
                    tip - dir * 9.0 - perp * 5.0,
                ],
                color,
                Stroke::NONE,
            ));
            let mid = from + (to - from) * 0.5;
            painter.text(
                mid - Vec2::new(0.0, 8.0),
                egui::Align2::CENTER_CENTER,
                if fallback {
                    "paused".to_string()
                } else {
                    exit.when.clone()
                },
                egui::FontId::monospace(9.0),
                color,
            );
        }
    }
}

/// Add an exit edge from node `from` to node `to` (no self/dup edges).
fn connect(st: &mut BuilderState, from: usize, to: usize) {
    if from == to {
        return;
    }
    let target = st.nodes[to].name.clone();
    let exits = &mut st.nodes[from].exits;
    if exits.iter().any(|e| e.to == target) {
        return;
    }
    exits.push(ExitRule {
        when: "builtin::paused".to_string(),
        to: target,
        epilogue: None,
    });
    st.mark_model_changed();
}

// ── Inspector ─────────────────────────────────────────────────────────────-

fn inspector(ui: &mut egui::Ui, st: &mut BuilderState) {
    ui.strong(format!("{} inspector", icon::SLIDERS));
    let Some(sel) = st.selected else {
        ui.weak("select a node to edit it");
        ui.add_space(2.0);
        ui.horizontal(|ui| {
            ui.label("workflow:");
            if ui.text_edit_singleline(&mut st.name).changed() {
                st.toml_dirty = true;
            }
        });
        if st.toml_dirty {
            st.sync_toml();
        }
        return;
    };
    if sel >= st.nodes.len() {
        st.selected = None;
        return;
    }

    let mut changed = false;
    let mut delete = false;

    egui::ScrollArea::vertical()
        .id_salt("inspector_scroll")
        .max_height(260.0)
        .show(ui, |ui| {
            ui.horizontal(|ui| {
                ui.label("stage name:");
                if ui.text_edit_singleline(&mut st.nodes[sel].name).changed() {
                    changed = true;
                }
            });

            ui.add_space(4.0);
            ui.label("prologue:");
            let mut prologue = st.nodes[sel].step.prologue.clone().unwrap_or_default();
            if ui.text_edit_multiline(&mut prologue).changed() {
                st.nodes[sel].step.prologue = non_empty(&prologue);
                changed = true;
            }
            ui.label("epilogue:");
            let mut epilogue = st.nodes[sel].step.epilogue.clone().unwrap_or_default();
            if ui.text_edit_multiline(&mut epilogue).changed() {
                st.nodes[sel].step.epilogue = non_empty(&epilogue);
                changed = true;
            }
            ui.label("tools (comma-separated):");
            let mut tools = st.nodes[sel].step.tools.join(", ");
            if ui.text_edit_singleline(&mut tools).changed() {
                st.nodes[sel].step.tools = tools
                    .split(',')
                    .map(str::trim)
                    .filter(|s| !s.is_empty())
                    .map(ToString::to_string)
                    .collect();
                changed = true;
            }

            ui.add_space(6.0);
            let (ex_changed, want_delete) = inspector_exits(ui, st, sel);
            changed |= ex_changed;
            delete = want_delete;
        });

    if delete {
        delete_stage(st, sel);
        return;
    }
    if changed {
        st.mark_model_changed();
    }
}

/// Edit the selected stage's exits (when / to / epilogue), add/remove. Returns
/// `(changed, delete_stage_requested)`.
fn inspector_exits(ui: &mut egui::Ui, st: &mut BuilderState, sel: usize) -> (bool, bool) {
    let mut changed = false;
    let mut delete = false;
    ui.strong(format!("{} exits", icon::ARROW_RIGHT));
    let names: Vec<String> = st.nodes.iter().map(|n| n.name.clone()).collect();

    let mut remove_exit: Option<usize> = None;
    for (ei, exit) in st.nodes[sel].exits.iter_mut().enumerate() {
        ui.group(|ui| {
            ui.horizontal(|ui| {
                ui.label("when:");
                if ui.text_edit_singleline(&mut exit.when).changed() {
                    changed = true;
                }
                if ui.small_button(icon::TRASH).clicked() {
                    remove_exit = Some(ei);
                }
            });
            ui.horizontal(|ui| {
                ui.label("to:");
                egui::ComboBox::from_id_salt(("exit_to", sel, ei))
                    .selected_text(exit.to.clone())
                    .show_ui(ui, |ui| {
                        for n in &names {
                            if ui.selectable_value(&mut exit.to, n.clone(), n).clicked() {
                                changed = true;
                            }
                        }
                    });
            });
            let mut ep = exit.epilogue.clone().unwrap_or_default();
            ui.label("epilogue:");
            if ui.text_edit_singleline(&mut ep).changed() {
                exit.epilogue = non_empty(&ep);
                changed = true;
            }
        });
    }
    if let Some(ei) = remove_exit {
        st.nodes[sel].exits.remove(ei);
        changed = true;
    }

    ui.add_space(4.0);
    ui.horizontal(|ui| {
        if ui.button(format!("{} add exit", icon::PLUS)).clicked() {
            let to = names.first().cloned().unwrap_or_default();
            st.nodes[sel].exits.push(ExitRule {
                when: "builtin::paused".to_string(),
                to,
                epilogue: None,
            });
            changed = true;
        }
        if ui.button(format!("{} delete stage", icon::TRASH)).clicked() {
            delete = true;
        }
    });
    (changed, delete)
}

fn delete_stage(st: &mut BuilderState, sel: usize) {
    let removed = st.nodes[sel].name.clone();
    st.nodes.remove(sel);
    // Drop dangling edges that pointed at the removed stage.
    for node in &mut st.nodes {
        node.exits.retain(|e| e.to != removed);
    }
    st.selected = None;
    st.mark_model_changed();
}

fn non_empty(s: &str) -> Option<String> {
    let t = s.trim();
    (!t.is_empty()).then(|| s.to_string())
}

// ── Config view ─────────────────────────────────────────────────────────────

fn config_view(ui: &mut egui::Ui, st: &mut BuilderState) {
    ui.horizontal(|ui| {
        ui.strong(format!("{} config (TOML)", icon::CODE));
        if st.toml_dirty {
            ui.weak(format!("{} synced from flowchart", icon::ARROW_LEFT));
        }
        if ui
            .button(format!("{} apply to flowchart", icon::CHECK))
            .on_hover_text("Re-parse this TOML back into the flowchart")
            .clicked()
        {
            st.apply_toml();
        }
    });
    widgets::code_input(ui, "builder_toml", &mut st.toml_buffer, 16);
}
