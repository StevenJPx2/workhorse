import type {
  EventMonitorOptions,
  MonitorOptions,
  PollingMonitorOptions,
} from "../types.ts";
import { BaseMonitor, ERROR_THRESHOLD } from "./base.ts";
import { EventMonitor } from "./event.ts";
import { PollingMonitor } from "./polling.ts";

export { BaseMonitor, ERROR_THRESHOLD, EventMonitor, PollingMonitor };

/** Factory map for creating monitors by type */
export const MonitorFactory = {
  polling: (opts: PollingMonitorOptions) => new PollingMonitor(opts),
  event: (opts: EventMonitorOptions) => new EventMonitor(opts),
} as const;

/** Create a monitor from options */
export function createMonitor(options: MonitorOptions): BaseMonitor {
  return MonitorFactory[options.type](options as never);
}
