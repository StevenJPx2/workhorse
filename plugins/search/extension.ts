// Pi extension: web search (sandbox half).
//
// AI-grade web search — "find me the doc/answer/source" as a first-class
// tool; compose with browser_fetch for full-page reads of a chosen hit.
// Rides the worker's /search route (scoped token; provider keys stay
// worker-side).
//
// Gating: custom tool — a stage must name "web_search" in tools[] with a
// "read-only" classification. Off by default.

import { readFileSync } from "node:fs";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

const textResult = (t: string) => ({ content: [{ type: "text" as const, text: t }], details: {} });

function config(): { url: string; token: string } {
  let url = process.env.WORKHORSE_BROWSER_URL ?? "";
  let token = process.env.WORKHORSE_BROWSER_TOKEN ?? "";
  if (!url || !token) {
    try {
      const f = JSON.parse(readFileSync("/root/.workhorse-browser.json", "utf8"));
      url ||= f.url ?? "";
      token ||= f.token ?? "";
    } catch {
      /* fall through */
    }
  }
  return { url: url.replace(/\/$/, ""), token };
}

export default function (pi: ExtensionAPI) {
  pi.registerTool({
    name: "web_search",
    label: "Web search",
    description:
      "Search the live web (AI-grade providers) and get ranked results with snippets and " +
      "URLs. Use for docs lookup, error-message research, and library comparisons; then " +
      "browser_fetch a chosen URL for the full page. Cite what you use.",
    parameters: Type.Object({
      query: Type.String({ description: "The search query" }),
      count: Type.Optional(Type.Number({ description: "Max results (default 8)" })),
    }),
    async execute(_id, params) {
      const { url, token } = config();
      if (!url || !token) return textResult("web_search: not configured (no callback config).");
      const r = await fetch(`${url}/search`, {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({ query: params.query, count: params.count }),
      });
      const data = (await r.json().catch(() => ({}))) as {
        provider?: string;
        results?: Array<{ title: string; url: string; snippet: string }>;
        error?: string;
      };
      if (!r.ok || data.error) {
        return textResult(`web_search failed: ${data.error ?? `HTTP ${r.status}`}`);
      }
      const lines = (data.results ?? []).map(
        (x, i) => `${i + 1}. ${x.title}\n   ${x.url}\n   ${x.snippet}`,
      );
      return textResult(`Results via ${data.provider}:\n\n${lines.join("\n\n")}`);
    },
  });

  pi.registerTool({
    name: "web_read",
    label: "Web read",
    description:
      "Read a web page as clean LLM-ready markdown (Jina Reader) — the follow-up to a " +
      "web_search hit: pass a URL, get the article/doc content without nav chrome or " +
      "link noise. Prefer this over browser_fetch for prose/docs; use browser_fetch/" +
      "browser_screenshot when you need the rendered page itself.",
    parameters: Type.Object({
      url: Type.String({ description: "The http(s) URL to read" }),
      maxChars: Type.Optional(Type.Number({ description: "Truncate the markdown (default 40000)" })),
    }),
    async execute(_id, params) {
      const { url, token } = config();
      if (!url || !token) return textResult("web_read: not configured (no callback config).");
      const r = await fetch(`${url}/read`, {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({ url: params.url, maxChars: params.maxChars }),
      });
      const data = (await r.json().catch(() => ({}))) as {
        markdown?: string;
        truncated?: boolean;
        error?: string;
      };
      if (!r.ok || data.error) return textResult(`web_read failed: ${data.error ?? `HTTP ${r.status}`}`);
      return textResult(`${data.markdown}${data.truncated ? "\n\n…(truncated)" : ""}`);
    },
  });
}
