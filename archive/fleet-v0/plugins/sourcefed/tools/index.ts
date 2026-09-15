// sourcefed stage tools — host-daemon monitor verbs, one ToolFactory per file.
import type { ToolFactory } from "@workhorse/api";
import monitor_create from "./monitor_create";
import monitor_list from "./monitor_list";
import monitor_start from "./monitor_start";
import monitor_status from "./monitor_status";
import monitor_stop from "./monitor_stop";

export const sourcefedTools: ToolFactory[] = [
  monitor_create,
  monitor_list,
  monitor_status,
  monitor_stop,
  monitor_start,
];

// Named re-exports of the SAME bindings, so an agent can
// `import { sourcefed_monitor_create } from "@workhorse/sourcefed/tools"`.
export {
  monitor_create as sourcefed_monitor_create,
  monitor_list as sourcefed_monitor_list,
  monitor_status as sourcefed_monitor_status,
  monitor_stop as sourcefed_monitor_stop,
  monitor_start as sourcefed_monitor_start,
};
