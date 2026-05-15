/**
 * GitHub Plugin — Workhorse plugin for GitHub integration.
 *
 * Provides:
 * - Issue parsing for GitHub refs (owner/repo#45) and URLs
 * - Unified PR monitor (reviews, comments, checks, mergeable state)
 * - Prompt enrichment (GitHub issue state + PR state + workflow instructions)
 * - Status sync (Workhorse status → GitHub PR labels)
 * - GitHub tools (open_pr, add_comment, get_pr_status)
 *
 * **External deps:** `gh` CLI (authenticated via `gh auth login`)
 *
 * @module workhorse-plugin-github
 */

import { z } from "zod/v4";
import { AttachmentService, definePlugin } from "workhorse-core";
import { githubAuthProvider } from "./auth.ts";
import { GitHubClient } from "./client.ts";
import { createGitHubPRMonitor } from "./monitor.ts";
import { createGitHubParserOptions } from "./parser.ts";
import { registerPromptHooks } from "./prompt.ts";
import { githubRenderer } from "./renderer.ts";
import { registerGitHubSteering } from "./steering.ts";
import { registerStatusSync } from "./sync.ts";
import { createGitHubTools } from "./tools";

/** Config schema for the GitHub plugin */
export const GitHubConfigSchema = z.object({
  pollInterval: z.number().int().positive().default(30_000),
});

export type GitHubConfig = z.infer<typeof GitHubConfigSchema>;

// Export types for external use
export type {
  GitHubCheckRun,
  GitHubComment,
  GitHubIssue,
  GitHubPR,
  GitHubPRMonitorState,
  GitHubRef,
  GitHubReview,
  PRStatusSummary,
} from "./types.ts";

export type { CICheckResult } from "./tools/get-ci-check.ts";
export type { DetailedReview, PRReviewsResult, ReviewComment } from "./tools/get-pr-reviews.ts";

// Export plugin hook types for cross-plugin coordination
export type { GitHubPluginHooks } from "./hooks.ts";

export { GitHubClient } from "./client.ts";
export { canParseGitHub, parseGitHubRef } from "./parser.ts";
export { mapGitHubToIssue } from "./mapper.ts";

export const githubPlugin = definePlugin({
  manifest: {
    name: "github",
    version: "1.0.0",
    description: "GitHub integration for Workhorse",
    capabilities: {
      parsers: ["github"],
      monitors: ["github-pr"],
      tools: [
        "github_open_pr",
        "github_add_comment",
        "github_get_pr_status",
        "github_get_ci_check",
        "github_get_pr_reviews",
        "github_get_attachments",
      ],
    },
  },
  // External auth provider - delegates to `gh` CLI
  auth: githubAuthProvider,
  configSchema: GitHubConfigSchema,
  setup(ctx, config) {
    const client = new GitHubClient();

    // Create attachment service for downloading/storing images
    const attachmentService = new AttachmentService(ctx.paths.attachmentsDir);

    // Register issue parser for GitHub refs and URLs
    ctx.tracker.registerParser(createGitHubParserOptions(client));

    // Register unified PR monitor (reviews, comments, checks, mergeable)
    ctx.monitors.registerMonitor(createGitHubPRMonitor(client, config.pollInterval, ctx.db));

    // Start monitor when agent spawns on an issue with PR metadata
    ctx.hooks.on("agent.create.post", ({ adapter }) => {
      if (((adapter.issue.metadata ?? {}) as Record<string, unknown>).prNumber) {
        ctx.monitors.startMonitor("github-pr", adapter.issue.id);
      }
    });

    // Register prompt enrichment
    registerPromptHooks(ctx, client);

    // Register status sync
    registerStatusSync(ctx, client);

    // Register GitHub tools with orchestrator
    for (const tool of createGitHubTools(
      client,
      ctx.db,
      ctx.hooks,
      ctx.monitors,
      attachmentService,
    )) {
      ctx.orchestrator.registerTool(tool);
    }

    // Register GitHub steering rules
    registerGitHubSteering(ctx);

    // Register renderer with TUI (if TUI plugin is loaded)
    ctx.hooks.emit("tui.register_renderer", {
      id: "github",
      renderer: githubRenderer,
    });
  },
});
