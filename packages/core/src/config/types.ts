import type { z } from "zod";
import type { workhorseConfigSchema } from "./schema.ts";

export type AgentHarness = string;

/** Jiratown configuration derived from the Zod schema */
export type WorkhorseConfig = z.infer<typeof workhorseConfigSchema>;

/** Deep partial type - makes all nested properties optional */
export type DeepPartial<T> = T extends object
  ? {
      [P in keyof T]?: DeepPartial<T[P]>;
    }
  : T;

export interface ConfigPaths {
  globalDir: string;
  globalConfig: string;
  projectConfig: string;
  database: string;
  memoryDatabase: string;
  worktreesRoot: string;
}
