/**
 * Tests for list-tools tool definition.
 *
 * @module plugins/builtin/tools/__tests__/list-tools.test
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { HarnessOrchestrator } from "#workflow";

import { createListToolsTool } from "../definitions/list-tools";

describe("createListToolsTool", () => {
  let mockOrchestrator: HarnessOrchestrator;
  let mockDb: {
    issues: {
      getByExternalId: ReturnType<typeof vi.fn>;
    };
  };

  beforeEach(() => {
    mockDb = {
      issues: {
        getByExternalId: vi.fn(),
      },
    };

    mockOrchestrator = {
      getTools: vi.fn().mockReturnValue([
        {
          name: "Read",
          description: "Read a file",
          schema: { type: "object" },
          // No status restriction - always available
        },
        {
          name: "Write",
          description: "Write to a file",
          schema: { type: "object" },
          status: ["implementing", "in_review"], // Restricted
        },
        {
          name: "Edit",
          description: "Edit a file",
          schema: { type: "object" },
          status: ["implementing", "in_review"], // Restricted
        },
        {
          name: "Bash",
          description: "Run a bash command",
          schema: { type: "object" },
          status: ["implementing", "in_review"], // Restricted
        },
        {
          name: "jira_tool",
          description: "Jira-specific tool",
          schema: { type: "object" },
          sources: ["jira"], // Source-restricted
        },
      ]),
    } as unknown as HarnessOrchestrator;
  });

  describe("status filtering", () => {
    it("shows all tools when status is implementing", async () => {
      mockDb.issues.getByExternalId.mockResolvedValue({
        status: "implementing",
        source: "github",
      });

      const tool = createListToolsTool(mockOrchestrator);
      const result = await tool.execute(
        {},
        {
          issueId: "TEST-123",
          source: "github",
          worktreePath: "/tmp/test",
          db: mockDb as any,
          hooks: {} as any,
          memory: {} as any,
        },
      );

      expect(result.success).toBe(true);
      expect(result.output).toContain("### Read");
      expect(result.output).toContain("### Write");
      expect(result.output).toContain("### Edit");
      expect(result.output).toContain("### Bash");
      expect(result.output).not.toContain("Blocked Tools");
    });

    it("shows blocked tools when status is planning", async () => {
      mockDb.issues.getByExternalId.mockResolvedValue({
        status: "planning",
        source: "github",
      });

      const tool = createListToolsTool(mockOrchestrator);
      const result = await tool.execute(
        {},
        {
          issueId: "TEST-123",
          source: "github",
          worktreePath: "/tmp/test",
          db: mockDb as any,
          hooks: {} as any,
          memory: {} as any,
        },
      );

      expect(result.success).toBe(true);
      // Read is available
      expect(result.output).toContain("### Read");
      // Write/Edit/Bash are blocked
      expect(result.output).toContain("Blocked Tools");
      expect(result.output).toContain("**Write**");
      expect(result.output).toContain("**Edit**");
      expect(result.output).toContain("**Bash**");
      expect(result.output).toContain("implementing, in_review");
    });

    it("filters tools by source", async () => {
      mockDb.issues.getByExternalId.mockResolvedValue({
        status: "implementing",
        source: "github", // Not jira
      });

      const tool = createListToolsTool(mockOrchestrator);
      const result = await tool.execute(
        {},
        {
          issueId: "TEST-123",
          source: "github",
          worktreePath: "/tmp/test",
          db: mockDb as any,
          hooks: {} as any,
          memory: {} as any,
        },
      );

      expect(result.success).toBe(true);
      // jira_tool should not be listed (source mismatch)
      expect(result.output).not.toContain("jira_tool");
    });

    it("includes source-specific tools when source matches", async () => {
      mockDb.issues.getByExternalId.mockResolvedValue({
        status: "implementing",
        source: "jira",
      });

      const tool = createListToolsTool(mockOrchestrator);
      const result = await tool.execute(
        {},
        {
          issueId: "TEST-123",
          source: "jira",
          worktreePath: "/tmp/test",
          db: mockDb as any,
          hooks: {} as any,
          memory: {} as any,
        },
      );

      expect(result.success).toBe(true);
      expect(result.output).toContain("jira_tool");
    });
  });

  describe("source parameter in getByExternalId", () => {
    it("passes source to getByExternalId for correct lookup", async () => {
      mockDb.issues.getByExternalId.mockResolvedValue({
        status: "implementing",
        source: "github",
      });

      const tool = createListToolsTool(mockOrchestrator);
      await tool.execute(
        {},
        {
          issueId: "TEST-123",
          source: "github",
          worktreePath: "/tmp/test",
          db: mockDb as any,
          hooks: {} as any,
          memory: {} as any,
        },
      );

      // Verify source is passed to avoid ambiguous lookup
      expect(mockDb.issues.getByExternalId).toHaveBeenCalledWith(
        "TEST-123",
        "github",
      );
    });
  });

  describe("error handling", () => {
    it("returns error when issue not found", async () => {
      mockDb.issues.getByExternalId.mockResolvedValue(null);

      const tool = createListToolsTool(mockOrchestrator);
      const result = await tool.execute(
        {},
        {
          issueId: "NONEXISTENT",
          source: "github",
          worktreePath: "/tmp/test",
          db: mockDb as any,
          hooks: {} as any,
          memory: {} as any,
        },
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe("Issue not found");
    });
  });

  describe("includeSchema option", () => {
    it("includes JSON schema when requested", async () => {
      mockDb.issues.getByExternalId.mockResolvedValue({
        status: "implementing",
        source: "github",
      });

      const tool = createListToolsTool(mockOrchestrator);
      const result = await tool.execute(
        { includeSchema: true },
        {
          issueId: "TEST-123",
          source: "github",
          worktreePath: "/tmp/test",
          db: mockDb as any,
          hooks: {} as any,
          memory: {} as any,
        },
      );

      expect(result.success).toBe(true);
      expect(result.output).toContain("```json");
      expect(result.output).toContain('"type": "object"');
    });
  });
});
