// web_search — AI-grade ranked web results with snippets + URLs.
// Runs worker-side: calls the providers directly (keys stay in env, never
// injected into the container). Follow a hit with web_read for the full page.

import { tool } from "@workhorse/api";
import * as v from "valibot";
import { webSearch } from "../providers";

export default tool({
  name: "web_search",
  description:
    "Search the live web (AI-grade providers) and get ranked results with snippets and " +
    "URLs. Use for docs lookup, error-message research, and library comparisons; then " +
    "web_read a chosen URL for the full page. Cite what you use.",
  input: v.object({ query: v.string(), count: v.optional(v.number()) }),
  async run({ input, env }) {
    const res = await webSearch(env, input.query, input.count);
    if ("error" in res) return `web_search failed: ${res.error}`;
    const lines = res.results.map((x, i) => `${i + 1}. ${x.title}\n   ${x.url}\n   ${x.snippet}`);
    return `Results via ${res.provider}:\n\n${lines.join("\n\n")}`;
  },
});
