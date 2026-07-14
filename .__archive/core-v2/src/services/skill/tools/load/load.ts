import z from "zod";

import { defineTool, type SkillT } from "#schema";

import { buildSkill, catalogSkills, readSkill } from "./utils";

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
      "List available skills, load one skill's full instructions by name, " +
      "or read one of a skill's bundled resource files. Call with no name " +
      "to list every skill; pass a name to load its instructions; pass a " +
      "name and resource to read that bundled file.",
    execute: async ({ name, resource }, ctx) => {
      if (!name) {
        return catalogSkills(skills);
      }

      const skill = skills().find((candidate) => candidate.name === name);

      if (!skill) {
        return { error: `No skill named "${name}".`, ok: false };
      }

      if (resource) {
        return readSkill(skill, resource);
      }

      return { ok: true, output: buildSkill(skill, ctx) };
    },
    input: z.object({
      name: z.string().optional(),
      resource: z.string().optional(),
    }),
    name: "load_skill",
  });
}
