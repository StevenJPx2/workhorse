// browser_snapshot — accessibility tree with element refs (token-cheap).
//
// The declared inputs are now actually forwarded. Previously depth/compact were
// in the schema but the exec was hard-coded to `-i -c -d 10`, so an agent that
// asked for a deeper or fuller tree silently got the same one.

import { tool } from "@workhorse/api";
import * as v from "valibot";
import { ab, field } from "./_shared";

const DEFAULT_DEPTH = 10;

export default tool({
  name: "browser_snapshot",
  description:
    "Get the accessibility tree of the current page with element refs (@e1, @e2, …) for " +
    "browser_act. Interactive elements only by default — far cheaper in tokens than raw HTML; " +
    "pass interactiveOnly: false to include static content. Scope to a region with selector, or " +
    "raise depth for deeply nested UI. Call browser_open first.",
  docs: `
browser_snapshot — accessibility tree with element refs for browser_act.

Yields refs (@e1, @e2, …) that browser_act, browser_scroll, and browser_key
target. Call browser_open first.

ARGUMENTS
  interactiveOnly  default true — only actionable elements. This is the token
                   win; set false only when you need static text structure.
  compact          default true — drop empty structural wrappers
  depth            default 10 — raise for deeply nested UI
  selector         scope the tree to one CSS selector (e.g. "#main")
  urls             include href URLs for links

EXAMPLES

  {}
  { selector: "#main", interactiveOnly: false }
  { depth: 20 }

NOTES
  Refs are INVALIDATED by navigation or DOM mutation. Re-snapshot after acting,
  or an @ref will point at the wrong element (or nothing).
`,
  input: v.object({
    /** Tree depth limit (CLI: -d). Default 10. */
    depth: v.optional(v.number()),
    /** Strip empty structural elements (CLI: -c). Default true. */
    compact: v.optional(v.boolean()),
    /** Interactive elements only (CLI: -i). Default true — the token win. */
    interactiveOnly: v.optional(v.boolean()),
    /** Scope the snapshot to a CSS selector (CLI: -s). */
    selector: v.optional(v.string()),
    /** Include href URLs for links (CLI: -u). */
    urls: v.optional(v.boolean()),
  }),
  async run({ input, sandbox }) {
    const args = ["snapshot"];
    if (input.interactiveOnly ?? true) args.push("-i");
    if (input.compact ?? true) args.push("-c");
    if (input.urls) args.push("-u");
    if (input.selector) args.push("-s", input.selector);
    args.push("-d", String(Math.max(1, Math.round(input.depth ?? DEFAULT_DEPTH))));

    const raw = await ab(sandbox, args);
    return field(raw, "snapshot") ?? raw;
  },
});
