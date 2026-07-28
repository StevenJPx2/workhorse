// browser_read — rendered page text/markdown (JS-capable, live DOM).
import { tool } from "@workhorse/api";
import * as v from "valibot";
import { ab, field } from "./_browser_shared";

export default tool({
  name: "browser_read",
  description:
    "Read the current page's rendered content as text or markdown (JS executed, live DOM). Omit " +
    "url to read the active tab; pass a URL to navigate+read in one call. For static content " +
    "prefer web_read (Jina); this handles JS-heavy SPAs, authenticated pages, state-dependent content.",
  docs: "Baseline fixture — see the pre-consolidation tool for behavior.",
  input: v.object({ url: v.optional(v.string()), filter: v.optional(v.string()) }),
  async run({ input, sandbox }) {
    const args = ["read"];
    if (input.url) args.push(input.url);
    if (input.filter) args.push("--filter", input.filter);
    const raw = await ab(sandbox, args);
    // The page text lives at data.content — reading a top-level `content`
    // always missed and handed the agent the whole JSON envelope.
    return field(raw, "content", "text") ?? raw;
  },
});
