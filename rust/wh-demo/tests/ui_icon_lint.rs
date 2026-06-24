//! Lint: UI strings must use Phosphor icons, never literal non-ASCII glyphs.
//!
//! Stray Unicode glyphs (`→`, `✓`, `⟂`, em-dashes, …) render as tofu (□) once the
//! Phosphor font is merged, because the bundled fonts don't cover them. Real icons
//! reach the UI through `egui_phosphor::regular::*` **constants** interpolated with
//! `{}`, so any non-ASCII codepoint sitting in a *string literal* in a UI source
//! file is a glyph that should have been a Phosphor icon.
//!
//! This test enforces that. It scans the egui panel sources, ignores full-line
//! comments (module docs legitimately use arrows in prose), and fails on any
//! non-ASCII byte left in code — which in these files only ever means a literal
//! glyph inside a string.

use std::path::Path;

/// egui UI sources whose string literals are rendered to the screen.
/// `selfcheck.rs` is excluded — it prints to a terminal, not the egui surface.
const UI_SOURCES: &[&str] = &[
    "src/main.rs",
    "src/widgets.rs",
    "src/when_panel.rs",
    "src/compiler_panel.rs",
    "src/workflow_panel.rs",
];

#[test]
fn ui_strings_use_phosphor_not_literal_glyphs() {
    let root = Path::new(env!("CARGO_MANIFEST_DIR"));
    let mut offenders = Vec::new();

    for rel in UI_SOURCES {
        let path = root.join(rel);
        let src =
            std::fs::read_to_string(&path).unwrap_or_else(|e| panic!("cannot read {rel}: {e}"));

        for (n, line) in src.lines().enumerate() {
            // Skip full-line comments — module docs use arrows in prose, and they
            // are never rendered. (All comments in these files are full-line.)
            if line.trim_start().starts_with("//") {
                continue;
            }
            for ch in line.chars() {
                if !ch.is_ascii() {
                    offenders.push(format!(
                        "  {}:{}  stray glyph {:?} (U+{:04X}) — use an egui_phosphor::regular::* icon",
                        rel,
                        n + 1,
                        ch,
                        ch as u32
                    ));
                }
            }
        }
    }

    assert!(
        offenders.is_empty(),
        "UI source contains literal non-ASCII glyphs; render icons via egui-phosphor instead:\n{}",
        offenders.join("\n")
    );
}
