/**
 * Port allocation for OpenCode instances
 * Each ticket gets a unique port starting from BASE_PORT
 */

const BASE_PORT = 14096;
const portMap = new Map<string, number>();
let nextPort = BASE_PORT;

/**
 * Get or allocate a port for a ticket's OpenCode instance
 */
export function getPortForTicket(ticketId: string): number {
  let port = portMap.get(ticketId);
  if (!port) {
    port = nextPort++;
    portMap.set(ticketId, port);
  }
  return port;
}

/**
 * Release a port when an agent stops
 */
export function releasePort(ticketId: string): void {
  portMap.delete(ticketId);
}

/**
 * Get all allocated ports
 */
export function getAllocatedPorts(): Map<string, number> {
  return new Map(portMap);
}