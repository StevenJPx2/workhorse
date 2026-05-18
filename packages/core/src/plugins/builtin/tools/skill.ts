/**
 * Skill loading tool - allows agents to load skill instructions on demand.
 *
 * @module plugins/builtin/tools/skill
 */

import type {
  HarnessOrchestrator,
  OrchestratorTool,
  ToolExecutionContext,
  ToolResult,
} from "#workflow/orchestrator";

/** Schema input for load_skill tool */
interface LoadSkillArgs {
  skillId: string;
}

/**
 * Creates the load_skill tool.
 * Needs orchestrator reference to access registered skills.
 */
export function createLoadSkillTool(orchestrator: HarnessOrchestrator): OrchestratorTool {
  return {
    name: "load_skill",
    description:
      "Load a skill's full instructions. Use this when you need detailed guidance for a " +
      "specific workflow. Available skills are listed in the 'Available Skills' section of " +
      "your context. Pass the skill ID (e.g., 'github:pr-workflow') to load its instructions.",
    schema: {
      type: "object",
      properties: {
        skillId: {
          type: "string",
          description: "The skill ID to load (e.g., 'github:pr-workflow')",
        },
      },
      required: ["skillId"],
    },
    execute: async (args: unknown, _ctx: ToolExecutionContext): Promise<ToolResult> => {
      const { skillId } = args as LoadSkillArgs;

      const skill = orchestrator.skillRegistry.getSkill(skillId);
      if (!skill) {
        const availableSkills = orchestrator.skillRegistry.getSkills().map((s) => s.id);
        return {
          success: false,
          error: `Skill "${skillId}" not found. Available: ${availableSkills.join(", ") || "none"}`,
        };
      }

      return {
        success: true,
        output: `## ${skill.name}\n\n${skill.instructions}`,
      };
    },
  };
}
