// write_script — register/update a persistent script (the self-extension verb).
import { tool } from "@workhorse/api";
import * as v from "valibot";

export default tool({
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
  async run({ input, core, ticket }) {
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
});
