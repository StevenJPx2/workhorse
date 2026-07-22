// search plugin — AI-grade web search for agents.
//
// The provider chain lives in providers.ts (shared by these routes and the
// web_search/web_read stage tools). Routes stay for the stateless callback
// path and any non-flue caller; the flue engine calls the tools directly.

import type { WorkhorsePlugin } from "@workhorse/api";
import { readPage, webSearch } from "./providers";
import { searchTools } from "./tools";

export type { SearchResult } from "./providers";
export { readPage, webSearch } from "./providers";

export const searchPlugin: WorkhorsePlugin = {
  id: "search",
  tools: searchTools,
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
    {
      // Sandbox web_read tool → Jina Reader (url → markdown).
      method: "POST",
      path: "/read",
      auth: "scoped",
      async handler(request, env) {
        const { url: target, maxChars } = (await request.json().catch(() => ({}))) as {
          url?: string;
          maxChars?: number;
        };
        if (!target?.trim()) return Response.json({ error: "url required" }, { status: 400 });
        const out = await readPage(env, target.trim(), Math.min(maxChars ?? 40_000, 100_000));
        return Response.json(out, { status: "error" in out ? 502 : 200 });
      },
    },
  ],
};
