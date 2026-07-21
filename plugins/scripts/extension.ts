// Pi extension: Workhorse script service (sandbox half) — agent
// self-extension. Instead of re-deriving the same bash pipeline every run,
// an agent REGISTERS it once as a named, parameterized script; every later
// run (any ticket, same repo — or fleet-wide with scope=global) calls it
// as a one-line tool. Cheaper in tokens, auditable by humans (the fleet's
// self-built toolbox is readable in the UI), and compounding: the fleet
// gets better at a repo the more it works on it.
//
//   list_scripts  — the repo's tool inventory (do this in plan)
//   run_script    — fetch from the registry, gate-check, execute locally
//   write_script  — register/update a script (the self-extension verb)
//
// Execution is LOCAL (bash -c in the sandbox); the registry only stores.
// Args are passed as ARG_<NAME> env vars — no string interpolation into
// the command body, no quoting injection surface.
//
// Config: same callback file as the browser plane —
// /root/.workhorse-browser.json { url, token }. Ticket context (repo slug
// for scope resolution + ticketId for live status gating) comes from
// /root/.workhorse-ticket.json, written at prepare.
//
// Gating: custom tools — a stage must name them in tools[]. run_script and
// write_script are write-classified; list_scripts is read-only.

import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { promisify } from "node:util";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

const run = promisify(execFile);
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

/** Ticket context written at prepare: repo slug + current status. */
function ticketCtx(): { repo?: string; status?: string; ticketId?: string } {
  try {
    return JSON.parse(readFileSync("/root/.workhorse-ticket.json", "utf8"));
  } catch {
    return {};
  }
}

interface Script {
  scope: string;
  name: string;
  description: string;
  command: string;
  args: Array<{ name: string; description?: string; required?: boolean }>;
  statusGates: string[];
  createdBy: string;
}

async function api(path: string, init?: RequestInit): Promise<Response> {
  const { url, token } = config();
  if (!url || !token) throw new Error("script service not configured (no callback config)");
  return fetch(`${url}${path}`, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
  });
}

export default function (pi: ExtensionAPI) {
  pi.registerTool({
    name: "list_scripts",
    label: "List scripts",
    description:
      "List the registered scripts available for this repo (repo-scoped + fleet-global) — " +
      "the fleet's self-built toolbox. Check this BEFORE hand-writing a multi-step shell " +
      "pipeline: a prior run may have already packaged it as a script you can run_script.",
    parameters: Type.Object({}),
    async execute() {
      const { repo } = ticketCtx();
      const r = await api(`/scripts${repo ? `?repo=${encodeURIComponent(repo)}` : ""}`);
      if (!r.ok) return textResult(`list_scripts failed: HTTP ${r.status}`);
      const { scripts } = (await r.json()) as { scripts: Script[] };
      if (!scripts.length) return textResult("No scripts registered yet for this repo.");
      const lines = scripts.map((s) => {
        const args = s.args.map((a) => `${a.name}${a.required ? "" : "?"}`).join(", ");
        return `- ${s.name}(${args}) [${s.scope}, by ${s.createdBy}]: ${s.description}`;
      });
      return textResult(`Registered scripts:\n${lines.join("\n")}`);
    },
  });

  pi.registerTool({
    name: "run_script",
    label: "Run script",
    description:
      "Run a registered script by name (see list_scripts). Pass args as key/value pairs — " +
      "they reach the script as ARG_<NAME> environment variables. Runs in the current " +
      "working directory. Returns stdout+stderr (exit code on failure).",
    parameters: Type.Object({
      name: Type.String({ description: "Registered script name" }),
      args: Type.Optional(
        Type.Record(Type.String(), Type.String(), {
          description: "Arg values, keyed by the script's declared arg names",
        }),
      ),
      cwd: Type.Optional(Type.String({ description: "Working directory (default: current)" })),
    }),
    async execute(_id, params) {
      const { repo, ticketId } = ticketCtx();
      const qs = new URLSearchParams({ name: params.name });
      if (repo) qs.set("repo", repo);
      if (ticketId) qs.set("ticket", ticketId);
      const r = await api(`/scripts/get?${qs}`);
      if (r.status === 404) {
        return textResult(`run_script: no script named "${params.name}". Use list_scripts.`);
      }
      if (!r.ok) return textResult(`run_script: registry fetch failed (HTTP ${r.status})`);
      const { script, ticketStatus } = (await r.json()) as {
        script: Script;
        ticketStatus: string | null;
      };
      // Status gate against the ticket's LIVE status (from the registry
      // response — no stale sandbox state): a deploy script gated to
      // in-review must not run from a plan stage.
      if (script.statusGates.length && ticketStatus && !script.statusGates.includes(ticketStatus)) {
        return textResult(
          `run_script: "${script.name}" is gated to statuses [${script.statusGates.join(", ")}]; ticket status is ${ticketStatus}.`,
        );
      }
      // Required args present?
      for (const a of script.args) {
        if (a.required && !(params.args ?? {})[a.name]) {
          return textResult(`run_script: missing required arg "${a.name}" (${a.description ?? ""})`);
        }
      }
      const env: Record<string, string> = { ...process.env as Record<string, string> };
      for (const [k, v] of Object.entries(params.args ?? {})) env[`ARG_${k}`] = v;
      try {
        const { stdout, stderr } = await run("bash", ["-c", script.command], {
          cwd: params.cwd || process.cwd(),
          env,
          timeout: 300_000,
          maxBuffer: 4 << 20,
        });
        const out = [stdout, stderr].filter(Boolean).join("\n--- stderr ---\n").trim();
        return textResult(out || "(no output, exit 0)");
      } catch (err) {
        const e = err as { code?: number; stdout?: string; stderr?: string; message?: string };
        return textResult(
          `run_script "${script.name}" failed (exit ${e.code ?? "?"})\n${[e.stdout, e.stderr].filter(Boolean).join("\n").slice(-4000) || e.message}`,
        );
      }
    },
  });

  pi.registerTool({
    name: "write_script",
    label: "Write script",
    description:
      "Register (or update) a persistent script in the fleet registry — self-extension. " +
      "When you find yourself composing the same multi-step shell pipeline that future runs " +
      "will need again (build+test incantations, codegen refresh, env setup, release checks), " +
      "package it once: give it a name, a clear description (other agents choose by it), and " +
      "declared args (reach the body as ARG_<NAME> env vars). Scope 'repo' (default: this " +
      "repo only) or 'global' (whole fleet). Registered scripts are audited by humans in the " +
      "UI — write them clean.",
    parameters: Type.Object({
      name: Type.String({ description: "Script name: ^[a-z][a-z0-9_-]{1,63}$" }),
      description: Type.String({ description: "What it does + when to use it (agents pick by this)" }),
      command: Type.String({ description: "Bash body. Use $ARG_<NAME> for declared args." }),
      args: Type.Optional(
        Type.Array(
          Type.Object({
            name: Type.String(),
            description: Type.Optional(Type.String()),
            required: Type.Optional(Type.Boolean()),
          }),
          { description: "Declared parameters" },
        ),
      ),
      scope: Type.Optional(
        Type.Union([Type.Literal("repo"), Type.Literal("global")], {
          description: "repo = this repo only (default); global = whole fleet",
        }),
      ),
      statusGates: Type.Optional(
        Type.Array(Type.String(), {
          description: "Restrict to ticket statuses (e.g. ['implementing']). Empty = any.",
        }),
      ),
    }),
    async execute(_id, params) {
      const { repo } = ticketCtx();
      const scope = params.scope === "global" ? "global" : repo ? `repo:${repo}` : "global";
      const r = await api("/scripts", {
        method: "POST",
        body: JSON.stringify({
          scope,
          name: params.name,
          description: params.description,
          command: params.command,
          args: params.args ?? [],
          statusGates: params.statusGates ?? [],
          createdBy: "agent",
        }),
      });
      const body = (await r.json().catch(() => ({}))) as { error?: string };
      if (!r.ok) return textResult(`write_script rejected: ${body.error ?? `HTTP ${r.status}`}`);
      return textResult(
        `Script "${params.name}" registered (${scope}). Future runs can call it via run_script.`,
      );
    },
  });
}
