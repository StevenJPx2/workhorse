import { Skill, type SkillT } from "./schema";

export function defineSkill(spec: SkillT): SkillT {
  return Skill.parse(spec);
}
