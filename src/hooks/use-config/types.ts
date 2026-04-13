import type { Accessor } from "solid-js";
import type { ResolvedConfig, JiratownConfig, ThemeName, AgentType } from "../../types/config.ts";

export type ConfigStatus = "idle" | "loading" | "loaded" | "error";

export interface UseConfigOptions {
  autoLoad?: boolean;
  cwd?: string;
  onLoad?: (config: ResolvedConfig) => void;
  onError?: (error: Error) => void;
}

export interface UseConfigReturn {
  status: Accessor<ConfigStatus>;
  config: Accessor<ResolvedConfig | null>;
  error: Accessor<Error | null>;
  load: () => Promise<ResolvedConfig>;
  saveGlobal: (config: JiratownConfig) => void;
  saveProject: (config: JiratownConfig) => Promise<void>;
  setTheme: (theme: ThemeName) => Promise<void>;
  theme: Accessor<ThemeName>;
  agent: Accessor<AgentType>;
  cloudId: Accessor<string>;
}

export const DEFAULT_CONFIG: ResolvedConfig = {
  jira: { cloud_id: "" },
  defaults: { agent: "opencode" },
  ui: { theme: "tokyonight" },
  behavior: { auto_resume: true },
};
