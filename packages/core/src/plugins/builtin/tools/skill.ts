/**
 * Skill loading tool - allows agents to load skill instructions on demand.
 *
 * @module plugins/builtin/tools/skill
 */

import type {
  HarnessOrchestrator,
  OrchestratorTool,
  ResolvedSkill,
  ToolExecutionContext,
  ToolResult,
} from "#workflow";

/** Schema input for load_skill tool */
interface LoadSkillArgs {
  skillId?: string;
}

/** Format a skill for list display */
function formatSkillSummary(skill: ResolvedSkill): string {
  return `- **${skill.id}**: ${skill.description}`;
}

/**
 * Creates the load_skill tool.
 * Needs orchestrator reference to access registered skills.
 */
export function createLoadSkillTool(
  orchestrator: HarnessOrchestrator,
): OrchestratorTool {
  return {
    name: "load_skill",
    description:
      "Load a skill's full instructions or list available skills. " +
      "If skillId is provided, loads that skill's instructions (supports fuzzy matching). " +
      "If skillId is omitted, lists all available skills with descriptions. " +
      "If no exact match is found, shows matching skills or all skills as fallback.",
    schema: {
      type: "object",
      properties: {
        skillId: {
          type: "string",
          description:
            "Optional skill ID or search term. If omitted, lists all skills. " +
            "Supports fuzzy matching (e.g., 'pr-workflow' finds 'github:pr-workflow').",
        },
      },
    },
    execute: async (
      args: unknown,
      _ctx: ToolExecutionContext,
    ): Promise<ToolResult> => {
      const { skillId } = (args as LoadSkillArgs) || {};
      const allSkills = orchestrator.skillRegistry.getSkills();

      // No skillId provided - list all skills
      if (!skillId || skillId.trim() === "") {
        if (allSkills.length === 0) {
          return {
            success: true,
            output: "No skills are currently registered.",
          };
        }
        return {
          success: true,
          output:
            `## Available Skills (${allSkills.length})\n\n` +
            allSkills.map(formatSkillSummary).join("\n") +
            "\n\nCall `load_skill` with a skill ID to load its full instructions.",
        };
      }

      // Try fuzzy match first
      const skill = orchestrator.skillRegistry.getSkillByName(skillId);
      if (skill) {
        return {
          success: true,
          output: `## ${skill.name}\n\n${skill.instructions}`,
        };
      }

      // No fuzzy match - search by partial match in id, name, description
      const lowerQuery = skillId.toLowerCase();
      const matches = allSkills.filter(
        (s) =>
          s.id.toLowerCase().includes(lowerQuery) ||
          s.name.toLowerCase().includes(lowerQuery) ||
          s.description.toLowerCase().includes(lowerQuery),
      );

      if (matches.length > 0) {
        return {
          success: true,
          output:
            `No exact match for "${skillId}". Found ${matches.length} similar skill(s):\n\n` +
            matches.map(formatSkillSummary).join("\n") +
            "\n\nCall `load_skill` with a skill ID to load its full instructions.",
        };
      }

      // No matches at all - show all skills
      if (allSkills.length === 0) {
        return { success: false, error: "No skills are currently registered." };
      }

      return {
        success: true,
        output:
          `No skills found matching "${skillId}". Showing all ${allSkills.length} available skills:\n\n` +
          allSkills.map(formatSkillSummary).join("\n") +
          "\n\nCall `load_skill` with a skill ID to load its full instructions.",
      };
    },
  };
}
