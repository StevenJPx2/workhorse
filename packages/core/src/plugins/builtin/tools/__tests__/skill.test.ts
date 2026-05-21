import { describe, expect, it, beforeEach, vi } from "vitest";

import type { HarnessOrchestrator, ResolvedSkill, ToolExecutionContext } from "#workflow";

import { createLoadSkillTool } from "../skill.ts";

describe("load_skill tool", () => {
  let mockOrchestrator: Partial<HarnessOrchestrator>;
  let mockSkills: Map<string, ResolvedSkill>;
  let mockContext: ToolExecutionContext;

  beforeEach(() => {
    mockSkills = new Map();

    mockOrchestrator = {
      skillRegistry: {
        getSkill: vi.fn((id: string) => mockSkills.get(id)),
        getSkillByName: vi.fn((name: string) => {
          // First try exact match
          if (mockSkills.has(name)) return mockSkills.get(name);
          // Try matching by base name (after colon)
          for (const [id, skill] of mockSkills) {
            const baseName = id.includes(":") ? id.split(":")[1] : id;
            if (baseName === name) return skill;
          }
          return undefined;
        }),
        getSkills: vi.fn(() => Array.from(mockSkills.values())),
      },
    } as unknown as Partial<HarnessOrchestrator>;

    // Create a minimal mock context - most fields aren't used by load_skill
    mockContext = {
      issueId: "TEST-123",
      worktreePath: "/tmp/test",
      db: {} as any,
      hooks: {} as any,
      memory: {} as any,
    };
  });

  describe("execute - load skill", () => {
    it("returns skill content when skill exists", async () => {
      mockSkills.set("github:pr-workflow", {
        id: "github:pr-workflow",
        name: "PR Workflow",
        description: "How to create PRs",
        instructions: "## Creating PRs\n\n1. Create branch\n2. Make changes\n3. Push",
        priority: 50,
      });

      const tool = createLoadSkillTool(mockOrchestrator as HarnessOrchestrator);
      const result = await tool.execute({ skillId: "github:pr-workflow" }, mockContext);

      expect(result.success).toBe(true);
      expect(result.output).toBe(
        "## PR Workflow\n\n## Creating PRs\n\n1. Create branch\n2. Make changes\n3. Push",
      );
    });

    it("finds skill by base name (fuzzy match)", async () => {
      mockSkills.set("github:pr-workflow", {
        id: "github:pr-workflow",
        name: "PR Workflow",
        description: "How to create PRs",
        instructions: "Instructions here",
        priority: 50,
      });

      const tool = createLoadSkillTool(mockOrchestrator as HarnessOrchestrator);
      const result = await tool.execute({ skillId: "pr-workflow" }, mockContext);

      expect(result.success).toBe(true);
      expect(result.output).toContain("PR Workflow");
    });
  });

  describe("execute - list skills", () => {
    it("lists all skills when no skillId provided", async () => {
      mockSkills.set("github:pr-workflow", {
        id: "github:pr-workflow",
        name: "PR Workflow",
        description: "How to create PRs",
        instructions: "Instructions",
        priority: 50,
      });
      mockSkills.set("jira:ticket-workflow", {
        id: "jira:ticket-workflow",
        name: "Ticket Workflow",
        description: "How to handle tickets",
        instructions: "Instructions",
        priority: 50,
      });

      const tool = createLoadSkillTool(mockOrchestrator as HarnessOrchestrator);
      const result = await tool.execute({}, mockContext);

      expect(result.success).toBe(true);
      expect(result.output).toContain("Available Skills (2)");
      expect(result.output).toContain("github:pr-workflow");
      expect(result.output).toContain("jira:ticket-workflow");
    });

    it("lists all skills when skillId is empty string", async () => {
      mockSkills.set("github:pr-workflow", {
        id: "github:pr-workflow",
        name: "PR Workflow",
        description: "How to create PRs",
        instructions: "Instructions",
        priority: 50,
      });

      const tool = createLoadSkillTool(mockOrchestrator as HarnessOrchestrator);
      const result = await tool.execute({ skillId: "" }, mockContext);

      expect(result.success).toBe(true);
      expect(result.output).toContain("Available Skills (1)");
    });

    it("handles no registered skills", async () => {
      const tool = createLoadSkillTool(mockOrchestrator as HarnessOrchestrator);
      const result = await tool.execute({}, mockContext);

      expect(result.success).toBe(true);
      expect(result.output).toBe("No skills are currently registered.");
    });

    it("handles undefined args", async () => {
      mockSkills.set("github:pr-workflow", {
        id: "github:pr-workflow",
        name: "PR Workflow",
        description: "How to create PRs",
        instructions: "Instructions",
        priority: 50,
      });

      const tool = createLoadSkillTool(mockOrchestrator as HarnessOrchestrator);
      const result = await tool.execute(undefined, mockContext);

      expect(result.success).toBe(true);
      expect(result.output).toContain("Available Skills (1)");
    });
  });

  describe("execute - search fallback", () => {
    it("shows partial matches when no exact match found", async () => {
      mockSkills.set("github:pr-workflow", {
        id: "github:pr-workflow",
        name: "PR Workflow",
        description: "How to create pull requests",
        instructions: "Instructions",
        priority: 50,
      });
      mockSkills.set("jira:ticket-workflow", {
        id: "jira:ticket-workflow",
        name: "Ticket Workflow",
        description: "How to handle tickets",
        instructions: "Instructions",
        priority: 50,
      });

      const tool = createLoadSkillTool(mockOrchestrator as HarnessOrchestrator);
      const result = await tool.execute({ skillId: "github" }, mockContext);

      expect(result.success).toBe(true);
      expect(result.output).toContain("No exact match");
      expect(result.output).toContain("github:pr-workflow");
      expect(result.output).not.toContain("jira:ticket-workflow");
    });

    it("searches in description", async () => {
      mockSkills.set("github:pr-workflow", {
        id: "github:pr-workflow",
        name: "PR Workflow",
        description: "How to create pull requests",
        instructions: "Instructions",
        priority: 50,
      });

      const tool = createLoadSkillTool(mockOrchestrator as HarnessOrchestrator);
      const result = await tool.execute({ skillId: "pull requests" }, mockContext);

      expect(result.success).toBe(true);
      expect(result.output).toContain("github:pr-workflow");
    });

    it("shows all skills when no matches at all", async () => {
      mockSkills.set("github:pr-workflow", {
        id: "github:pr-workflow",
        name: "PR Workflow",
        description: "How to create PRs",
        instructions: "Instructions",
        priority: 50,
      });

      const tool = createLoadSkillTool(mockOrchestrator as HarnessOrchestrator);
      const result = await tool.execute({ skillId: "nonexistent" }, mockContext);

      expect(result.success).toBe(true);
      expect(result.output).toContain('No skills found matching "nonexistent"');
      expect(result.output).toContain("github:pr-workflow");
    });

    it("returns error when no skills registered and search fails", async () => {
      const tool = createLoadSkillTool(mockOrchestrator as HarnessOrchestrator);
      const result = await tool.execute({ skillId: "nonexistent" }, mockContext);

      expect(result.success).toBe(false);
      expect(result.error).toContain("No skills are currently registered");
    });
  });

  describe("tool metadata", () => {
    it("has correct name", () => {
      const tool = createLoadSkillTool(mockOrchestrator as HarnessOrchestrator);
      expect(tool.name).toBe("load_skill");
    });

    it("has description explaining both load and list functionality", () => {
      const tool = createLoadSkillTool(mockOrchestrator as HarnessOrchestrator);
      expect(tool.description).toContain("Load a skill's full instructions");
      expect(tool.description).toContain("list available skills");
    });

    it("has schema with optional skillId parameter", () => {
      const tool = createLoadSkillTool(mockOrchestrator as HarnessOrchestrator);
      expect(tool.schema).toMatchObject({
        type: "object",
        properties: {
          skillId: { type: "string" },
        },
      });
      // skillId is now optional
      expect(tool.schema.required).toBeUndefined();
    });
  });
});
