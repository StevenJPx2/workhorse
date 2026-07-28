// browser_open — open/navigate a URL in the persistent session.
//
// `open` has NO --wait flag (its options are --json/--session/--headers/
// --headed/--enable/--init-script). Waiting is a separate command — `wait <ms>`
// / `wait --load <state>` — so a settle delay is expressed as a two-command
// `batch`, which keeps it to ONE container exec.

import { tool } from "@workhorse/api";
import * as v from "valibot";
import { ab, field } from "./_shared";

/** Upper bound on a post-navigation settle wait. */
const MAX_WAIT_MS = 8000;

export default tool({
  name: "browser_open",
  description:
    "Open or navigate to a URL in the persistent browser session (one per ticket run). Starts " +
    "the browser on the first call; subsequent calls reuse the session. Pass waitMs to settle " +
    "after navigation (JS-heavy pages), or waitFor: 'networkidle' to wait for the network to go " +
    "quiet. Always call this before browser_snapshot / browser_act / browser_screenshot.",
  input: v.object({
    url: v.string(),
    /** Fixed settle delay after navigation, capped at 8s. */
    waitMs: v.optional(v.number()),
    /** Wait for a load state instead of a fixed delay. */
    waitFor: v.optional(v.picklist(["load", "domcontentloaded", "networkidle"])),
  }),
  async run({ input, sandbox }) {
    // A load state is a better signal than a blind delay, so it wins when both
    // are given.
    const wait = input.waitFor
      ? `wait --load ${input.waitFor}`
      : input.waitMs && input.waitMs > 0
        ? `wait ${Math.min(Math.round(input.waitMs), MAX_WAIT_MS)}`
        : null;

    const raw = wait
      ? await ab(sandbox, ["batch", "--bail", `open ${input.url}`, wait])
      : await ab(sandbox, ["open", input.url]);

    // field() handles both the `{success,data,error}` envelope and the batch
    // result array; data.url is where the LANDED url lives (post-redirect).
    const landed = field(raw, "url");
    if (landed) return `Browser open: ${landed}`;

    const trimmed = raw.trim();
    if (!trimmed) return `Opened ${input.url}`;
    // JSON we couldn't find a url in — report the requested url. Anything else
    // is a human-readable message worth passing through.
    return trimmed.startsWith("{") || trimmed.startsWith("[") ? `Browser open: ${input.url}` : trimmed;
  },
});
