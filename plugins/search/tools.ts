// Stage tools: web search + read (flue engine).
//
// The flue port of extension.ts. Under the flue engine the tool runs
// worker-side, so it calls the search providers directly through the
// worker's own logic instead of round-tripping a scoped-token /search
// callback from the sandbox. Provider keys stay in env (worker-side),
// never injected into the container.
//
//   web_search — AI-grade ranked results with snippets + URLs
//   web_read   — a page as clean LLM-ready markdown (Jina Reader)

import { defineTool } from "@flue/runtime";
import type { PluginToolFactory } from "@workhorse/api";
import * as v from "valibot";
import { readPage, webSearch } from "./providers";

export const searchTools: PluginToolFactory = ({ env }) => [
  defineTool({
    name: "web_search",
    description:
      "Search the live web (AI-grade providers) and get ranked results with snippets and " +
      "URLs. Use for docs lookup, error-message research, and library comparisons; then " +
      "web_read a chosen URL for the full page. Cite what you use.",
    input: v.object({ query: v.string(), count: v.optional(v.number()) }),
    async run({ input }) {
      const res = await webSearch(env, input.query, input.count);
      if ("error" in res) return `web_search failed: ${res.error}`;
      const lines = res.results.map((x, i) => `${i + 1}. ${x.title}\n   ${x.url}\n   ${x.snippet}`);
      return `Results via ${res.provider}:\n\n${lines.join("\n\n")}`;
    },
  }),
  defineTool({
    name: "web_read",
    description:
      "Read a web page as clean LLM-ready markdown (Jina Reader) — the follow-up to a " +
      "web_search hit: pass a URL, get the article/doc content without nav chrome or link " +
      "noise. Prefer this for prose/docs; use the browser tools for the rendered page itself.",
    input: v.object({ url: v.string(), maxChars: v.optional(v.number()) }),
    async run({ input }) {
      const res = await readPage(env, input.url, input.maxChars);
      if ("error" in res) return `web_read failed: ${res.error}`;
      return `${res.markdown}${res.truncated ? "\n\n…(truncated)" : ""}`;
    },
  }),
];
