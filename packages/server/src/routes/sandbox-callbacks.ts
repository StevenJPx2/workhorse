// Scoped-token callbacks for in-sandbox tools: semantic find + the R2
// dependency cache. Untrusted repo code holds the scoped token — these
// routes expose exactly what the tools need, nothing else.

import { json, type Route } from "../router";
import { withSpan } from "@workhorse/o11y";

export const sandboxCallbackRoutes: Route[] = [
  {
    // Semantic find: sandbox tools query the AI Search registries.
    method: "GET",
    path: "/find",
    auth: "scoped",
    async handler({ env, url, ctx }) {
      const corpus = url.searchParams.get("corpus") ?? "";
      const q = url.searchParams.get("q") ?? "";
      if (!q.trim()) return json({ error: "q required" }, 400);
      const kind = { scripts: "scripts", workflows: "workflows", tools: "tools" }[corpus] as import("../aisearch").RegistryCorpus | undefined;
      if (!kind) return json({ error: "corpus must be scripts|workflows|tools" }, 400);
      const topK = Math.min(Number(url.searchParams.get("topK") ?? 5) || 5, 20);
      const { queryRegistry } = await import("../aisearch");
      return json({ hits: await withSpan(ctx, "semantic_find", { corpus, query: q }, () => queryRegistry(env, kind, q, topK)) });
    },
  },
  {
    // Dependency cache (R2): GET = restore (streamed), PUT = save.
    // Content-addressed keys (repo + lockfile hash) — entries immutable.
    method: "*",
    path: "/depcache",
    auth: "scoped",
    async handler({ request, env, url }) {
      const repo = url.searchParams.get("repo") ?? "";
      const hash = url.searchParams.get("hash") ?? "";
      if (!/^[\w./-]+$/.test(repo) || repo.includes("..") || !/^[a-f0-9]{64}$/.test(hash)) {
        return json({ error: "bad repo/hash" }, 400);
      }
      const key = `depcache/${repo}/${hash}.tar.gz`;
      if (request.method === "GET") {
        const obj = await env.BLOBS.get(key);
        if (!obj) return json({ error: "miss" }, 404);
        return new Response(obj.body, { headers: { "content-type": "application/gzip" } });
      }
      if (request.method === "PUT") {
        if (!request.body) return json({ error: "body required" }, 400);
        await env.BLOBS.put(key, request.body);
        return json({ ok: true });
      }
      return json({ error: "method" }, 405);
    },
  },
];
