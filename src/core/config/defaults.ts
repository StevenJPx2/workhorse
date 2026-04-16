import type { ResolvedConfig } from "#types/config.ts";

export const DEFAULT_CONFIG: ResolvedConfig = {
  jira: {
    cloud_id: "",
  },
  defaults: {
    agent: "opencode",
  },
  ui: {
    theme: "tokyonight",
  },
  behavior: {
    auto_resume: true,
  },
  prompt: {
    custom: null,
  },
};
