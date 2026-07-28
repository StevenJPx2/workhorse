// browser_act — click/fill/type/select/hover/check on an element by AX ref.
//
// Every action here takes a SELECTOR first, matching the agent-browser CLI:
//   click|dblclick|hover|check|uncheck <selector>
//   type|fill <selector> <text>
//   select <selector> <value...>
//
// `press` and `scroll` are deliberately NOT here — their CLI signatures take a
// key and a direction, not a selector (`press <key>`, `scroll <direction>
// [amount]`), so folding them into a selector-first tool silently sent the ref
// where the key/direction belongs. They live in browser_key and browser_scroll.

import { tool } from "@workhorse/api";
import * as v from "valibot";
import { ab, field } from "./_browser_shared";

/** Actions whose CLI form is `<action> <selector> <value>`. */
const VALUE_ACTIONS = new Set(["fill", "type", "select"]);

export default tool({
  name: "browser_act",
  description:
    "Perform an action on a page element by its ref from browser_snapshot (@e1, @e2, …) or a CSS " +
    "selector. click, dblclick, hover, check, uncheck take the element alone; fill, type, select " +
    "also take a value. Always snapshot first — refs change after navigation or DOM mutation. " +
    "For keyboard keys use browser_key; for scrolling use browser_scroll.",
  docs: "Baseline fixture — see the pre-consolidation tool for behavior.",
  input: v.object({
    action: v.picklist(["click", "dblclick", "fill", "type", "hover", "select", "check", "uncheck"]),
    selector: v.string(),
    /** Required for fill/type/select; ignored otherwise. */
    value: v.optional(v.string()),
  }),
  async run({ input, sandbox }) {
    if (VALUE_ACTIONS.has(input.action) && input.value === undefined) {
      return `browser_act: "${input.action}" needs a value (the text to enter, or the option to select).`;
    }

    const args = [input.action, input.selector];
    // Only value-taking actions get a third argument — a stray extra arg on
    // click/hover would be read as a positional the CLI does not expect.
    if (VALUE_ACTIONS.has(input.action) && input.value !== undefined) args.push(input.value);

    const raw = await ab(sandbox, args);
    const landed = field(raw, "url");
    if (landed) return `${input.action} ${input.selector} → ${landed}`;
    // Non-JSON output is a human-readable message worth surfacing as-is.
    return raw.trim().startsWith("{") || !raw.trim()
      ? `${input.action} ${input.selector}`
      : raw.trim();
  },
});
