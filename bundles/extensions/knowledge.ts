// Pi extension: Workhorse fleet knowledge (sandbox half).
//
// One tool — search_fleet_knowledge — that queries the fleet's AI Search
// index of past run traces: every ticket the fleet ever worked lands there
// as a distilled document (task, per-stage analyses, verifier verdict,
// escalations, outcome). This is INSTITUTIONAL memory across all repos and
// tickets; Magic Context (ctx_search) is the per-repo working memory
// curated by agents. Search both when starting a task.
//
// Gating: custom tool — a workflow stage must name it in tools[] with a
// "read-only" classification, or pi-workflow blocks it. Off by default.
//
// Config: same callback file as the browser plane —
// /root/.workhorse-browser.json { url, token } (env WORKHORSE_BROWSER_URL /
// WORKHORSE_BROWSER_TOKEN win). The scoped token authorizes /knowledge/search.

import { readFileSync } from "node:fs";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

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

interface KnowledgeHit {
  source: string;
  score?: number;
  text: string;
  ticketId?: string;
  repo?: string;
}

export default function (pi: ExtensionAPI) {
  pi.registerTool({
    name: "search_fleet_knowledge",
    label: "Fleet knowledge search",
    description:
      "Search the fleet's institutional memory: distilled traces of every past Workhorse run " +
      "(task, per-stage analyses, verifier findings, escalations, outcome) across all repos " +
      "and tickets. Ask before solving: similar error messages, the same subsystem, prior " +
      "attempts at this kind of task. Complements ctx_search (per-repo working memory) — " +
      "this one sees what OTHER tickets and repos learned.",
    parameters: Type.Object({
      query: Type.String({
        description:
          "What to look for — error text, subsystem, task shape (e.g. \"vitest mock reset flaky\", \"nuxt ui pagination\")",
      }),
      limit: Type.Optional(Type.Number({ description: "Max hits (default 6, max 20)" })),
    }),
    async execute(_id, params) {
      const { url, token } = config();
      if (!url || !token) {
        return {
          content: [{ type: "text" as const, text: "Fleet knowledge not configured in this sandbox." }],
          details: {},
        };
      }
      const res = await fetch(`${url}/knowledge/search`, {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({ query: params.query, limit: params.limit }),
      });
      if (!res.ok) {
        return {
          content: [{ type: "text" as const, text: `Fleet knowledge search failed: HTTP ${res.status}` }],
          details: {},
        };
      }
      const { hits } = (await res.json()) as { hits: KnowledgeHit[] };
      if (!hits?.length) {
        return {
          content: [{ type: "text" as const, text: "No fleet knowledge hits — likely novel territory for the fleet." }],
          details: {},
        };
      }
      const text = hits
        .map(
          (h, i) =>
            `### ${i + 1}. ${h.source}${h.repo ? ` (${h.repo})` : ""}${h.score !== undefined ? ` — score ${h.score.toFixed(2)}` : ""}\n${h.text}`,
        )
        .join("\n\n");
      return { content: [{ type: "text" as const, text }], details: {} };
    },
  });
}
