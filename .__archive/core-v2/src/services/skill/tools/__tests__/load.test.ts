import { createHooks } from "hookable";
import { describe, expect, it } from "vitest";

import { ResolvedConfig } from "#config";
import type { Hooks } from "#hooks";
import { defineSkill, type SkillT } from "#schema";
import type { WorkflowContext } from "#workflow";

import { loadSkillTool } from "../load";

function ctx(): WorkflowContext {
  return {
    config: ResolvedConfig.parse({}),
    cwd: "/tmp/workhorse",
    hooks: createHooks<Hooks>(),
  };
}

function skill(
  spec: Partial<SkillT> & Pick<SkillT, "name" | "description" | "instructions">,
): SkillT {
  return defineSkill({ ...spec, scripts: spec.scripts ?? [] });
}

describe("loadSkillTool", () => {
  it("renders instructions, resources, and scripts for a skill", async () => {
    const s = skill({
      description: "Deploy",
      instructions: "Deploy things.",
      name: "deploy",
      resources: ["refs/flags.md"],
      scripts: [
        {
          args: {
            options: [],
            positional: [
              { description: "Target env", name: "env", required: true },
            ],
          },
          description: "Run migrations",
          name: "migrate",
        },
      ],
    });

    const result = await loadSkillTool(() => [s]).execute(
      { name: "deploy" },
      ctx(),
    );

    expect(result.ok).toBe(true);
    expect(result.output).toContain("Deploy things.");
    expect(result.output).toContain("refs/flags.md");
    expect(result.output).toContain("### Scripts");
    expect(result.output).toContain("deploy:migrate");
    expect(result.output).toContain("Usage: deploy:migrate <env>");
  });

  it("omits the scripts section when a skill has no scripts", async () => {
    const s = skill({
      description: "Plain",
      instructions: "Just instructions.",
      name: "plain",
    });

    const result = await loadSkillTool(() => [s]).execute(
      { name: "plain" },
      ctx(),
    );

    expect(result.output).not.toContain("### Scripts");
  });
});
