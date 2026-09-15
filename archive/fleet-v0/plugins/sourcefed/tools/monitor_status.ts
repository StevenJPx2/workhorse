// sourcefed_monitor_status — one monitor's live state.
import { tool, type Env } from "@workhorse/api";
import * as v from "valibot";
import { daemonCall, daemonTarget } from "./monitor_create";

export default tool({
  name: "sourcefed_monitor_status",
  description: "One monitor's live state on the host daemon: last poll, last event, error (if any).",
  docs: `
sourcefed_monitor_status — check a single monitor.

ARGUMENTS
  id  (required) the monitor id from sourcefed_monitor_list
`,
  input: v.object({ id: v.string() }),
  surfaces: ["stage", "chat"],
  async run({ input, env }: { input: { id: string }; env: Env }) {
    const target = daemonTarget(env);
    if (!target) return "sourcefed_monitor_status: the SourceFed daemon is not configured (SOURCEFED_DAEMON_URL missing).";
    const r = await daemonCall(target, "GET", `/monitors/${encodeURIComponent(input.id)}`);
    return r.ok ? r.text : `sourcefed_monitor_status failed (${r.text})`;
  },
});
