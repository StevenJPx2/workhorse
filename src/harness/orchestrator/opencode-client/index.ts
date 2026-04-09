export { getPortForTicket, setPortForTicket, releasePort, getAllocatedPorts } from "./port-manager.ts";
export type {
  OpenCodeHealth,
  OpenCodeSessionStatus,
  OpenCodeEventType,
  OpenCodeEvent,
  EventSubscription,
} from "./types.ts";
export {
  createClientForTicket,
  checkOpenCodeHealth,
  getOpenCodeStatus,
  subscribeToEvents,
  buildOpenCodeCommandWithPort,
} from "./opencode-client.ts";