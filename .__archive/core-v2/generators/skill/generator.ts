import type { NodePlopAPI } from "plop";

function skillSummary(answers: Record<string, string>): string {
  const name = answers.name ?? "";
  return [
    "",
    `  🟢  Skill "${name}" scaffolded at .claude/skills/${name}/`,
    "",
    "      It will be discovered automatically by SkillService on next setup.",
    "",
  ].join("\n");
}

export function registerSkillGenerator(plop: NodePlopAPI): void {
  plop.setGenerator("skill", {
    actions: [
      {
        path: ".claude/skills/{{kebabCase name}}/SKILL.md",
        templateFile: "generators/skill/templates/SKILL.md.hbs",
        type: "add",
      },
      {
        path: ".claude/skills/{{kebabCase name}}/resources/.gitkeep",
        template: "",
        type: "add",
      },
      skillSummary,
    ],
    description:
      "Scaffold a new agent skill (.claude/skills/<name>/SKILL.md + resources dir)",
    prompts: [
      {
        message:
          "Skill name (kebab-case, e.g. code-review — used as skill ID and directory):",
        name: "name",
        type: "input",
        validate: (input: string) => {
          if (/^[a-z][a-z0-9-]*$/u.test(input.trim())) {
            return true;
          }
          return "Skill name must be kebab-case (a-z, 0-9, hyphens).";
        },
      },
      {
        default: "What this skill does",
        message: "Short description:",
        name: "description",
        type: "input",
      },
    ],
  });
}
