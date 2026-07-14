import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export function write(base: string, rel: string, body: string): void {
  const path = join(base, rel);
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, body);
}

export function claudeSkill(base: string, name: string, body: string): void {
  write(base, `.claude/skills/${name}/SKILL.md`, body);
}

export function agentsSkill(base: string, name: string, body: string): void {
  write(base, `.agents/skills/${name}/SKILL.md`, body);
}

export function fm(name: string, description: string, body = "Body."): string {
  return `---\nname: ${name}\ndescription: ${description}\n---\n${body}`;
}
