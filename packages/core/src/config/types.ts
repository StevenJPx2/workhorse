import type { ZodType } from "zod/v4";

export type AgentHarness = "claude-code" | "opencode";

export interface JiratownConfig {
  agent: {
    harness: AgentHarness;
    model?: string;
  };
  behavior: {
    autoResume: boolean;
    pollInterval: number;
  };
  prompt: {
    custom?: string;
  };
  ui: {
    theme: string;
  };
  plugins: {
    enabled: string[];
    directories: string[];
    [pluginName: string]: unknown;
  };
}

export interface ConfigPaths {
  globalDir: string;
  globalConfig: string;
  projectConfig: string;
  database: string;
  memoryDatabase: string;
}

export interface PluginConfigSchema {
  pluginName: string;
  schema: ZodType;
}
