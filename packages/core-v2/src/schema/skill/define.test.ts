import { describe, expect, it } from "vitest";

import { defineSkill } from "./define";

describe("defineSkill", () => {
  it("returns validated skill data with render optional", () => {
    const skill = defineSkill({
      description: "House",
      instructions: "Small diffs.",
      name: "house",
    });
    expect(skill.render).toBeUndefined();
    expect(skill.instructions).toBe("Small diffs.");
  });

  it("keeps a custom renderer when provided", () => {
    const skill = defineSkill({
      description: "Dyn",
      instructions: "static",
      name: "dyn",
      render: (ctx) => `dynamic for ${ctx.cwd}`,
    });
    expect(skill.render).toBeTypeOf("function");
  });
});
