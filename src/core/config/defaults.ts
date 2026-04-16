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
  webhooks: {
    mode: "polling",
    port: 3456,
    host: "localhost",
    github_secret: null,
    jira_secret: null,
    polling_interval: 30,
  },
};
