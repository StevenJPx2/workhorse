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
  input: v.object({ url: v.string(), maxChars: v.optional(v.number()) }),
  async run({ input, env }) {
    const res = await readPage(env, input.url, input.maxChars);
    if ("error" in res) return `web_read failed: ${res.error}`;
    return `${res.markdown}${res.truncated ? "\n\n…(truncated)" : ""}`;
  },
});
