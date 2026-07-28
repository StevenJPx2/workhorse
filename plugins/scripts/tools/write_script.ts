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
  docs: `
write_script — save a working Code Mode program for future runs to replay.

ARGUMENTS
  name         (required) the script name
  description  (required) what it does — OTHER AGENTS CHOOSE BY THIS, so write it
               as a capability, not a changelog
  code         (required) a TypeScript program body, exactly like run_code:
               chain tools with \`await tools.<name>(input)\`, \`console.log(...)\` is
               captured, end with \`return <value>\`
  args         optional declared arguments: [{ name, description?, required? }]
               they reach the program as \`args.<name>\` (all string values)
  scope        "repo" (default) or "global"
  statusGates  optional ticket statuses in which the script may run

WHEN TO SAVE
  A run_code program worked AND future runs will need it again: multi-step
  build+test chains, codegen refresh, repo triage, release checks.
  Do NOT save a one-off.

EXAMPLE

  { name: "typecheck-all",
    description: "Typecheck every workspace package and report the failing ones",
    code: "const r = await tools.bash({ command: 'bun run typecheck' });\\nreturn r;",
    scope: "repo" }

NOTES
  Humans audit these in the UI — write them clean.
  A seeded script cannot be overwritten by an agent; copy it under a new name.
`,
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
