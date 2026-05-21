import { describe, expect, it } from "vitest";

import { type PluginSkillInput, PluginSkillSchema } from "../types/skills.ts";

describe("PluginSkillSchema", () => {
  describe("id validation", () => {
    it("accepts valid skill IDs", () => {
      const validIds = [
        "github:pr-workflow",
        "jira:ticket-workflow",
        "playwright:browser-testing",
        "my-plugin:my-skill",
        "a:b",
        "plugin123:skill456",
      ];

      for (const id of validIds) {
        const input: PluginSkillInput = {
          id,
          name: "Test Skill",
          description: "A test skill",
          instructions: "Do the thing",
        };
        const result = PluginSkillSchema.safeParse(input);
        expect(result.success, `ID "${id}" should be valid`).toBe(true);
      }
    });

    it("rejects invalid skill IDs", () => {
      const invalidIds = [
        "no-colon",
        ":missing-plugin",
        "missing-skill:",
        "UPPERCASE:skill",
        "plugin:UPPERCASE",
        "plugin:skill:extra",
        "plugin_underscore:skill",
        "plugin:skill_underscore",
        "",
        "plugin:",
        ":skill",
      ];

      for (const id of invalidIds) {
        const input: PluginSkillInput = {
          id,
          name: "Test Skill",
          description: "A test skill",
          instructions: "Do the thing",
        };
        const result = PluginSkillSchema.safeParse(input);
        expect(result.success, `ID "${id}" should be invalid`).toBe(false);
      }
    });
  });

  describe("name validation", () => {
    it("accepts valid names", () => {
      const input: PluginSkillInput = {
        id: "test:skill",
        name: "A Valid Name",
        description: "A test skill",
        instructions: "Do the thing",
      };
      const result = PluginSkillSchema.parse(input);
      expect(result.name).toBe("A Valid Name");
    });

    it("rejects empty names", () => {
      const input: PluginSkillInput = {
        id: "test:skill",
        name: "",
        description: "A test skill",
        instructions: "Do the thing",
      };
      const result = PluginSkillSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it("rejects names over 100 characters", () => {
      const input: PluginSkillInput = {
        id: "test:skill",
        name: "x".repeat(101),
        description: "A test skill",
        instructions: "Do the thing",
      };
      const result = PluginSkillSchema.safeParse(input);
      expect(result.success).toBe(false);
    });
  });

  describe("description validation", () => {
    it("accepts valid descriptions", () => {
      const input: PluginSkillInput = {
        id: "test:skill",
        name: "Test Skill",
        description: "A valid description",
        instructions: "Do the thing",
      };
      const result = PluginSkillSchema.parse(input);
      expect(result.description).toBe("A valid description");
    });

    it("rejects empty descriptions", () => {
      const input: PluginSkillInput = {
        id: "test:skill",
        name: "Test Skill",
        description: "",
        instructions: "Do the thing",
      };
      const result = PluginSkillSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it("rejects descriptions over 500 characters", () => {
      const input: PluginSkillInput = {
        id: "test:skill",
        name: "Test Skill",
        description: "x".repeat(501),
        instructions: "Do the thing",
      };
      const result = PluginSkillSchema.safeParse(input);
      expect(result.success).toBe(false);
    });
  });

  describe("instructions vs instructionsPath", () => {
    it("accepts inline instructions", () => {
      const input: PluginSkillInput = {
        id: "test:skill",
        name: "Test Skill",
        description: "A test skill",
        instructions: "## How to do the thing\n\n1. Step one\n2. Step two",
      };
      const result = PluginSkillSchema.parse(input);
      expect(result.instructions).toBe(
        "## How to do the thing\n\n1. Step one\n2. Step two",
      );
      expect(result.instructionsPath).toBeUndefined();
    });

    it("accepts instructionsPath", () => {
      const input: PluginSkillInput = {
        id: "test:skill",
        name: "Test Skill",
        description: "A test skill",
        instructionsPath: "skills/my-skill.md",
      };
      const result = PluginSkillSchema.parse(input);
      expect(result.instructionsPath).toBe("skills/my-skill.md");
      expect(result.instructions).toBeUndefined();
    });

    it("rejects when both instructions and instructionsPath are provided", () => {
      const input: PluginSkillInput = {
        id: "test:skill",
        name: "Test Skill",
        description: "A test skill",
        instructions: "Inline content",
        instructionsPath: "skills/my-skill.md",
      };
      const result = PluginSkillSchema.safeParse(input);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toContain("Exactly one of");
      }
    });

    it("rejects when neither instructions nor instructionsPath are provided", () => {
      const input: PluginSkillInput = {
        id: "test:skill",
        name: "Test Skill",
        description: "A test skill",
      };
      const result = PluginSkillSchema.safeParse(input);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toContain("Exactly one of");
      }
    });
  });

  describe("priority", () => {
    it("defaults priority to 50", () => {
      const input: PluginSkillInput = {
        id: "test:skill",
        name: "Test Skill",
        description: "A test skill",
        instructions: "Do the thing",
      };
      const result = PluginSkillSchema.parse(input);
      expect(result.priority).toBe(50);
    });

    it("accepts custom priority values", () => {
      const validPriorities = [0, 1, 25, 50, 75, 100];

      for (const priority of validPriorities) {
        const input: PluginSkillInput = {
          id: "test:skill",
          name: "Test Skill",
          description: "A test skill",
          instructions: "Do the thing",
          priority,
        };
        const result = PluginSkillSchema.parse(input);
        expect(result.priority).toBe(priority);
      }
    });

    it("rejects priority below 0", () => {
      const input: PluginSkillInput = {
        id: "test:skill",
        name: "Test Skill",
        description: "A test skill",
        instructions: "Do the thing",
        priority: -1,
      };
      const result = PluginSkillSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it("rejects priority above 100", () => {
      const input: PluginSkillInput = {
        id: "test:skill",
        name: "Test Skill",
        description: "A test skill",
        instructions: "Do the thing",
        priority: 101,
      };
      const result = PluginSkillSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it("rejects non-integer priorities", () => {
      const input: PluginSkillInput = {
        id: "test:skill",
        name: "Test Skill",
        description: "A test skill",
        instructions: "Do the thing",
        priority: 50.5,
      };
      const result = PluginSkillSchema.safeParse(input);
      expect(result.success).toBe(false);
    });
  });
});
