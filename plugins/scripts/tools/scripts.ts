// scripts — the fleet's self-built toolbox: list what exists, save a new one.
//
// `list` is read-only and `write` registers a script other runs will execute,
// so these are different powers. They share a tool anyway: registration is
// gated by the stage allowlist granting `scripts` at all, and a registered
// script only RUNS via run_script, which is separately gated. Splitting here
// would cost a second description for no additional containment.
//
// (run_script itself is an engine built-in, not a plugin tool — it needs the
// stage's authentic Code Mode bridge props.)

import { tool } from "@workhorse/api";
import * as v from "valibot";

export default tool({
  name: "scripts",
  description:
    "The fleet's self-built toolbox: list (scripts registered for this repo + global) and write " +
    "(save a working Code Mode program for future runs to replay). Check list BEFORE hand-writing " +
    "a multi-step pipeline — a prior run may have already packaged it.",
  docs: `
scripts — persistent, replayable Code Mode programs. The "stabilized" rung of
Code Mode: run_code discovers a working chain, write saves it, run_script
replays it deterministically with no fresh reasoning.

ACTIONS

list — what is available for this repo.
  No arguments. Returns repo-scoped + fleet-global scripts as
  \`name(args) [scope, by whom]: description\`.
  Do this BEFORE writing a multi-step shell pipeline by hand.

write — save a program for future runs.
  name         (required) the script name
  description  (required) what it does — OTHER AGENTS CHOOSE BY THIS, so write
               it as a capability, not a changelog
  code         (required) a TypeScript program body, exactly like run_code:
               chain tools with \`await tools.<name>(input)\`, \`console.log(...)\`
               is captured, end with \`return <value>\`
  args         optional declared arguments: [{ name, description?, required? }]
               they reach the program as \`args.<name>\` (all string values)
  scope        "repo" (default) or "global"
  statusGates  optional ticket statuses in which the script may run

WHEN TO SAVE
  A run_code program worked AND future runs will need it again: multi-step
  build+test chains, codegen refresh, repo triage, release checks. Do not save
  a one-off.

EXAMPLE

  { action: "write",
    name: "typecheck-all",
    description: "Typecheck every workspace package and report the failing ones",
    code: "const r = await tools.bash({ command: 'bun run typecheck' });\\nreturn r;",
    scope: "repo" }

NOTES
  Humans audit these in the UI — write them clean.
  A seeded script cannot be overwritten by an agent; copy it under a new name.
`,
  input: v.object({
    action: v.picklist(["list", "write"]),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    code: v.optional(v.string()),
    args: v.optional(
      v.array(v.object({ name: v.string(), description: v.optional(v.string()), required: v.optional(v.boolean()) })),
    ),
    scope: v.optional(v.picklist(["repo", "global"])),
    statusGates: v.optional(v.array(v.string())),
  }),
  async run({ input, core, ticket }) {
    if (input.action === "list") {
      const scripts = await core.listScripts(ticket.repo);
      if (!scripts.length) return "No scripts registered yet for this repo.";
      return `Registered scripts:\n${scripts
        .map((s) => {
          const args = s.args.map((a) => `${a.name}${a.required ? "" : "?"}`).join(", ");
          return `- ${s.name}(${args}) [${s.scope}, by ${s.createdBy}]: ${s.description}`;
        })
        .join("\n")}`;
    }

    if (!input.name || !input.description || !input.code) {
      return 'scripts: action "write" needs name, description, and code.';
    }

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

    if (!res.ok) return `scripts write rejected: ${res.error}`;
    return `Script "${input.name}" saved (${scope}). Future runs can replay it via run_script.`;
  },
});
