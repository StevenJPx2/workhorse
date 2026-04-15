import { describe, test, expect } from "bun:test";
import { generateMcpConfig, buildAgentCommand } from "../mcp-config.ts";

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

    test("ticket ID is passed as --ticket CLI arg, not duplicated in environment", () => {
      const config = generateMcpConfig("AM-456");

      expect(config.mcp?.jiratown.command).toContain("AM-456");
      expect(config.mcp?.jiratown.environment?.JIRATOWN_TICKET_ID).toBeUndefined();
    });
  });

  describe("buildAgentCommand", () => {
    test("builds opencode command with port for SDK communication", () => {
      const result = buildAgentCommand("opencode", "TEST-123");

      expect(result.command).toBe("opencode");
      expect(result.args.length).toBe(2);
      expect(result.args[0]).toBe("--port");
      expect(parseInt(result.args[1])).toBeGreaterThanOrEqual(14100);
    });

    test("builds claude command without extra args", () => {
      const result = buildAgentCommand("claude", "TEST-456");

      expect(result.command).toBe("claude");
      expect(result.args).toEqual([]);
    });
  });
});
