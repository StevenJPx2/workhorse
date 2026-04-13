/**
 * Tests for get-agent-status - verifies SDK connection to agent's port
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { getAgentStatus, clearSessionCache, clearAllSessionCache } from "./get-agent-status.ts";
import {
  getPortForTicket,
  releasePort,
} from "../../harness/orchestrator/opencode-client/port-manager.ts";

// Test ticket IDs
const TEST_TICKET_1 = "TEST-SDK-001";
const TEST_TICKET_2 = "TEST-SDK-002";

describe("get-agent-status", () => {
  beforeEach(() => {
    // Clear all caches before each test
    clearAllSessionCache();
    // Release any allocated ports
    releasePort(TEST_TICKET_1);
    releasePort(TEST_TICKET_2);
  });

  afterEach(() => {
    clearAllSessionCache();
    releasePort(TEST_TICKET_1);
    releasePort(TEST_TICKET_2);
  });

  describe("port allocation", () => {
    test("uses ticket-specific port, not default 4096", () => {
      const port1 = getPortForTicket(TEST_TICKET_1);
      const port2 = getPortForTicket(TEST_TICKET_2);

      // Ports should be >= 14100 (not 4096)
      expect(port1).toBeGreaterThanOrEqual(14100);
      expect(port2).toBeGreaterThanOrEqual(14100);
      expect(port1).not.toBe(4096);
      expect(port2).not.toBe(4096);
    });

    test("same ticket gets same port", () => {
      const port1 = getPortForTicket(TEST_TICKET_1);
      const port2 = getPortForTicket(TEST_TICKET_1);

      expect(port1).toBe(port2);
    });

    test("different tickets get different ports", () => {
      const port1 = getPortForTicket(TEST_TICKET_1);
      const port2 = getPortForTicket(TEST_TICKET_2);

      expect(port1).not.toBe(port2);
    });
  });

  describe("getAgentStatus", () => {
    test("returns empty array when ticketId is missing", async () => {
      const result = await getAgentStatus("", "/some/path");
      expect(result).toEqual([]);
    });

    test("returns empty array when worktreePath is missing", async () => {
      const result = await getAgentStatus(TEST_TICKET_1, "");
      expect(result).toEqual([]);
    });

    test("returns empty array when agent not running (connection fails)", async () => {
      // This should fail gracefully since no agent is running on this port
      const result = await getAgentStatus(TEST_TICKET_1, "/nonexistent/path");
      expect(result).toEqual([]);
    });
  });

  describe("cache management", () => {
    test("clearSessionCache clears cache for specific ticket", () => {
      // Allocate ports first
      getPortForTicket(TEST_TICKET_1);
      getPortForTicket(TEST_TICKET_2);

      // Clear only one
      clearSessionCache(TEST_TICKET_1);

      // Should not throw - just verifies the function works
      expect(() => clearSessionCache(TEST_TICKET_1)).not.toThrow();
    });

    test("clearAllSessionCache clears all caches", () => {
      // Allocate ports
      getPortForTicket(TEST_TICKET_1);
      getPortForTicket(TEST_TICKET_2);

      // Clear all
      clearAllSessionCache();

      // Should not throw
      expect(() => clearAllSessionCache()).not.toThrow();
    });
  });
});

describe("integration: live agent connection", () => {
  // This test only runs if there's actually an agent running
  // It's skipped in normal CI but useful for local development

  test.skipIf(!process.env.TEST_LIVE_AGENT)(
    "connects to running agent and fetches status",
    async () => {
      const ticketId = process.env.TEST_TICKET_ID || "ADEPT-37632";
      const worktreePath =
        process.env.TEST_WORKTREE_PATH ||
        `/Users/stevenjohn/Documents/Projects/jiratown-worktrees/${ticketId}`;

      const port = getPortForTicket(ticketId);
      console.log(`Testing connection to agent on port ${port}`);

      const result = await getAgentStatus(ticketId, worktreePath);

      // Should return steps (may be empty if agent just started)
      expect(Array.isArray(result)).toBe(true);

      if (result.length > 0) {
        console.log(`Got ${result.length} steps from agent`);
        expect(result[0]).toHaveProperty("description");
        expect(result[0]).toHaveProperty("type");
        expect(result[0]).toHaveProperty("timestamp");
      }
    },
  );
});
