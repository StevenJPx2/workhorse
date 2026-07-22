// Stage tools: script service (flue engine) — agent self-extension.
//
// The flue port unifies what extension.ts split across an HTTP callback and
// a local exec: the tool runs worker-side, so it calls core.listScripts /
// getScriptByName / registerScript DIRECTLY (no /scripts round-trip) and
// execs the script body in the container via the sandbox handle. Ticket
// context (repo for scope, id for live status gating) comes from the factory
// ctx, not a sandbox file.
//
//   list_scripts — the repo's tool inventory (do this in plan)
//   run_script   — resolve from the registry, gate-check, exec locally
//   write_script — register/update a script (the self-extension verb)
//
// Args reach the body as ARG_<NAME> env vars — no interpolation into the
// command, no quoting injection surface. (find_script/find_tool need a Core
// semindex query method; staged with the cutover.)

import { defineTool } from "@flue/runtime";
import type { PluginToolFactory } from "@workhorse/api";
import * as v from "valibot";

const q = (s: string) => `'${s.replace(/'/g, "'\\''")}'`;

export const scriptsTools: PluginToolFactory = ({ core, sandbox, ticket }) => [
  defineTool({
    name: "list_scripts",
    description:
      "List the registered scripts available for this repo (repo-scoped + fleet-global) — the " +
      "fleet's self-built toolbox. Check this BEFORE hand-writing a multi-step shell pipeline: " +
      "a prior run may have already packaged it as a script you can run_script.",
    input: v.object({}),
    async run() {
      const scripts = await core.listScripts(ticket.repo);
      if (!scripts.length) return "No scripts registered yet for this repo.";
      return `Registered scripts:\n${scripts
        .map((s) => {
          const args = s.args.map((a) => `${a.name}${a.required ? "" : "?"}`).join(", ");
          return `- ${s.name}(${args}) [${s.scope}, by ${s.createdBy}]: ${s.description}`;
        })
        .join("\n")}`;
    },
  }),
  defineTool({
    name: "run_script",
    description:
      "Run a registered script by name (see list_scripts). Pass args as key/value pairs — they " +
      "reach the script as ARG_<NAME> environment variables. Runs in the workspace root. " +
      "Returns stdout+stderr (exit code on failure).",
    input: v.object({
      name: v.string(),
      args: v.optional(v.record(v.string(), v.string())),
      cwd: v.optional(v.string()),
    }),
    async run({ input }) {
      const script = await core.getScriptByName(input.name, ticket.repo);
      if (!script) return `run_script: no script named "${input.name}". Use list_scripts.`;
      // Status gate against the ticket's LIVE status (no stale sandbox state).
      if (script.statusGates.length) {
        const t = await core.getTicket(ticket.id);
        const status = t?.status;
        if (status && !script.statusGates.includes(status)) {
          return `run_script: "${script.name}" is gated to statuses [${script.statusGates.join(", ")}]; ticket status is ${status}.`;
        }
      }
      for (const a of script.args) {
        if (a.required && !(input.args ?? {})[a.name]) {
          return `run_script: missing required arg "${a.name}" (${a.description ?? ""})`;
        }
      }
      const envPrefix = Object.entries(input.args ?? {})
        .map(([k, val]) => `ARG_${k}=${q(val)}`)
        .join(" ");
      const cd = input.cwd ? `cd ${q(input.cwd)} && ` : "";
      const r = await sandbox.exec(`${cd}${envPrefix ? envPrefix + " " : ""}bash -c ${q(script.command)}`, {
        timeout: 300_000,
      });
      if (r.exitCode !== 0) {
        return `run_script "${script.name}" failed (exit ${r.exitCode})\n${[r.stdout, r.stderr]
          .filter(Boolean)
          .join("\n")
          .slice(-4000)}`;
      }
      const out = [r.stdout, r.stderr].filter(Boolean).join("\n--- stderr ---\n").trim();
      return out || "(no output, exit 0)";
    },
  }),
  defineTool({
    name: "write_script",
    description:
      "Register (or update) a persistent script in the fleet registry — self-extension. When " +
      "you find yourself composing the same multi-step shell pipeline future runs will need " +
      "again (build+test incantations, codegen refresh, env setup, release checks), package it " +
      "once: name, a clear description (other agents choose by it), and declared args (reach the " +
      "body as ARG_<NAME> env vars). Scope 'repo' (default) or 'global'. Audited by humans in " +
      "the UI — write them clean.",
    input: v.object({
      name: v.string(),
      description: v.string(),
      command: v.string(),
      args: v.optional(
        v.array(v.object({ name: v.string(), description: v.optional(v.string()), required: v.optional(v.boolean()) })),
      ),
      scope: v.optional(v.picklist(["repo", "global"])),
      statusGates: v.optional(v.array(v.string())),
    }),
    async run({ input }) {
      const scope = input.scope === "global" ? "global" : ticket.repo ? `repo:${ticket.repo}` : "global";
      const res = await core.registerScript({
        scope,
        name: input.name,
        description: input.description,
        command: input.command,
        args: input.args ?? [],
        statusGates: input.statusGates ?? [],
        createdBy: "agent",
      });
      if (!res.ok) return `write_script rejected: ${res.error}`;
      return `Script "${input.name}" registered (${scope}). Future runs can call it via run_script.`;
    },
  }),
];
