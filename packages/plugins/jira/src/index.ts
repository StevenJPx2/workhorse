/**
 * Jira Plugin — Workhorse plugin for Jira Cloud integration.
 *
 * Provides:
 * - Issue parsing for Jira ticket keys and URLs
 * - Comment poller monitor
 * - Prompt enrichment (Jira state + workflow instructions)
 * - Status sync (Workhorse status → Jira transitions)
 * - Jira tools (add_comment, transition_issue)
 *
 * @module workhorse-plugin-jira
 */

import { z } from "zod/v4";
import { AttachmentService, definePlugin } from "workhorse-core";
import { registerAgentHooks } from "./agent-hooks.ts";
import { jiraAuthProvider } from "./auth.ts";
import { AtlassianClient } from "./client.ts";
import { createCredentialGetter } from "./credentials.ts";
import { registerCrossPluginSync } from "./cross-plugin-sync.ts";
import { registerHookConsumers } from "./hook-consumers.ts";
import { createJiraCommentMonitor } from "./monitor.ts";
import { createJiraParserOptions } from "./parser.ts";
import { registerPromptHooks } from "./prompt.ts";
import { jiraRenderer } from "./renderer.ts";
import { registerJiraSteering } from "./steering.ts";
import { registerStatusSync } from "./sync.ts";
import { createJiraTools } from "./tools";

/** Config schema for the Jira plugin (site URL is now stored in credentials) */
export const JiraConfigSchema = z.object({
  pollInterval: z.number().int().positive().default(30_000),
});

export type JiraConfig = z.infer<typeof JiraConfigSchema>;

// fallow-ignore-next-line unused-exports
export type { JiraCredentials } from "./types.ts";

// Export plugin hook types for cross-plugin coordination
export type { JiraPluginHooks } from "./hooks.ts";

// Export auth utilities for TUI
export { jiraAuthProvider } from "./auth.ts";
export { isJiraAuthenticated } from "./credentials.ts";

export const jiraPlugin = definePlugin({
  manifest: {
    name: "jira",
    version: "1.0.0",
    description: "Jira Cloud integration for Workhorse",
    capabilities: {
      parsers: ["jira"],
      monitors: ["jira-comments"],
      tools: [
        "jira_add_comment",
        "jira_transition_issue",
        "jira_get_comments",
        "jira_get_attachments",
      ],
    },
  },
  // API Token auth provider - user provides email + API token via setup wizard
  auth: jiraAuthProvider,
  configSchema: JiraConfigSchema,
  setup(ctx, config) {
    // Create Jira REST API client with credentials from keychain
    const client = new AtlassianClient(createCredentialGetter());

    // Create attachment service for downloading Jira attachments
    const attachmentService = new AttachmentService(ctx.paths.attachmentsDir);

    // Register issue parser for Jira keys and URLs
    ctx.tracker.registerParser(createJiraParserOptions(client));

    // Register comment monitor (started per-issue when agent spawns)
    ctx.monitors.registerMonitor(createJiraCommentMonitor(client, config.pollInterval, ctx.db));

    // Register agent lifecycle hooks (starts comment monitor on agent create)
    registerAgentHooks(ctx);

    // Register prompt enrichment
    registerPromptHooks(ctx, client);

    // Register hook consumers (handles jira:transition.requested, jira:assign.requested)
    registerHookConsumers(ctx, client);

    // Register status sync (emits jira:transition.requested, jira:assign.requested)
    registerStatusSync(ctx);

    // Register cross-plugin sync (reacts to GitHub plugin events)
    registerCrossPluginSync(ctx, client, ctx.db);

    // Register Jira tools with orchestrator (including attachment tool)
    for (const tool of createJiraTools(client, ctx.hooks, attachmentService)) {
      ctx.orchestrator.registerTool(tool);
    }

    // Register Jira steering rules
    registerJiraSteering(ctx);

    // Register renderer with TUI (if TUI plugin is loaded)
    ctx.hooks.emit("tui.register_renderer", {
      id: "jira",
      renderer: jiraRenderer,
    });
  },
});
