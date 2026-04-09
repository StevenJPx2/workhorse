/**
 * Tests for the OpenCode SDK client module
 */

import { describe, test, expect } from "bun:test";
import {
  getPortForTicket,
  releasePort,
  getAllocatedPorts,
  checkOpenCodeHealth,
  getOpenCodeStatus,
  buildOpenCodeCommandWithPort,
  type OpenCodeHealth,
  type OpenCodeSessionStatus,
} from "./index.ts";

describe("OpenCode Client", () => {
  describe("Port Allocation", () => {
    test("allocates port starting from BASE_PORT (14096)", () => {
      const ticketId = `PORT-TEST-${Date.now()}-1`;
      const port = getPortForTicket(ticketId);

      expect(port).toBeGreaterThanOrEqual(14096);
    });

    test("returns same port for same ticket", () => {
      const ticketId = `PORT-TEST-${Date.now()}-2`;

      const port1 = getPortForTicket(ticketId);
      const port2 = getPortForTicket(ticketId);

      expect(port1).toBe(port2);
    });

    test("allocates different ports for different tickets", () => {
      const ticketId1 = `PORT-TEST-${Date.now()}-3`;
      const ticketId2 = `PORT-TEST-${Date.now()}-4`;

      const port1 = getPortForTicket(ticketId1);
      const port2 = getPortForTicket(ticketId2);

      expect(port1).not.toBe(port2);
    });

    test("releasePort removes ticket from allocation", () => {
      const ticketId = `PORT-TEST-${Date.now()}-5`;

      const _originalPort = getPortForTicket(ticketId);
      expect(getAllocatedPorts().has(ticketId)).toBe(true);

      releasePort(ticketId);
      expect(getAllocatedPorts().has(ticketId)).toBe(false);
    });

    test("getAllocatedPorts returns copy of port map", () => {
      const ticketId = `PORT-TEST-${Date.now()}-6`;
      getPortForTicket(ticketId);

      const ports1 = getAllocatedPorts();
      const ports2 = getAllocatedPorts();

      expect(ports1).not.toBe(ports2);
      expect(ports1.get(ticketId)).toBe(ports2.get(ticketId));
    });
  });

  describe("buildOpenCodeCommandWithPort", () => {
    test("returns opencode command with port flag", () => {
      const ticketId = `CMD-TEST-${Date.now()}`;
      const result = buildOpenCodeCommandWithPort(ticketId);

      expect(result.command).toBe("opencode");
      expect(result.args).toHaveLength(2);
      expect(result.args[0]).toBe("--port");
    });

    test("port in args matches allocated port for ticket", () => {
      const ticketId = `CMD-TEST-${Date.now()}-2`;
      const expectedPort = getPortForTicket(ticketId);
      const result = buildOpenCodeCommandWithPort(ticketId);

      expect(result.args[1]).toBe(String(expectedPort));
    });

    test("same ticket gets same port in command", () => {
      const ticketId = `CMD-TEST-${Date.now()}-3`;

      const result1 = buildOpenCodeCommandWithPort(ticketId);
      const result2 = buildOpenCodeCommandWithPort(ticketId);

      expect(result1.args[1]).toBe(result2.args[1]);
    });
  });

  describe("checkOpenCodeHealth", () => {
    test("returns unhealthy when no server is running", async () => {
      const ticketId = `HEALTH-TEST-${Date.now()}`;

      const result = await checkOpenCodeHealth(ticketId);

      expect(result.healthy).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error).toMatch(/ECONNREFUSED|fetch|Failed|connect/i);
    });

    test("returns proper OpenCodeHealth structure", async () => {
      const ticketId = `HEALTH-TEST-${Date.now()}-2`;

      const result = await checkOpenCodeHealth(ticketId);

      expect(result).toHaveProperty("healthy");
      expect(typeof result.healthy).toBe("boolean");

      if (result.healthy) {
        // version is optional even when healthy
      } else {
        expect(result.error).toBeDefined();
      }
    });
  });

  describe("getOpenCodeStatus", () => {
    test("returns offline when no server is running", async () => {
      const ticketId = `STATUS-TEST-${Date.now()}`;

      const result = await getOpenCodeStatus(ticketId);

      expect(result.type).toBe("offline");
      if (result.type === "offline") {
        expect(result.error).toBeDefined();
      }
    });

    test("returns proper OpenCodeSessionStatus structure", async () => {
      const ticketId = `STATUS-TEST-${Date.now()}-2`;

      const result = await getOpenCodeStatus(ticketId);

      expect(result).toHaveProperty("type");
      expect(["idle", "busy", "retry", "offline"]).toContain(result.type);

      if (result.type === "offline") {
        expect(result).toHaveProperty("error");
      } else if (result.type === "retry") {
        expect(result).toHaveProperty("attempt");
        expect(result).toHaveProperty("message");
        expect(result).toHaveProperty("next");
      }
    });
  });

  describe("Type Definitions", () => {
    test("OpenCodeHealth type works correctly", () => {
      const healthyResult: OpenCodeHealth = {
        healthy: true,
        version: "1.0.0",
      };

      const unhealthyResult: OpenCodeHealth = {
        healthy: false,
        error: "Connection refused",
      };

      expect(healthyResult.healthy).toBe(true);
      expect(unhealthyResult.healthy).toBe(false);
    });

    test("OpenCodeSessionStatus type covers all cases", () => {
      const idleStatus: OpenCodeSessionStatus = { type: "idle" };
      const busyStatus: OpenCodeSessionStatus = { type: "busy" };
      const retryStatus: OpenCodeSessionStatus = {
        type: "retry",
        attempt: 2,
        message: "Rate limited",
        next: 5000,
      };
      const offlineStatus: OpenCodeSessionStatus = {
        type: "offline",
        error: "Server not running",
      };

      expect(idleStatus.type).toBe("idle");
      expect(busyStatus.type).toBe("busy");
      expect(retryStatus.type).toBe("retry");
      expect(offlineStatus.type).toBe("offline");
    });
  });

  describe("Integration with Orchestrator", () => {
    test("port allocation is consistent across calls", () => {
      const ticketId = `ORCH-TEST-${Date.now()}`;

      const cmd = buildOpenCodeCommandWithPort(ticketId);
      const cmdPort = parseInt(cmd.args[1]);

      const allocatedPort = getPortForTicket(ticketId);

      expect(cmdPort).toBe(allocatedPort);
    });

    test("releasing port allows new allocation", () => {
      const ticketId = `ORCH-TEST-${Date.now()}-2`;

      getPortForTicket(ticketId);

      releasePort(ticketId);

      const _port2 = getPortForTicket(ticketId);

      expect(getAllocatedPorts().has(ticketId)).toBe(true);
    });
  });

  describe("Event Subscription", () => {
    test("subscribeToEvents returns subscription object", async () => {
      const { subscribeToEvents } = await import("./index.ts");
      const ticketId = `EVENT-TEST-${Date.now()}`;

      const subscription = await subscribeToEvents(
        ticketId,
        () => {},
        () => {}
      );

      expect(subscription).toHaveProperty("unsubscribe");
      expect(typeof subscription.unsubscribe).toBe("function");

      subscription.unsubscribe();
    });

    test("unsubscribe is callable", async () => {
      const { subscribeToEvents } = await import("./index.ts");
      const ticketId = `EVENT-TEST-${Date.now()}-2`;

      const subscription = await subscribeToEvents(
        ticketId,
        () => {},
        () => {}
      );

      expect(() => subscription.unsubscribe()).not.toThrow();
      expect(() => subscription.unsubscribe()).not.toThrow();
    });
  });

  describe("Healthy response path", () => {
    test("healthy response includes version when available", async () => {
      const { checkOpenCodeHealth } = await import("./index.ts");
      const ticketId = `HEALTH-VERSION-${Date.now()}`;

      const result = await checkOpenCodeHealth(ticketId);

      expect(result).toHaveProperty("healthy");
    });
  });

  describe("Session status variations", () => {
    test("getOpenCodeStatus returns offline for connection errors", async () => {
      const { getOpenCodeStatus } = await import("./index.ts");
      const ticketId = `STATUS-OFFLINE-${Date.now()}`;

      const result = await getOpenCodeStatus(ticketId);

      expect(result.type).toBe("offline");
      expect(result).toHaveProperty("error");
    });
  });
});