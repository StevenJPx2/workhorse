// browser_scroll — scroll the page or a scrollable container.
//
// Split out of browser_act because the CLI form is
// `scroll <direction> [amount] [-s <selector>]` — a DIRECTION first, with the
// selector as an OPTION. Passing a ref positionally made the CLI read the
// element ref as the scroll direction.

import { tool } from "@workhorse/api";
import * as v from "valibot";
import { ab } from "./_shared";

export default tool({
  name: "browser_scroll",
  description:
    "Scroll the page, or a specific scrollable container, in a direction. Amount is in pixels " +
    "(default 300). Pass a selector or @ref to scroll a container instead of the page — useful " +
    "for infinite lists and overflow panes.",
  docs: `
browser_scroll — scroll the page or a container.

A separate tool from browser_act because the CLI form is
\`scroll <direction> [amount]\` — it takes a DIRECTION, not a selector.

ARGUMENTS
  direction  (required) up | down | left | right
  amount     pixels (default 300)
  selector   optional — scroll a CONTAINER instead of the page, for infinite
             lists and overflow panes

EXAMPLES

  { direction: "down" }
  { direction: "down", amount: 600 }
  { direction: "down", selector: "@e9" }     // a scrollable container

NOTES
  Scrolling can trigger lazy-loading and change the DOM, which invalidates
  existing @refs — re-snapshot afterwards if you plan to act on elements.
`,
  input: v.object({
    direction: v.picklist(["up", "down", "left", "right"]),
    amount: v.optional(v.number()),
    /** Scroll a container instead of the page (CLI: -s <selector>). */
    selector: v.optional(v.string()),
  }),
  async run({ input, sandbox }) {
    const args = ["scroll", input.direction];
    if (input.amount !== undefined) args.push(String(Math.max(1, Math.round(input.amount))));
    if (input.selector) args.push("-s", input.selector);

    const raw = await ab(sandbox, args);
    const target = input.selector ? ` in ${input.selector}` : "";
    const by = input.amount !== undefined ? ` by ${Math.max(1, Math.round(input.amount))}px` : "";
    const summary = `scroll ${input.direction}${by}${target}`;
    return raw.trim().startsWith("{") || !raw.trim() ? summary : raw.trim();
  },
});
