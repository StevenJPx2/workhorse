// browser_read — rendered page text/markdown (JS-capable, live DOM).
import { tool } from "@workhorse/api";
import * as v from "valibot";
import { ab, field } from "./_shared";

export default tool({
  name: "browser_read",
  description:
    "Read the current page's rendered content as text or markdown (JS executed, live DOM). Omit " +
    "url to read the active tab; pass a URL to navigate+read in one call. For static content " +
    "prefer web_read (Jina); this handles JS-heavy SPAs, authenticated pages, state-dependent content.",
  docs: `
browser_read — the page's rendered text/markdown (JS executed, live DOM).

ARGUMENTS
  url     optional — navigate and read in one call
  filter  optional CSS selector to extract just that region

EXAMPLES

  {}
  { filter: "main" }
  { url: "http://localhost:3000/docs", filter: "article" }

WHEN TO USE
  For SPAs, authenticated pages, and state-dependent content — anything where
  you need what the browser ACTUALLY rendered. For static public pages prefer
  web_read, which is much cheaper.
`,
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
