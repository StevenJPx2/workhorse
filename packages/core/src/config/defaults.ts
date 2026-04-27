import type { JiratownConfig } from "./types.ts";

export const DEFAULT_CONFIG: JiratownConfig = {
  agent: {
    harness: "pi-coding-agent",
  },
  behavior: {
    autoResume: true,
    pollInterval: 30_000,
  },
  prompt: {},
  ui: {
    theme: "tokyonight",
  },
  steering: {
    enabled: true,
    debounceMs: 2000,
    maxReminders: 3,
    cooldownMs: 30000,
  },
  plugins: {
    enabled: [],
  },
};
