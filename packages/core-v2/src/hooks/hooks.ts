import type { AnyTool, McpServerConfigT, SkillT } from "../schema";

type Hook<T> = (payload: T) => void | Promise<void>;

export interface Hooks {
  "mcp:register": Hook<{ server: McpServerConfigT }>;
  "skills:register": Hook<{ skill: SkillT }>;
  "tools:register": Hook<{ tools: AnyTool[] }>;
}
