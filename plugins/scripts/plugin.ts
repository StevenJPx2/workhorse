// scripts plugin — agent self-extension (the legacy Workhorse crown jewel,
// ported to the fleet). Agents save persistent Code Mode programs for
// themselves: a chain of tool calls that worked becomes a named,
// parameterized, auditable script instead of re-derived each run — the
// "stabilized" rung of Code Mode (run_code discovers, write_script saves,
// run_script replays deterministically).
//
// The registry is DB-authoritative (D1 `scripts` table): registration is
// strictly validated at the door, listing reads the DB, never the
// filesystem. This plugin owns the two REGISTRY verbs — write_script (save)
// and list_scripts (inventory). EXECUTION (run_script) is an engine built-in
// (worker/src/flue-session.ts), not a plugin tool: running a saved TS program
// requires the stage's authentic bridge props (allowlist/dir/writeAllow),
// which only the stage session holds — a plugin ToolContext can't reach them.
//
// Scoped-token routes: sandboxes run untrusted repo code — they hold the
// scoped token, never the master bearer. Scope forgery (repo:X writing
// repo:Y scripts) is accepted for now: all fleet repos belong to the same
// operator; revisit if multi-tenancy ever arrives.

import type { Core, Env, PluginRoute, WorkhorsePlugin } from "@workhorse/api";
import { scriptsTools } from "./tools";

function json(data: unknown, status = 200): Response {
  return Response.json(data, { status });
}

// The worker package owns db.ts; plugins can't import it (hard boundary).
// Script CRUD therefore lives on Core — see @workhorse/api.

const routes: PluginRoute[] = [
  {
    // List scripts visible to a repo (repo-scoped + global, repo wins).
    method: "GET",
    path: "/scripts",
    auth: "scoped",
    async handler(request, _env, _ctx, core) {
      const repo = new URL(request.url).searchParams.get("repo") ?? undefined;
      return json({ scripts: await core.listScripts(repo) });
    },
  },
  {
    // Register or update a script (write_script's backend).
    method: "POST",
    path: "/scripts",
    auth: "scoped",
    async handler(request, _env, _ctx, core) {
      const body = (await request.json().catch(() => null)) as {
        scope?: string;
        name?: string;
        description?: string;
        code?: string;
        args?: Array<{ name: string; description?: string; required?: boolean }>;
        statusGates?: string[];
        createdBy?: "agent" | "user";
      } | null;
      if (!body) return json({ error: "json body required" }, 400);
      const r = await core.registerScript({
        scope: body.scope ?? "global",
        name: body.name ?? "",
        description: body.description ?? "",
        code: body.code ?? "",
        args: body.args ?? [],
        statusGates: body.statusGates ?? [],
        createdBy: body.createdBy ?? "agent",
      });
      return r.ok ? json({ ok: true, script: r.script }) : json({ error: r.error }, 422);
    },
  },
];

export const scriptsPlugin: WorkhorsePlugin = {
  id: "scripts",
  routes,
  tools: scriptsTools,
};
