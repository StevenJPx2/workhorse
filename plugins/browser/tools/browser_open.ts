// browser_open — open/navigate a URL in the persistent session (starts the daemon).
import { tool } from "@workhorse/api";
import * as v from "valibot";
import { ab } from "./_shared";

export default tool({
  name: "browser_open",
  description:
    "Open or navigate to a URL in the persistent browser session (one per ticket run). Starts " +
    "the daemon on the first call (~1s); subsequent calls reuse the session. Always call this " +
    "before browser_snapshot / browser_act / browser_screenshot.",
  input: v.object({ url: v.string(), waitMs: v.optional(v.number()) }),
  async run({ input, sandbox }) {
    const args = ["open", input.url];
    if (input.waitMs && input.waitMs > 0) args.push("--wait", String(Math.min(input.waitMs, 8000)));
    const raw = await ab(sandbox, args);
    try {
      return `Browser open: ${(JSON.parse(raw) as { url?: string }).url ?? input.url}`;
    } catch {
      return raw.trim() || `Opened ${input.url}`;
    }
  },
});
