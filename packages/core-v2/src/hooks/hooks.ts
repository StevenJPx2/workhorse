import type { AnyTool, SkillT } from "../schema";

type Hook<T> = (payload: T) => void | Promise<void>;

export interface Hooks {
  "skills:register": Hook<{ skill: SkillT }>;
  "tools:register": Hook<{ tool: AnyTool }>;
}
