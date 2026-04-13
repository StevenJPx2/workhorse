/**
 * Tests for port-manager
 */

import { describe, it, expect } from "bun:test";
import {
  getPortForTicket,
  setPortForTicket,
  releasePort,
  getAllocatedPorts,
} from "./port-manager.ts";

describe("port-manager", () => {
  // Track allocated ports to clean up after tests
  const allocatedTickets: string[] = [];

  function track(ticketId: string): string {
    allocatedTickets.push(ticketId);
    return ticketId;
  }

  // Clean up after each test by releasing tracked ports
  // (Note: we can't reset the module state easily, so we'll work around it)

  it("should allocate a port for a new ticket", () => {
    const ticketId = track(`PORT-TEST-${Date.now()}`);
    const port = getPortForTicket(ticketId);

    expect(typeof port).toBe("number");
    expect(port).toBeGreaterThanOrEqual(14100);
  });

  it("should return same port for same ticket", () => {
    const ticketId = track(`PORT-SAME-${Date.now()}`);
    const port1 = getPortForTicket(ticketId);
    const port2 = getPortForTicket(ticketId);

    expect(port1).toBe(port2);
  });

  it("should allocate different ports for different tickets", () => {
    const ticket1 = track(`PORT-A-${Date.now()}`);
    const ticket2 = track(`PORT-B-${Date.now()}`);

    const port1 = getPortForTicket(ticket1);
    const port2 = getPortForTicket(ticket2);

    expect(port1).not.toBe(port2);
  });

  it("should allow setting a specific port", () => {
    const ticketId = track(`PORT-SET-${Date.now()}`);
    const specificPort = 15000;

    setPortForTicket(ticketId, specificPort);
    const port = getPortForTicket(ticketId);

    expect(port).toBe(specificPort);
  });

  it("should update nextPort when setting a higher port", () => {
    const ticketId = track(`PORT-HIGH-${Date.now()}`);
    const highPort = 16000;

    setPortForTicket(ticketId, highPort);

    // Next allocated port should be above highPort
    const nextTicket = track(`PORT-AFTER-HIGH-${Date.now()}`);
    const nextPort = getPortForTicket(nextTicket);

    expect(nextPort).toBeGreaterThan(highPort);
  });

  it("should not update nextPort when setting a lower port", () => {
    const ticketId1 = track(`PORT-FIRST-${Date.now()}`);
    const firstPort = getPortForTicket(ticketId1);

    const ticketId2 = track(`PORT-LOW-${Date.now()}`);
    // Set a port lower than current nextPort
    setPortForTicket(ticketId2, 14100);

    // Next allocated port should continue from where it was
    const ticketId3 = track(`PORT-NEXT-${Date.now()}`);
    const nextPort = getPortForTicket(ticketId3);

    expect(nextPort).toBeGreaterThan(firstPort);
  });

  it("should release a port", () => {
    const ticketId = track(`PORT-RELEASE-${Date.now()}`);
    getPortForTicket(ticketId);

    releasePort(ticketId);

    const allPorts = getAllocatedPorts();
    expect(allPorts.has(ticketId)).toBe(false);
  });

  it("should get all allocated ports", () => {
    const ticket1 = track(`PORT-GET-A-${Date.now()}`);
    const ticket2 = track(`PORT-GET-B-${Date.now()}`);

    const port1 = getPortForTicket(ticket1);
    const port2 = getPortForTicket(ticket2);

    const allPorts = getAllocatedPorts();

    expect(allPorts.get(ticket1)).toBe(port1);
    expect(allPorts.get(ticket2)).toBe(port2);
  });

  it("should return a copy of the port map", () => {
    const ticketId = track(`PORT-COPY-${Date.now()}`);
    getPortForTicket(ticketId);

    const allPorts = getAllocatedPorts();
    allPorts.delete(ticketId);

    // Original should still have the ticket
    const allPorts2 = getAllocatedPorts();
    expect(allPorts2.has(ticketId)).toBe(true);
  });

  it("should allocate sequentially increasing ports", () => {
    const ticket1 = track(`PORT-SEQ-1-${Date.now()}`);
    const ticket2 = track(`PORT-SEQ-2-${Date.now()}`);

    const port1 = getPortForTicket(ticket1);
    const port2 = getPortForTicket(ticket2);

    expect(port2).toBe(port1 + 1);
  });

  it("should handle releasing non-existent ticket gracefully", () => {
    expect(() => {
      releasePort("non-existent-ticket");
    }).not.toThrow();
  });
});
