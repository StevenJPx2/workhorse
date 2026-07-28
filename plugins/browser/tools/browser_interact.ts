// browser_interact — the PAGE-MUTATING half of the browser plane.
//
// Separate from `browser` because a stage allowlist is the capability gate: a
// read-only stage (reviewer, PR writer) may look at a page but must not click,
// type, or submit. Granting one tool name must not grant both powers.
//
// Each action's CLI form differs in shape — `click <selector>`,
// `fill <selector> <text>`, `press <key>`, `scroll <direction> [amount]` — so
// run() maps them explicitly rather than assuming a selector-first signature.
// Assuming that is exactly what sent element refs where keys and directions
// belonged.

import { tool } from "@workhorse/api";
import * as v from "valibot";
import { ab, field } from "./_shared";

/** Actions whose CLI form is `<action> <selector> <value>`. */
const VALUE_ACTIONS = new Set(["fill", "type", "select"]);
/** Actions whose CLI form is `<action> <selector>` alone. */
const BARE_ACTIONS = new Set(["click", "dblclick", "hover", "check", "uncheck"]);

export default tool({
  name: "browser_interact",
  description:
    "Act on a live web page: click/dblclick/hover/check/uncheck an element, fill/type/select a " +
    "value, press a key, or scroll. Target elements by @ref from a browser snapshot or by CSS " +
    "selector. Snapshot first — refs change after navigation or DOM mutation.",
  docs: `
browser_interact — page-mutating browser actions.

Always run { action: "snapshot" } on the \`browser\` tool first: it yields the
@refs used here, and those refs are invalidated by navigation or DOM mutation.

ELEMENT ACTIONS — need \`selector\` (an @ref like "@e3", or a CSS selector)

  click     click the element
  dblclick  double-click
  hover     hover (reveals menus/tooltips)
  check     check a checkbox or radio
  uncheck   uncheck a checkbox

VALUE ACTIONS — need \`selector\` AND \`value\`

  fill      clear the field, then enter value
  type      type value into the field without clearing
  select    choose a dropdown option by its value attribute

  An empty value is legal for fill — that CLEARS the field.

KEY ACTION — needs \`key\`, NOT a selector

  press     press a key on the focused element
            Enter, Tab, Escape, Backspace, Delete, Space, ArrowUp/Down/Left/Right,
            Home, End, PageUp, PageDown, F1-F12, or a combo: Control+a, Shift+Tab
            To submit a field: fill it, then press Enter.

SCROLL ACTION — needs \`direction\`, NOT a selector

  scroll    direction: up | down | left | right
            amount:    pixels (default 300)
            selector:  optional — scroll a container instead of the page,
                       for infinite lists and overflow panes

EXAMPLES

  { action: "click",  selector: "@e3" }
  { action: "fill",   selector: "#email", value: "user@example.com" }
  { action: "fill",   selector: "#search", value: "" }          // clears it
  { action: "select", selector: "#country", value: "us" }
  { action: "press",  key: "Enter" }
  { action: "press",  key: "Control+a" }
  { action: "scroll", direction: "down", amount: 500 }
  { action: "scroll", direction: "down", selector: "@e9" }      // a container

A failed action (stale ref, missing element) raises an error rather than
reporting success — re-snapshot and retry with a fresh ref.
`,
  input: v.object({
    action: v.picklist([
      "click",
      "dblclick",
      "hover",
      "check",
      "uncheck",
      "fill",
      "type",
      "select",
      "press",
      "scroll",
    ]),
    /** Element target for element/value actions (@ref or CSS). */
    selector: v.optional(v.string()),
    /** Text or option value for fill/type/select. */
    value: v.optional(v.string()),
    /** Key or combination for press. */
    key: v.optional(v.string()),
    /** Direction for scroll. */
    direction: v.optional(v.picklist(["up", "down", "left", "right"])),
    /** Pixels for scroll. */
    amount: v.optional(v.number()),
  }),
  async run({ input, sandbox }) {
    const { action } = input;

    if (action === "press") {
      if (!input.key) return 'browser_interact: "press" needs a key (e.g. "Enter", "Control+a").';
      const raw = await ab(sandbox, ["press", input.key]);
      const landed = field(raw, "url");
      return landed ? `press ${input.key} → ${landed}` : summarize(raw, `press ${input.key}`);
    }

    if (action === "scroll") {
      if (!input.direction) return 'browser_interact: "scroll" needs a direction (up, down, left, right).';
      const px = input.amount !== undefined ? Math.max(1, Math.round(input.amount)) : undefined;

      const args = ["scroll", input.direction];
      if (px !== undefined) args.push(String(px));
      // The selector is an OPTION here, never a positional — positionally it
      // would be read as the direction.
      if (input.selector) args.push("-s", input.selector);

      const raw = await ab(sandbox, args);
      const where = input.selector ? ` in ${input.selector}` : "";
      const by = px !== undefined ? ` by ${px}px` : "";
      return summarize(raw, `scroll ${input.direction}${by}${where}`);
    }

    if (!input.selector) return `browser_interact: "${action}" needs a selector (an @ref or CSS selector).`;
    if (VALUE_ACTIONS.has(action) && input.value === undefined) {
      return `browser_interact: "${action}" needs a value (the text to enter, or the option to select).`;
    }

    const args = [action, input.selector];
    // Only value actions take a third argument; a stray one on click/hover
    // would be an unexpected positional.
    if (VALUE_ACTIONS.has(action) && input.value !== undefined) args.push(input.value);
    if (!VALUE_ACTIONS.has(action) && !BARE_ACTIONS.has(action)) {
      return `browser_interact: unsupported action "${action}".`;
    }

    const raw = await ab(sandbox, args);
    const landed = field(raw, "url");
    return landed ? `${action} ${input.selector} → ${landed}` : summarize(raw, `${action} ${input.selector}`);
  },
});

/** Prefer a human-readable CLI message; fall back to our own summary. */
function summarize(raw: string, fallback: string): string {
  const trimmed = raw.trim();
  return !trimmed || trimmed.startsWith("{") || trimmed.startsWith("[") ? fallback : trimmed;
}
