// scripts plugin — agent self-extension (the legacy Workhorse crown jewel,
// ported to the fleet). Agents author persistent shell-script tools for
// themselves: repeated command sequences become named, parameterized,
// auditable tools instead of re-derived bash each run.
//
// The registry is DB-authoritative (D1 `scripts` table): registration is
// strictly validated at the door, listing reads the DB, never the
// filesystem. Execution happens SANDBOX-side (extension.ts): the tool
// fetches {command, args, gates} from these routes, gate-checks against
// the ticket's status, and runs the body with bash inside the sandbox.
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
        command?: string;
        args?: Array<{ name: string; description?: string; required?: boolean }>;
        statusGates?: string[];
        createdBy?: "agent" | "user";
      } | null;
      if (!body) return json({ error: "json body required" }, 400);
      const r = await core.registerScript({
        scope: body.scope ?? "global",
        name: body.name ?? "",
        description: body.description ?? "",
        command: body.command ?? "",
        args: body.args ?? [],
        statusGates: body.statusGates ?? [],
        createdBy: body.createdBy ?? "agent",
      });
      return r.ok ? json({ ok: true, script: r.script }) : json({ error: r.error }, 422);
    },
  },
  {
    // Fetch one script (run_script's backend — the sandbox executes it).
    // Returns the ticket's LIVE status alongside so the gate check uses
    // fresh state, not whatever was written into the sandbox at prepare.
    method: "GET",
    path: "/scripts/get",
    auth: "scoped",
    async handler(request, _env, _ctx, core) {
      const url = new URL(request.url);
      const name = url.searchParams.get("name") ?? "";
      const repo = url.searchParams.get("repo") ?? undefined;
      const ticketId = url.searchParams.get("ticket") ?? "";
      const script = await core.getScriptByName(name, repo);
      if (!script) return json({ error: `no script named "${name}"` }, 404);
      const ticket = ticketId ? await core.getTicket(ticketId) : null;
      return json({ script, ticketStatus: ticket?.status ?? null });
    },
  },
];

export const scriptsPlugin: WorkhorsePlugin = {
  id: "scripts",
  routes,
  tools: scriptsTools,
};
