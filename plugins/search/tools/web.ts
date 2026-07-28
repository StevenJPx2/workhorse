// web — search the live web and read pages as markdown.
//
// Both actions are read-only network fetches through worker-side providers
// (API keys stay in env, never reach the container), so consolidation is
// unconditionally safe — there is no capability line here.

import { tool } from "@workhorse/api";
import * as v from "valibot";
import { readPage, webSearch } from "../providers";

export default tool({
  name: "web",
  description:
    "Reach the live web: search (ranked results with snippets and URLs) and read (a page as " +
    "clean LLM-ready markdown). The usual loop is search, then read the most promising hit. " +
    "Use for docs lookup, error-message research, and library comparisons. Cite what you use.",
  docs: `
web — live web access via worker-side providers. Provider API keys never enter
the container.

ACTIONS

search — ranked results with snippets.
  query  (required) the search text
  count  optional number of results
  Returns numbered { title, url, snippet }. Triage from the snippets and read
  only the promising hits rather than reading everything.

read — one page as clean markdown (Jina Reader).
  url       (required) the page
  maxChars  optional truncation limit
  Strips nav chrome and link noise, leaving article/doc prose. Prefer this for
  static docs and articles — it is much cheaper than a real browser. For a
  JS-rendered SPA, an authenticated page, or anything where you need the
  RENDERED state, use the \`browser\` tool instead.

EXAMPLES

  { action: "search", query: "valibot discriminated union schema" }
  { action: "search", query: "TS2741 property missing", count: 5 }
  { action: "read",   url: "https://valibot.dev/api/variant/" }
  { action: "read",   url: "https://example.com/long-doc", maxChars: 20000 }

A provider failure is reported as a message, not thrown.
`,
  input: v.object({
    action: v.picklist(["search", "read"]),
    /** Search text for search. */
    query: v.optional(v.string()),
    /** Result count for search. */
    count: v.optional(v.number()),
    /** Page URL for read. */
    url: v.optional(v.string()),
    /** Truncation limit for read. */
    maxChars: v.optional(v.number()),
  }),
  async run({ input, env }) {
    if (input.action === "search") {
      if (!input.query) return 'web: action "search" needs a query.';
      const res = await webSearch(env, input.query, input.count);
      if ("error" in res) return `web search failed: ${res.error}`;
      const lines = res.results.map((x, i) => `${i + 1}. ${x.title}\n   ${x.url}\n   ${x.snippet}`);
      return `Results via ${res.provider}:\n\n${lines.join("\n\n")}`;
    }

    if (!input.url) return 'web: action "read" needs a url.';
    const res = await readPage(env, input.url, input.maxChars);
    if ("error" in res) return `web read failed: ${res.error}`;
    return `${res.markdown}${res.truncated ? "\n\n…(truncated)" : ""}`;
  },
});
