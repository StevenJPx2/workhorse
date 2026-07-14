//! Small shared egui helpers used by every panel.

use eframe::egui;
use egui_phosphor::regular as icon;

/// An editable monospace code box bound to `text`.
pub fn code_input(ui: &mut egui::Ui, id: &str, text: &mut String, rows: usize) {
    ui.push_id(id, |ui| {
        ui.add(
            egui::TextEdit::multiline(text)
                .code_editor()
                .desired_rows(rows)
                .desired_width(f32::INFINITY),
        );
    });
}

/// A read-only, selectable monospace output box (so results can be copied).
pub fn code_output(ui: &mut egui::Ui, id: &str, text: &str, rows: usize) {
    let mut owned = text.to_string();
    ui.push_id(id, |ui| {
        ui.add(
            egui::TextEdit::multiline(&mut owned)
                .code_editor()
                .interactive(true)
                .desired_rows(rows)
                .desired_width(f32::INFINITY),
        );
    });
}

/// Green "ok" / red "error" status line, prefixed with a phosphor icon.
pub fn status(ui: &mut egui::Ui, ok: bool, msg: &str) {
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
    ui.colored_label(color, format!("{glyph} {msg}"));
}
