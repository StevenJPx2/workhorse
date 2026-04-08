/**
 * Tests for the orchestrator module
 */

import { describe, test, expect } from "bun:test";
import {
  generateMcpConfig,
  getConfigPath,
  buildAgentCommand,
} from "./mcp-config.ts";
import {
  generateSystemPrompt,
  generateInitialPrompt,
} from "./system-prompt.ts";
import {
  getAgent,
  getAllAgents,
  getAgentsByState,
  sendMessageToAgent,
  captureAgentOutput,
  checkAgentHealth,
  stopAgent,
} from "./orchestrator.ts";
import type { AgentSystemInstruction } from "./types.ts";

describe("MCP Config", () => {
  describe("generateMcpConfig", () => {
    test("generates OpenCode config with jiratown MCP server", () => {
      const config = generateMcpConfig("AM-123");

      expect(config.$schema).toBe("https://opencode.ai/config.json");
      expect(config.mcp?.jiratown).toBeDefined();
      expect(config.mcp?.jiratown.type).toBe("local");
      expect(config.mcp?.jiratown.command).toContain("bun");
      expect(config.mcp?.jiratown.command).toContain("--ticket");
      expect(config.mcp?.jiratown.command).toContain("AM-123");
      expect(config.mcp?.jiratown.enabled).toBe(true);
    });

    test("includes atlassian MCP when cloudId provided", () => {
      const config = generateMcpConfig("AM-123", "company.atlassian.net");

      expect(config.mcp?.atlassian).toBeDefined();
      expect(config.mcp?.atlassian?.type).toBe("remote");
      expect(config.mcp?.atlassian?.url).toBe("https://mcp.atlassian.com/v1/mcp");
    });

    test("excludes atlassian MCP when cloudId not provided", () => {
      const config = generateMcpConfig("AM-123");

      expect(config.mcp?.atlassian).toBeUndefined();
    });

    test("sets ticket ID in environment", () => {
      const config = generateMcpConfig("AM-456");

      expect(config.mcp?.jiratown.environment?.JIRATOWN_TICKET_ID).toBe("AM-456");
    });
  });

  describe("getConfigPath", () => {
    test("creates path in .opencode directory", () => {
      const path = getConfigPath("/path/to/worktree", "AM-123");

      expect(path).toContain("/path/to/worktree/");
      expect(path).toContain(".opencode");
      expect(path).toEndWith("opencode.json");
    });

    test("uses same path regardless of ticket ID (per-project config)", () => {
      const path1 = getConfigPath("/path/to/worktree", "AM-123");
      const path2 = getConfigPath("/path/to/worktree", "AM-456");

      // Both should be the same since OpenCode uses per-project config
      expect(path1).toBe(path2);
    });
  });

  describe("buildAgentCommand", () => {
    test("builds opencode command without extra args", () => {
      const result = buildAgentCommand("opencode", "/path/to/config.json");

      expect(result.command).toBe("opencode");
      // OpenCode finds .opencode/opencode.json automatically, no flags needed
      expect(result.args).toEqual([]);
    });

    test("builds claude command", () => {
      const result = buildAgentCommand("claude", "/path/to/config.json");

      expect(result.command).toBe("claude");
      expect(result.args).toEqual([]);
    });
  });
});

describe("System Prompt", () => {
  const baseInfo: AgentSystemInstruction = {
    ticketId: "AM-123",
    jiraKey: "AM-123",
    summary: "Fix authentication bug",
    description: "Users are getting logged out unexpectedly",
    worktreePath: "/code/repo-worktrees/AM-123",
    branchName: "fix/AM-123",
  };

  describe("generateSystemPrompt", () => {
    test("includes ticket key", () => {
      const prompt = generateSystemPrompt(baseInfo);

      expect(prompt).toContain("AM-123");
    });

    test("includes summary when provided", () => {
      const prompt = generateSystemPrompt(baseInfo);

      expect(prompt).toContain("Fix authentication bug");
    });

    test("includes description when provided", () => {
      const prompt = generateSystemPrompt(baseInfo);

      expect(prompt).toContain("Users are getting logged out unexpectedly");
    });

    test("includes working environment", () => {
      const prompt = generateSystemPrompt(baseInfo);

      expect(prompt).toContain("Worktree:");
      expect(prompt).toContain("/code/repo-worktrees/AM-123");
      expect(prompt).toContain("Branch:");
      expect(prompt).toContain("fix/AM-123");
    });

    test("includes jiratown tool instructions", () => {
      const prompt = generateSystemPrompt(baseInfo);

      expect(prompt).toContain("jiratown_get_notifications");
      expect(prompt).toContain("jiratown_update_status");
      expect(prompt).toContain("jiratown_escalate");
      expect(prompt).toContain("jiratown_acknowledge");
    });

    test("handles null summary", () => {
      const info = { ...baseInfo, summary: null };
      const prompt = generateSystemPrompt(info);

      expect(prompt).not.toContain("**Summary:**");
    });

    test("handles null description", () => {
      const info = { ...baseInfo, description: null };
      const prompt = generateSystemPrompt(info);

      expect(prompt).not.toContain("**Description:**");
    });
  });

  describe("generateInitialPrompt", () => {
    test("starts with ticket command", () => {
      const prompt = generateInitialPrompt(baseInfo);

      expect(prompt).toContain("/ticket AM-123");
    });

    test("includes summary", () => {
      const prompt = generateInitialPrompt(baseInfo);

      expect(prompt).toContain("Summary: Fix authentication bug");
    });

    test("includes description", () => {
      const prompt = generateInitialPrompt(baseInfo);

      expect(prompt).toContain("Description:");
      expect(prompt).toContain("Users are getting logged out unexpectedly");
    });

    test("instructs to call get_notifications", () => {
      const prompt = generateInitialPrompt(baseInfo);

      expect(prompt).toContain("jiratown_get_notifications");
      expect(prompt).toContain("planning");
    });

    test("handles null summary", () => {
      const info = { ...baseInfo, summary: null };
      const prompt = generateInitialPrompt(info);

      expect(prompt).not.toContain("Summary:");
    });
  });
});

describe("Orchestrator Functions", () => {
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
      // Use a unique state that won't have agents
      const agents = getAgentsByState("crashed");
      expect(Array.isArray(agents)).toBe(true);
      // All returned agents should have the correct state
      agents.forEach((a) => expect(a.state).toBe("crashed"));
    });

    test("filters correctly by state", () => {
      const running = getAgentsByState("running");
      const idle = getAgentsByState("idle");
      const stopped = getAgentsByState("stopped");

      // Each array should only contain agents with matching state
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
  });

  describe("captureAgentOutput", () => {
    test("returns null for unknown agent", async () => {
      const result = await captureAgentOutput("NONEXISTENT-999");
      expect(result).toBeNull();
    });
  });

  describe("checkAgentHealth", () => {
    test("returns unhealthy for unknown agent", async () => {
      const result = await checkAgentHealth("NONEXISTENT-999");

      expect(result.ticketId).toBe("NONEXISTENT-999");
      expect(result.healthy).toBe(false);
      expect(result.sessionExists).toBe(false);
      expect(result.checkedAt).toBeDefined();
      expect(typeof result.checkedAt).toBe("string");
    });

    test("returns proper structure", async () => {
      const result = await checkAgentHealth("TEST-123");

      expect(result).toHaveProperty("ticketId");
      expect(result).toHaveProperty("healthy");
      expect(result).toHaveProperty("sessionExists");
      expect(result).toHaveProperty("checkedAt");
    });
  });

  describe("stopAgent", () => {
    test("returns error for unknown agent", async () => {
      const result = await stopAgent("NONEXISTENT-999", "/test/repo");

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error).toContain("No agent found");
      expect(result.error).toContain("NONEXISTENT-999");
    });

    test("returns proper error structure", async () => {
      const result = await stopAgent("UNKNOWN-123", "/test/repo", false);

      expect(result).toHaveProperty("success");
      expect(result).toHaveProperty("error");
      expect(result.success).toBe(false);
    });
  });
});
