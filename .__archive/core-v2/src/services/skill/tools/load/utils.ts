import { readFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import { renderHelp, type SkillT, type ToolResultT } from "#schema";
import type { WorkflowContext } from "#workflow";

export function catalogSkills(skills: () => readonly SkillT[]): ToolResultT {
  const all = skills();

  if (all.length === 0) {
    return { ok: true, output: "No skills are available." };
  }

  return {
    ok: true,
    output: all
      .map((skill) => `- **${skill.name}**: ${skill.description}`)
      .join("\n"),
  };
}

export function readSkill(skill: SkillT, resource: string): ToolResultT {
  if (!skill.dir) {
    return { error: `Skill "${skill.name}" has no directory.`, ok: false };
  }

  const target = resolve(skill.dir, resource);
  const rel = relative(skill.dir, target);

  if (rel.startsWith("..") || rel === "") {
    return {
      error: `Resource "${resource}" is outside the skill.`,
      ok: false,
    };
  }

  if (!skill.resources?.includes(rel)) {
    return {
      error: `No resource "${resource}" in "${skill.name}".`,
      ok: false,
    };
  }

  return { ok: true, output: readFileSync(target, "utf8") };
}

export function buildSkill(skill: SkillT, ctx: WorkflowContext): string {
  const parts = [
    `## ${skill.name}`,
    skill.render === undefined ? skill.instructions : skill.render(ctx),
  ];

  if (skill.resources && skill.resources.length > 0) {
    parts.push(
      "### Resources",
      ...skill.resources.map((file) => `- \`${file}\``),
    );
  }

  if (skill.scripts && skill.scripts.length > 0) {
    parts.push(
      "",
      "### Scripts",
      "These scripts are registered as Workhorse scripts and can be invoked with run_script.",
      ...skill.scripts.flatMap((script) => [
        "",
        `- **${skill.name}:${script.name}**: ${script.description}`,
        ...renderHelp({
          args: script.args,
          description: script.description,
          name: `${skill.name}:${script.name}`,
        })
          .split("\n")
          .map((line) => `  ${line}`),
      ]),
    );
  }

  return parts.join("\n");
}
