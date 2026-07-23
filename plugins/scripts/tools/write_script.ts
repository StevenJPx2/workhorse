// write_script — save a Code Mode program as a persistent script (the
// self-extension verb; the "stabilized" rung of Code Mode).
import { tool } from "@workhorse/api";
import * as v from "valibot";

export default tool({
  name: "write_script",
  description:
    "Save a Code Mode program as a persistent, named script for future runs — self-extension. " +
    "When a run_code program worked and future runs will need it again (multi-step build+test " +
    "chains, codegen refresh, repo triage, release checks), save it once so it can be replayed " +
    "deterministically via run_script — no fresh reasoning, cheaper, auditable. The `code` is a " +
    "TypeScript program that chains this stage's tools exactly like run_code (`await tools.<name>(input)`, " +
    "`console.log(...)`, end with `return`); declared args reach it as the `args` object (`args.<name>`). " +
    "Give a clear description (other agents choose by it) and declare args. Scope 'repo' (default) or " +
    "'global'. Audited by humans in the UI — write them clean.",
  input: v.object({
    name: v.string(),
    description: v.string(),
    code: v.string(),
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
      code: input.code,
      args: input.args ?? [],
      statusGates: input.statusGates ?? [],
      createdBy: "agent",
    });
    if (!res.ok) return `write_script rejected: ${res.error}`;
    return `Script "${input.name}" saved (${scope}). Future runs can replay it via run_script.`;
  },
});
