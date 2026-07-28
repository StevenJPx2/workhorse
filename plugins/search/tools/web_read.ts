// web_read — a web page as clean LLM-ready markdown (Jina Reader).
// The follow-up to a web_search hit: pass a URL, get the article/doc content
// without nav chrome. Prefer this for prose/docs; browser tools for the
// rendered page itself.

import { tool } from "@workhorse/api";
import * as v from "valibot";
import { readPage } from "../providers";

export default tool({
  name: "web_read",
  description:
    "Read a web page as clean LLM-ready markdown (Jina Reader) — the follow-up to a " +
    "web_search hit: pass a URL, get the article/doc content without nav chrome or link " +
    "noise. Prefer this for prose/docs; use the browser tools for the rendered page itself.",
  docs: `
web_read — fetch one page as clean, LLM-ready markdown (via Jina Reader).

Strips nav chrome and link noise, leaving article/doc prose.

ARGUMENTS
  url       (required) the page
  maxChars  optional truncation limit

EXAMPLES

  { url: "https://valibot.dev/api/variant/" }
  { url: "https://example.com/long-doc", maxChars: 20000 }

WHEN TO USE
  Static docs and articles — it is much cheaper than a real browser.
  For a JS-rendered SPA, an authenticated page, or anything where you need the
  RENDERED state, use browser_open + browser_read instead.
`,
  input: v.object({ url: v.string(), maxChars: v.optional(v.number()) }),
  async run({ input, env }) {
    const res = await readPage(env, input.url, input.maxChars);
    if ("error" in res) return `web_read failed: ${res.error}`;
    return `${res.markdown}${res.truncated ? "\n\n…(truncated)" : ""}`;
  },
});
