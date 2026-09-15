// sourcefed_monitor_list — what the host daemon is watching right now.
import { tool, type Env } from "@workhorse/api";
import * as v from "valibot";
import { daemonCall, daemonTarget } from "./monitor_create";

export default tool({
  name: "sourcefed_monitor_list",
  description:
    "List the monitors the host SourceFed daemon is currently watching (kind, target, state, last event).",
  docs: `
sourcefed_monitor_list — every monitor on the host daemon.

Use it to see what the fleet is watching (PRs, Jira issues, CI) before
creating a duplicate, or to confirm a monitor you created is alive.

ARGUMENTS
  (none)
`,
  input: v.object({}),
  surfaces: ["stage", "chat"],
  async run({ env }: { env: Env }) {
    const target = daemonTarget(env);
    if (!target) return "sourcefed_monitor_list: the SourceFed daemon is not configured (SOURCEFED_DAEMON_URL missing).";
    const r = await daemonCall(target, "GET", "/monitors");
    return r.ok ? r.text : `sourcefed_monitor_list failed (${r.text})`;
  },
});
