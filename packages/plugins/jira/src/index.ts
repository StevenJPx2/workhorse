/**
 * Jira Plugin — Jiratown plugin for Jira Cloud integration.
 *
 * Provides:
 * - Issue parsing for Jira ticket keys and URLs
 * - Comment poller monitor
 * - Prompt enrichment (Jira state + workflow instructions)
 * - Status sync (Jiratown status → Jira transitions)
 * - Jira tools (add_comment, transition_issue)
 *
 * @module @jiratown/plugin-jira
 */

import { z } from "zod/v4";
import { definePlugin } from "@jiratown/core";
import { AtlassianClient } from "./client.ts";
import { createCredentialGetter } from "./auth.ts";
import { registerCrossPluginSync } from "./cross-plugin-sync.ts";
import { createJiraCommentMonitor } from "./monitor.ts";
import { createJiraParserOptions } from "./parser.ts";
import { registerPromptHooks } from "./prompt.ts";
import { registerStatusSync } from "./sync.ts";
import { createJiraTools } from "./tools.ts";

/** Config schema for the Jira plugin */
export const JiraConfigSchema = z.object({
  cloudId: z.string().min(1),
  pollInterval: z.number().int().positive().default(30_000),
});

export type JiraConfig = z.infer<typeof JiraConfigSchema>;

// fallow-ignore-next-line unused-exports
export type { JiraCredentials } from "./types.ts";

// Export plugin hook types for cross-plugin coordination
export type { JiraPluginHooks } from "./hooks.ts";

export const jiraPlugin = definePlugin({
  manifest: {
    name: "jira",
    version: "1.0.0",
    description: "Jira Cloud integration for Jiratown",
    capabilities: {
      parsers: ["jira"],
      monitors: ["jira-comments"],
      tools: ["jira_add_comment", "jira_transition_issue", "jira_get_comments"],
    },
  },
  configSchema: JiraConfigSchema,
  setup(ctx, config) {
    // Create Jira REST API client with credentials from keychain
    const client = new AtlassianClient(config.cloudId, createCredentialGetter());

    // Register issue parser for Jira keys and URLs
    ctx.tracker.registerParser({
      ...createJiraParserOptions(client),
      memory: ctx.memory,
      config: ctx.config,
    });

    // Register comment monitor (started per-issue when agent spawns)
    ctx.monitors.registerMonitor(createJiraCommentMonitor(client, config.pollInterval, ctx.db));

    ctx.hooks.on("orchestrator.spawn.post", ({ adapter }) => {
      const issue = ctx.db.issues.getByExternalId(adapter.issueId, "jira");
      if (issue) {
        ctx.monitors.startMonitor("jira-comments", issue.id);
      }
    });

    // Register prompt enrichment
    registerPromptHooks(ctx, client);

    // Register status sync
    registerStatusSync(ctx, client);

    // Register cross-plugin sync (reacts to GitHub plugin events)
    registerCrossPluginSync(ctx, client, ctx.db);

    // Register Jira tools with orchestrator
    for (const tool of createJiraTools(client, ctx.hooks)) {
      ctx.orchestrator.registerTool(tool);
    }
  },
});
