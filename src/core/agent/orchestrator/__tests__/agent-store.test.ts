/**
 * Tests for agent-store module
 */

import { describe, it, expect, beforeEach } from "bun:test";
import {
  activeAgents,
  createAgentInstance,
  updateAgentState,
  getAgent,
  getAllAgents,
  getAgentsByState,
} from "./agent-store.ts";

describe("agent-store", () => {
  // Clean up between tests
  beforeEach(() => {
    // Clear all active agents
    activeAgents.clear();
  });

  describe("createAgentInstance", () => {
    it("should create agent instance with default values", () => {
      const agent = createAgentInstance("TEST-123", "opencode");

      expect(agent.ticketId).toBe("TEST-123");
      expect(agent.agentType).toBe("opencode");
      expect(agent.state).toBe("idle");
      expect(agent.session).toBeNull();
      expect(agent.worktree).toBeNull();
      expect(agent.startedAt).toBeNull();
      expect(agent.stoppedAt).toBeNull();
      expect(agent.lastHealthCheck).toBeNull();
    });

    it("should create claude agent instance", () => {
      const agent = createAgentInstance("TEST-456", "claude");

      expect(agent.ticketId).toBe("TEST-456");
      expect(agent.agentType).toBe("claude");
    });
  });

  describe("updateAgentState", () => {
    it("should update agent state", () => {
      const agent = createAgentInstance("TEST-123", "opencode");
      activeAgents.set("TEST-123", agent);

      updateAgentState("TEST-123", "running");

      expect(agent.state).toBe("running");
    });

    it("should set startedAt when state is running", () => {
      const agent = createAgentInstance("TEST-123", "opencode");
      activeAgents.set("TEST-123", agent);

      updateAgentState("TEST-123", "running");

      expect(agent.startedAt).toBeTruthy();
      expect(() => new Date(agent.startedAt!)).not.toThrow();
    });

    it("should set stoppedAt when state is stopped", () => {
      const agent = createAgentInstance("TEST-123", "opencode");
      activeAgents.set("TEST-123", agent);

      updateAgentState("TEST-123", "stopped");

      expect(agent.stoppedAt).toBeTruthy();
    });

    it("should set stoppedAt when state is crashed", () => {
      const agent = createAgentInstance("TEST-123", "opencode");
      activeAgents.set("TEST-123", agent);

      updateAgentState("TEST-123", "crashed");

      expect(agent.stoppedAt).toBeTruthy();
      expect(agent.state).toBe("crashed");
    });

    it("should not set timestamps for idle state", () => {
      const agent = createAgentInstance("TEST-123", "opencode");
      activeAgents.set("TEST-123", agent);

      updateAgentState("TEST-123", "idle");

      expect(agent.startedAt).toBeNull();
      expect(agent.stoppedAt).toBeNull();
    });

    it("should do nothing if agent not found", () => {
      // Should not throw
      expect(() => updateAgentState("NON-EXISTENT", "running")).not.toThrow();
    });
  });

  describe("getAgent", () => {
    it("should return agent when found", () => {
      const agent = createAgentInstance("TEST-123", "opencode");
      activeAgents.set("TEST-123", agent);

      const found = getAgent("TEST-123");

      expect(found).toBe(agent);
    });

    it("should return undefined when not found", () => {
      const found = getAgent("NON-EXISTENT");

      expect(found).toBeUndefined();
    });
  });

  describe("getAllAgents", () => {
    it("should return all active agents", () => {
      activeAgents.set("A", createAgentInstance("A", "opencode"));
      activeAgents.set("B", createAgentInstance("B", "claude"));

      const agents = getAllAgents();

      expect(agents).toHaveLength(2);
      expect(agents.map((a) => a.ticketId)).toContain("A");
      expect(agents.map((a) => a.ticketId)).toContain("B");
    });

    it("should return empty array when no agents", () => {
      expect(getAllAgents()).toEqual([]);
    });
  });

  describe("getAgentsByState", () => {
    it("should filter agents by state", () => {
      const a = createAgentInstance("A", "opencode");
      a.state = "running";
      const b = createAgentInstance("B", "opencode");
      b.state = "stopped";
      const c = createAgentInstance("C", "opencode");
      c.state = "running";

      activeAgents.set("A", a);
      activeAgents.set("B", b);
      activeAgents.set("C", c);

      const running = getAgentsByState("running");
      expect(running).toHaveLength(2);
      expect(running.map((a) => a.ticketId)).toContain("A");
      expect(running.map((a) => a.ticketId)).toContain("C");

      const stopped = getAgentsByState("stopped");
      expect(stopped).toHaveLength(1);
      expect(stopped[0].ticketId).toBe("B");
    });

    it("should return empty array when no matching agents", () => {
      activeAgents.set("A", createAgentInstance("A", "opencode"));

      expect(getAgentsByState("crashed")).toEqual([]);
    });
  });
});
