// Web-search provider comparison: which provider actually answers
// agent-shaped queries? Run with provider keys in the environment
// (TAVILY_API_KEY / EXA_API_KEY / BRAVE_API_KEY — unset providers are
// skipped). The winner becomes SEARCH_PROVIDER; keep this harness and
// re-run when providers change.
//
//   TAVILY_API_KEY=… bun run eval:ci

import { evalite } from "evalite";
import { webSearch, type SearchResult } from "@workhorse/search";
import type { Env } from "@workhorse/api";
import { searchFixtures, type SearchFixture } from "./fixtures/search-queries";

const PROVIDERS = ["tavily", "exa", "brave"] as const;

function envFor(provider: string): Env {
  return {
    SEARCH_PROVIDER: provider,
    TAVILY_API_KEY: provider === "tavily" ? process.env.TAVILY_API_KEY : undefined,
    EXA_API_KEY: provider === "exa" ? process.env.EXA_API_KEY : undefined,
    BRAVE_API_KEY: provider === "brave" ? process.env.BRAVE_API_KEY : undefined,
  } as unknown as Env;
}

const keyFor = (p: string) =>
  ({ tavily: "TAVILY_API_KEY", exa: "EXA_API_KEY", brave: "BRAVE_API_KEY" })[p];

const configured = PROVIDERS.filter((p) => process.env[keyFor(p)!]);

if (configured.length === 0) {
  // Keyless run (CI without secrets): register a no-op so the file still
  // reports instead of failing the runner.
  evalite("web search: no providers configured", {
    data: async () => [{ input: "none", expected: "none" }],
    task: async () => "no provider keys in env — set TAVILY_API_KEY / EXA_API_KEY / BRAVE_API_KEY",
    scorers: [{ name: "skipped", description: "placeholder", scorer: () => 1 }],
  });
}

for (const provider of configured) {

  evalite(`web search: ${provider}`, {
    data: async () =>
      searchFixtures.map((f) => ({ input: f, expected: f.expectAny.join(" | ") })),
    task: async (fixture: SearchFixture) => {
      const out = await webSearch(envFor(provider), fixture.query, 8);
      if ("error" in out) return `ERROR: ${out.error}`;
      return JSON.stringify(out.results);
    },
    scorers: [
      {
        name: "answer-bearing",
        description: "Top results contain at least one expected marker",
        scorer: ({ input, output }) => {
          if (output.startsWith("ERROR")) return 0;
          const results = JSON.parse(output) as SearchResult[];
          const haystack = results
            .map((r) => `${r.title} ${r.url} ${r.snippet}`)
            .join("\n")
            .toLowerCase();
          return input.expectAny.some((e) => haystack.includes(e.toLowerCase())) ? 1 : 0;
        },
      },
      {
        name: "expected-domain",
        description: "Expected domain appears in the top hits (soft signal)",
        scorer: ({ input, output }) => {
          if (!input.expectDomain) return 1;
          if (output.startsWith("ERROR")) return 0;
          const results = JSON.parse(output) as SearchResult[];
          return results.some((r) => r.url.includes(input.expectDomain!)) ? 1 : 0.3;
        },
      },
    ],
  });
}
