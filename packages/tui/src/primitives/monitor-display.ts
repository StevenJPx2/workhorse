import type { MonitorsState } from "./create-monitors";

/** Pure helper: compute display info from monitor state. */
export function getMonitorDisplayInfo(state: MonitorsState) {
  const count = state.monitors.length;
  if (count === 0) return null;

  return {
    count,
    hasErrors: state.monitors.some(
      (m) => m.state === "error" || m.errorCount > 0,
    ),
    pollingCount: state.monitors.filter((m) => m.type === "polling").length,
    eventCount: state.monitors.filter((m) => m.type === "event").length,
  };
}
