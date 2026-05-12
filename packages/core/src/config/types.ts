import type { z } from "zod";
import type { jiratownConfigSchema } from "./schema.ts";

export type AgentHarness = string;

/** Jiratown configuration derived from the Zod schema */
export type JiratownConfig = z.infer<typeof jiratownConfigSchema>;

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
