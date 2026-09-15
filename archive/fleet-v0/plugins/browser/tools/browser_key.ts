// browser_key — press a key or key combination.
//
// Split out of browser_act because the CLI form is `press <key>` — a KEY, not a
// selector. Folding it into a selector-first tool sent the element ref where the
// key belongs, so "press Enter on @e1" pressed a key literally named "@e1".
// To target a field first, browser_act the field (click/fill), then press.

import { tool } from "@workhorse/api";
import * as v from "valibot";
import { ab, field } from "./_shared";

export default tool({
  name: "browser_key",
  description:
    "Press a key or key combination on the focused element: Enter, Tab, Escape, Backspace, " +
    "Delete, Space, ArrowUp/Down/Left/Right, Home, End, PageUp, PageDown, F1-F12, or a combo " +
    "with modifiers (Control+a, Shift+Tab, Meta+c). To submit a field, browser_act fill it " +
    "first, then press Enter.",
  docs: `
browser_key — press a key on the focused element.

A separate tool from browser_act because the CLI form is \`press <key>\` — it
takes a KEY, not a selector. Sending a selector here presses a key named after
the ref.

ARGUMENTS
  key  (required) the key or combination

RECOGNIZED KEYS
  Enter, Tab, Escape, Backspace, Delete, Space
  ArrowUp, ArrowDown, ArrowLeft, ArrowRight
  Home, End, PageUp, PageDown, F1-F12
  Combinations: Control+a, Shift+Tab, Meta+v

EXAMPLES

  { key: "Enter" }
  { key: "Control+a" }
  { key: "Escape" }

NOTES
  Acts on whatever has focus, so click or fill the target first.
  To submit a form: browser_act fill the field, then browser_key "Enter".
`,
  input: v.object({ key: v.string() }),
  async run({ input, sandbox }) {
    const raw = await ab(sandbox, ["press", input.key]);
    const landed = field(raw, "url");
    if (landed) return `press ${input.key} → ${landed}`;
    return raw.trim().startsWith("{") || !raw.trim() ? `press ${input.key}` : raw.trim();
  },
});
