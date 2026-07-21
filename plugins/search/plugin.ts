// search plugin — AI-grade web search for agents.
//
// Provider behind a tiny interface so the eval winner is a config choice
// (SEARCH_PROVIDER) with an automatic fallback chain on 429/5xx/missing
// keys (the imgup lesson: single providers are individually unreliable).
// Keys live worker-side; the sandbox tool calls /search with the scoped
// token. Provider docs:
//   tavily   POST https://api.tavily.com/search        {api_key, query}
//   exa      POST https://api.exa.ai/search            x-api-key header
//   brave    GET  https://api.search.brave.com/res/v1/web/search?q=
//
// The evals package (evals/search.eval.ts) grades providers on fixture
// queries — re-run it before changing the default order.

import type { Env, WorkhorsePlugin } from "@workhorse/api";

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

type Provider = (env: Env, query: string, count: number) => Promise<SearchResult[] | null>;

const tavily: Provider = async (env, query, count) => {
  if (!env.TAVILY_API_KEY) return null;
  const r = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      api_key: env.TAVILY_API_KEY,
      query,
      max_results: count,
      include_answer: false,
      search_depth: "basic",
    }),
  });
  if (!r.ok) return null;
  const data = (await r.json()) as { results?: Array<{ title: string; url: string; content: string }> };
  return (data.results ?? []).map((x) => ({ title: x.title, url: x.url, snippet: x.content.slice(0, 500) }));
};

const exa: Provider = async (env, query, count) => {
  if (!env.EXA_API_KEY) return null;
  const r = await fetch("https://api.exa.ai/search", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": env.EXA_API_KEY },
    body: JSON.stringify({ query, numResults: count, contents: { text: { maxCharacters: 500 } } }),
  });
  if (!r.ok) return null;
  const data = (await r.json()) as { results?: Array<{ title?: string; url: string; text?: string }> };
  return (data.results ?? []).map((x) => ({ title: x.title ?? x.url, url: x.url, snippet: (x.text ?? "").slice(0, 500) }));
};

const brave: Provider = async (env, query, count) => {
  if (!env.BRAVE_API_KEY) return null;
  const r = await fetch(
    `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${count}`,
    { headers: { "x-subscription-token": env.BRAVE_API_KEY, accept: "application/json" } },
  );
  if (!r.ok) return null;
  const data = (await r.json()) as { web?: { results?: Array<{ title: string; url: string; description?: string }> } };
  return (data.web?.results ?? []).map((x) => ({ title: x.title, url: x.url, snippet: (x.description ?? "").slice(0, 500) }));
};

const PROVIDERS: Record<string, Provider> = { tavily, exa, brave };

/** Provider order: SEARCH_PROVIDER first (when set), then the rest. */
function order(env: Env): string[] {
  const all = Object.keys(PROVIDERS);
  const pref = env.SEARCH_PROVIDER?.toLowerCase();
  return pref && all.includes(pref) ? [pref, ...all.filter((p) => p !== pref)] : all;
}

export async function webSearch(
  env: Env,
  query: string,
  count = 8,
): Promise<{ provider: string; results: SearchResult[] } | { error: string }> {
  const tried: string[] = [];
  for (const name of order(env)) {
    try {
      const results = await PROVIDERS[name](env, query, count);
      if (results === null) {
        tried.push(`${name}(no key/error)`);
        continue;
      }
      if (results.length) return { provider: name, results };
      tried.push(`${name}(empty)`);
    } catch {
      tried.push(`${name}(threw)`);
    }
  }
  return { error: `all providers failed: ${tried.join(", ") || "none configured"}` };
}

export const searchPlugin: WorkhorsePlugin = {
  id: "search",
  routes: [
    {
      // Sandbox web_search tool → provider chain. Scoped token; provider
      // keys never enter the sandbox.
      method: "POST",
      path: "/search",
      auth: "scoped",
      async handler(request, env) {
        const { query, count } = (await request.json().catch(() => ({}))) as {
          query?: string;
          count?: number;
        };
        if (!query?.trim()) return Response.json({ error: "query required" }, { status: 400 });
        const out = await webSearch(env, query.trim().slice(0, 400), Math.min(count ?? 8, 20));
        return Response.json(out, { status: "error" in out ? 502 : 200 });
      },
    },
  ],
};
