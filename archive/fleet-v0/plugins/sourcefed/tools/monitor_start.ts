// sourcefed_monitor_start — resume a paused monitor.
import { tool, type Env } from "@workhorse/api";
import * as v from "valibot";
import { daemonCall, daemonTarget } from "./monitor_create";

export default tool({
  name: "sourcefed_monitor_start",
  description: "Resume a paused monitor on the host daemon.",
  docs: `
sourcefed_monitor_start — resume one monitor.

ARGUMENTS
  id  (required) the monitor id from sourcefed_monitor_list
`,
  input: v.object({ id: v.string() }),
  surfaces: ["stage", "chat"],
  async run({ input, env }: { input: { id: string }; env: Env }) {
    const target = daemonTarget(env);
    if (!target) return "sourcefed_monitor_start: the SourceFed daemon is not configured (SOURCEFED_DAEMON_URL missing).";
    const r = await daemonCall(target, "POST", `/monitors/${encodeURIComponent(input.id)}/start`);
    return r.ok ? r.text : `sourcefed_monitor_start failed (${r.text})`;
  },
});
