import z from "zod";

import { type SkillT, defineTool } from "#schema";

export function loadSkillTool(skills: () => readonly SkillT[]) {
  return defineTool({
    annotations: {
      destructive_hint: false,
      idempotent_hint: true,
      open_world_hint: false,
      read_only_hint: true,
      title: "Load skill",
    },
    description:
      "List available skills, or load one skill's full instructions by name. " +
      "Call with no name to list every skill; pass a name to load its instructions.",
    execute: async ({ name }, ctx) => {
      if (!name) {
        const all = skills();

        if (all.length === 0) {
          return {
            ok: true,
            output: "No skills are available.",
          };
        }

        return {
          ok: true,
          output: all
            .map((skill) => `- **${skill.name}**: ${skill.description}`)
            .join("\n"),
        };
      }

      const skill = skills().find((candidate) => candidate.name === name);

      if (!skill) {
        return {
          error: `No skill named "${name}".`,
          ok: false,
        };
      }

      if (skill.render !== undefined) {
        return { ok: true, output: skill.render(ctx) };
      }

      return { ok: true, output: skill.instructions };
    },
    input: z.object({
      name: z.string().optional(),
    }),
    name: "load_skill",
  });
}
