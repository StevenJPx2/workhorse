import { describe, expect, it, beforeEach, vi } from "vitest";

import type { SkillRegistry } from "#workflow";

import { registerBuiltinSkills } from "../register.ts";

describe("registerBuiltinSkills", () => {
  let mockRegistry: {
    registerSkill: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    mockRegistry = {
      registerSkill: vi.fn(),
    };
  });

  it("registers plugin-development skill", () => {
    registerBuiltinSkills(mockRegistry as unknown as SkillRegistry);

    expect(mockRegistry.registerSkill).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "builtin:plugin-development",
        name: "Plugin Development",
        description: expect.stringContaining("plugin"),
        priority: 60,
      }),
    );
  });

  it("registers skill-development skill", () => {
    registerBuiltinSkills(mockRegistry as unknown as SkillRegistry);

    expect(mockRegistry.registerSkill).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "builtin:skill-development",
        name: "Skill Development",
        description: expect.stringContaining("skill"),
        priority: 60,
      }),
    );
  });

  it("registers exactly 2 skills", () => {
    registerBuiltinSkills(mockRegistry as unknown as SkillRegistry);

    expect(mockRegistry.registerSkill).toHaveBeenCalledTimes(2);
  });

  it("loads markdown content for instructions", () => {
    registerBuiltinSkills(mockRegistry as unknown as SkillRegistry);

    const calls = mockRegistry.registerSkill.mock.calls;

    // Plugin development skill should contain plugin-related content
    const pluginSkill = calls.find(
      (call) => call[0].id === "builtin:plugin-development",
    )?.[0];
    expect(pluginSkill?.instructions).toContain("definePlugin");
    expect(pluginSkill?.instructions).toContain("useWorkhorse");

    // Skill development skill should contain skill-related content
    const skillSkill = calls.find(
      (call) => call[0].id === "builtin:skill-development",
    )?.[0];
    expect(skillSkill?.instructions).toContain("load_skill");
    expect(skillSkill?.instructions).toContain(".workhorse/skills");
  });

  it("includes dynamically generated hooks reference in plugin skill", () => {
    registerBuiltinSkills(mockRegistry as unknown as SkillRegistry);

    const calls = mockRegistry.registerSkill.mock.calls;
    const pluginSkill = calls.find(
      (call) => call[0].id === "builtin:plugin-development",
    )?.[0];

    // Should include the dynamically generated hooks reference
    expect(pluginSkill?.instructions).toContain("## Hooks Reference");
    expect(pluginSkill?.instructions).toContain("#### `issue.parsed`");
    expect(pluginSkill?.instructions).toContain("#### `agent.idle`");
    expect(pluginSkill?.instructions).toContain("#### `notification.created`");
  });
});
