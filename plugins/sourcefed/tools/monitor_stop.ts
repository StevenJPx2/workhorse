// sourcefed_monitor_stop — pause a monitor (keep it, stop polling).
import { tool, type Env } from "@workhorse/api";
import * as v from "valibot";
import { daemonCall, daemonTarget } from "./monitor_create";

export default tool({
  name: "sourcefed_monitor_stop",
  description: "Pause a monitor on the host daemon: it stops polling but stays registered.",
  docs: `
sourcefed_monitor_stop — pause one monitor.

Use it when the watched thing no longer needs attention (PR merged) but you
may want to resume later. The monitor keeps its config; start resumes it.

ARGUMENTS
  id  (required) the monitor id from sourcefed_monitor_list
`,
  input: v.object({ id: v.string() }),
  surfaces: ["stage", "chat"],
  async run({ input, env }: { input: { id: string }; env: Env }) {
    const target = daemonTarget(env);
    if (!target) return "sourcefed_monitor_stop: the SourceFed daemon is not configured (SOURCEFED_DAEMON_URL missing).";
    const r = await daemonCall(target, "POST", `/monitors/${encodeURIComponent(input.id)}/stop`);
    return r.ok ? r.text : `sourcefed_monitor_stop failed (${r.text})`;
  },
});
