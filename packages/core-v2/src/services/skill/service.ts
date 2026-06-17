import { homedir } from "node:os";

import type { GlobalContext } from "#orchestrator";
import type { SkillT } from "#schema";

import type { Service } from "../base";
import { discoverSkills } from "./discover";
import { skillTools } from "./tools";

export class SkillService implements Service {
  readonly name = "skills";

  private readonly skills: SkillT[] = [];

  constructor(
    private readonly cwd: string = process.cwd(),
    private readonly home: string = homedir(),
  ) {}

  async setup(context: GlobalContext): Promise<void> {
    this.skills.push(...discoverSkills(this.cwd, this.home));

    await context.hooks.callHook("tools:register", {
      tools: skillTools(this),
    });

    context.hooks.hook("skills:register", ({ skill }) => {
      this.skills.push(skill);
    });
  }

  list(): readonly SkillT[] {
    return this.skills;
  }

  teardown(): void {
    this.skills.length = 0;
  }
}
