// browser_snapshot — accessibility tree with element refs (token-cheap).
//
// The declared inputs are now actually forwarded. Previously depth/compact were
// in the schema but the exec was hard-coded to `-i -c -d 10`, so an agent that
// asked for a deeper or fuller tree silently got the same one.

import { tool } from "@workhorse/api";
import * as v from "valibot";
import { ab, field } from "./_browser_shared";

const DEFAULT_DEPTH = 10;

export default tool({
  name: "browser_snapshot",
  description:
    "Get the accessibility tree of the current page with element refs (@e1, @e2, …) for " +
    "browser_act. Interactive elements only by default — far cheaper in tokens than raw HTML; " +
    "pass interactiveOnly: false to include static content. Scope to a region with selector, or " +
    "raise depth for deeply nested UI. Call browser_open first.",
  docs: "Baseline fixture — see the pre-consolidation tool for behavior.",
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
