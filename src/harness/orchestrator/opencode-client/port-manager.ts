/**
 * Port allocation for OpenCode instances
 *
 * IMPORTANT: Start from 14100 to avoid conflicts with existing OpenCode
 * instances (the user's main Claude Code runs on 14096 by default).
 */

const BASE_PORT = 14100;
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
 * Set a specific port for a ticket (used during discovery)
 */
export function setPortForTicket(ticketId: string, port: number): void {
  portMap.set(ticketId, port);
  // Update nextPort to avoid conflicts
  if (port >= nextPort) {
    nextPort = port + 1;
  }
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
