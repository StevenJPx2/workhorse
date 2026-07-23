// run_script — resolve from the registry, gate-check against LIVE status, exec locally.
import { tool } from "@workhorse/api";
import * as v from "valibot";
import { q } from "./_shared";

export default tool({
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
  async run({ input, core, sandbox, ticket }) {
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
});
