export type AgentHarness = string;

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
  steering: {
    enabled: boolean;
    debounceMs: number;
    maxReminders: number;
    cooldownMs: number;
  };
  plugins: {
    enabled: string[];
    [pluginName: string]: unknown;
  };
}

export interface ConfigPaths {
  globalDir: string;
  globalConfig: string;
  projectConfig: string;
  database: string;
  memoryDatabase: string;
  worktreesRoot: string;
}
