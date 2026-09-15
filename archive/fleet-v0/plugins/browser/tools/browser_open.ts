// browser_open — open/navigate a URL in the persistent session.
//
// `open` has NO --wait flag (its options are --json/--session/--headers/
// --headed/--enable/--init-script). Waiting is a separate command — `wait <ms>`
// / `wait --load <state>` — so a settle delay is expressed as a two-command
// `batch`, which keeps it to ONE container exec.
//
// HEADFUL is NOT requested here. `batch` silently drops --headed (verified by
// launchHash: `batch --bail "open <url> --headed"` produces the identical hash
// to a headless launch), and this tool always uses batch when a wait is
// requested. So headful is set by the sandbox wrapper via AGENT_BROWSER_HEADED
// + a Xvfb display, which is read at launch regardless of subcommand.

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
  docs: `
browser_open — navigate the persistent browser session.

One session per ticket run: the first call starts the browser, later calls reuse
it, and page state survives across tool calls.

ARGUMENTS
  url      (required) the URL to load
  waitMs   settle delay after navigation, capped at ${MAX_WAIT_MS}ms
  waitFor  load state to wait for instead: load | domcontentloaded | networkidle
           Prefer this over waitMs — it waits for a real signal, not a guess.
           When both are given, waitFor wins.

Returns the URL actually landed on, so redirects are visible.

EXAMPLES

  { url: "http://localhost:3000" }
  { url: "http://localhost:3000", waitFor: "networkidle" }
  { url: "https://example.com", waitMs: 2000 }

NOTES
  Call this before browser_snapshot / browser_act / browser_screenshot.
  Bot-walled sites (PerimeterX and similar) deny headless Chrome — if a page
  returns an access-denied interstitial, report that rather than retrying.
`,
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
