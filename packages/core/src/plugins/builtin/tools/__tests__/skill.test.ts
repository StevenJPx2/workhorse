import { describe, expect, it, beforeEach, vi } from "vitest";

import type {
  HarnessOrchestrator,
  ResolvedSkill,
  ToolExecutionContext,
} from "#workflow/orchestrator";

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

  describe("execute", () => {
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

    it("returns error when skill not found", async () => {
      const tool = createLoadSkillTool(mockOrchestrator as HarnessOrchestrator);
      const result = await tool.execute({ skillId: "nonexistent:skill" }, mockContext);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Skill "nonexistent:skill" not found');
    });

    it("lists available skills in error message", async () => {
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
      const result = await tool.execute({ skillId: "nonexistent:skill" }, mockContext);

      expect(result.success).toBe(false);
      expect(result.error).toContain("github:pr-workflow");
      expect(result.error).toContain("jira:ticket-workflow");
    });

    it("shows 'none' when no skills available", async () => {
      const tool = createLoadSkillTool(mockOrchestrator as HarnessOrchestrator);
      const result = await tool.execute({ skillId: "nonexistent:skill" }, mockContext);

      expect(result.success).toBe(false);
      expect(result.error).toContain("Available: none");
    });
  });

  describe("tool metadata", () => {
    it("has correct name", () => {
      const tool = createLoadSkillTool(mockOrchestrator as HarnessOrchestrator);
      expect(tool.name).toBe("load_skill");
    });

    it("has description explaining usage", () => {
      const tool = createLoadSkillTool(mockOrchestrator as HarnessOrchestrator);
      expect(tool.description).toContain("Load a skill's full instructions");
      expect(tool.description).toContain("Available Skills");
    });

    it("has schema with skillId parameter", () => {
      const tool = createLoadSkillTool(mockOrchestrator as HarnessOrchestrator);
      expect(tool.schema).toMatchObject({
        type: "object",
        properties: {
          skillId: { type: "string" },
        },
        required: ["skillId"],
      });
    });
  });
});
