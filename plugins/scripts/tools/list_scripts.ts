// list_scripts — the repo's tool inventory (do this in plan).
import { tool } from "@workhorse/api";
import * as v from "valibot";

export default tool({
  name: "list_scripts",
  description:
    "List the registered scripts available for this repo (repo-scoped + fleet-global) — the " +
    "fleet's self-built toolbox. Check this BEFORE hand-writing a multi-step shell pipeline: " +
    "a prior run may have already packaged it as a script you can run_script.",
  input: v.object({}),
  async run({ core, ticket }) {
    const scripts = await core.listScripts(ticket.repo);
    if (!scripts.length) return "No scripts registered yet for this repo.";
    return `Registered scripts:\n${scripts
      .map((s) => {
        const args = s.args.map((a) => `${a.name}${a.required ? "" : "?"}`).join(", ");
        return `- ${s.name}(${args}) [${s.scope}, by ${s.createdBy}]: ${s.description}`;
      })
      .join("\n")}`;
  },
});
