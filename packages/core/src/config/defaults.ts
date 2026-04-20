import type { JiratownConfig } from "./types.ts";

export const DEFAULT_CONFIG: JiratownConfig = {
  agent: {
    harness: "opencode",
  },
  behavior: {
    autoResume: true,
    pollInterval: 30_000,
  },
  prompt: {},
  ui: {
    theme: "tokyonight",
  },
  plugins: {
    enabled: [],
    directories: [],
  },
};
