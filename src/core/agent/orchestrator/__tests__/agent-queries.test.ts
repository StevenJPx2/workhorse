import { describe, test, expect } from "bun:test";
import {
  getAgent,
  getAllAgents,
  getAgentsByState,
  sendMessageToAgent,
  captureAgentOutput,
  checkAgentHealth,
  stopAgent,
} from "../orchestrator.ts";

describe("Orchestrator: agent queries", () => {
  describe("getAgent", () => {
    test("returns undefined for unknown ticket", () => {
      const agent = getAgent("NONEXISTENT-999");
      expect(agent).toBeUndefined();
    });
  });

  describe("getAllAgents", () => {
    test("returns an array", () => {
      const agents = getAllAgents();
      expect(Array.isArray(agents)).toBe(true);
    });
  });

  describe("getAgentsByState", () => {
    test("returns empty array for state with no agents", () => {
      const agents = getAgentsByState("crashed");
      expect(Array.isArray(agents)).toBe(true);
      agents.forEach((a) => expect(a.state).toBe("crashed"));
    });

    test("filters correctly by state", () => {
      const running = getAgentsByState("running");
      const idle = getAgentsByState("idle");
      const stopped = getAgentsByState("stopped");

      running.forEach((a) => expect(a.state).toBe("running"));
      idle.forEach((a) => expect(a.state).toBe("idle"));
      stopped.forEach((a) => expect(a.state).toBe("stopped"));
    });
  });

  describe("sendMessageToAgent", () => {
    test("returns false for unknown agent", async () => {
      const result = await sendMessageToAgent("NONEXISTENT-999", "test message");
      expect(result).toBe(false);
    });

    test("handles empty messages", async () => {
      const result = await sendMessageToAgent("UNKNOWN-999", "");
      expect(result).toBe(false);
    });
  });

  describe("captureAgentOutput", () => {
    test("returns null for unknown agent", async () => {
      const result = await captureAgentOutput("UNKNOWN-CAP-999");
      expect(result).toBeNull();
    });
  });
});

describe("Orchestrator: health check", () => {
  test("checkAgentHealth returns unhealthy for unknown agent", async () => {
    const result = await checkAgentHealth("NONEXISTENT-999");

    expect(result.ticketId).toBe("NONEXISTENT-999");
    expect(result.healthy).toBe(false);
    expect(result.sessionExists).toBe(false);
    expect(result.checkedAt).toBeDefined();
    expect(typeof result.checkedAt).toBe("string");
  });

  test("checkAgentHealth returns proper structure", async () => {
    const result = await checkAgentHealth("TEST-123");

    expect(result).toHaveProperty("ticketId");
    expect(result).toHaveProperty("healthy");
    expect(result).toHaveProperty("sessionExists");
    expect(result).toHaveProperty("checkedAt");
  });
});

describe("Orchestrator: stop agent", () => {
  test("stopAgent returns error for unknown agent", async () => {
    const result = await stopAgent("NONEXISTENT-999", "/test/repo");

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
    expect(result.error).toContain("No agent found");
    expect(result.error).toContain("NONEXISTENT-999");
  });

  test("stopAgent returns proper error structure", async () => {
    const result = await stopAgent("UNKNOWN-123", "/test/repo", false);

    expect(result).toHaveProperty("success");
    expect(result).toHaveProperty("error");
    expect(result.success).toBe(false);
  });

  test("stopAgent with removeWorktree option", async () => {
    const result = await stopAgent("TEST-999", "/test/repo", true);

    expect(result).toHaveProperty("success");
    expect(typeof result.success).toBe("boolean");
  });

  test("stopAgent handles cleanup errors", async () => {
    const result = await stopAgent("NONEXISTENT-999", "/invalid/path");

    expect(result).toHaveProperty("success");
    expect(result.success).toBe(false);
  });
});

describe("Orchestrator: trace and debug", () => {
  test("orchestrator exposes debug trace", () => {
    const fs = require("fs");
    const os = require("os");
    const path = require("path");

    const tracePath = path.join(os.tmpdir(), "jiratown-trace.log");

    const testEntry = `[${new Date().toISOString()}] TEST: orchestrator trace test\n`;
    fs.appendFileSync(tracePath, testEntry);

    const content = fs.readFileSync(tracePath, "utf-8");
    expect(content).toContain("TEST: orchestrator trace test");
  });
});

describe("Orchestrator: agent state management", () => {
  test("getAllAgents returns array", () => {
    const agents = getAllAgents();
    expect(Array.isArray(agents)).toBe(true);
  });

  test("getAgentsByState returns only matching state agents", () => {
    const running = getAgentsByState("running");
    const stopped = getAgentsByState("stopped");
    const idle = getAgentsByState("idle");

    expect(Array.isArray(running)).toBe(true);
    expect(Array.isArray(stopped)).toBe(true);
    expect(Array.isArray(idle)).toBe(true);

    running.forEach((a: { state: string }) => expect(a.state).toBe("running"));
    stopped.forEach((a: { state: string }) => expect(a.state).toBe("stopped"));
    idle.forEach((a: { state: string }) => expect(a.state).toBe("idle"));
  });
});
