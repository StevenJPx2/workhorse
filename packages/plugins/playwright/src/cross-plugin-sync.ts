/**
 * Cross-Plugin Sync — Playwright reactions to GitHub plugin events.
 *
 * Listens for GitHub plugin hooks and contributes Playwright-specific content.
 * - Adds "Screenshots" section to PRs with screenshots from AttachmentService
 *
 * @module workhorse-plugin-playwright/cross-plugin-sync
 */

import type { AttachmentService, WorkhorseContext } from "workhorse-core";

import type { PlaywrightSessionManager } from "./session-manager.ts";

/** Payload type for github:pr.opening event (mirrors PROpeningContext) */
interface PROpeningPayload {
  issueId: string;
  title: string;
  body: string;
  base: string;
  head: string;
  draft: boolean;
  worktreePath: string;
  contributions: Array<{
    section: string;
    content: string;
    priority?: number;
  }>;
}

/**
 * Register cross-plugin sync handlers for Playwright.
 *
 * Sets up listeners for GitHub plugin events and contributes
 * Playwright-specific content (screenshots) to PRs.
 */
export function registerPlaywrightCrossPluginSync(
  ctx: WorkhorseContext,
  _sessionManager: PlaywrightSessionManager,
  attachmentService: AttachmentService,
): void {
  // Listen for PR opening to contribute "Screenshots" section
  ctx.hooks.on("github:pr.opening", async (event: unknown) => {
    const openingCtx = event as PROpeningPayload;

    try {
      // Look up the issue to get the repository identifier
      const issue = await ctx.db.issues.getByExternalId(openingCtx.issueId);
      if (!issue) {
        return;
      }

      // List attachments from AttachmentService
      // Filter for screenshots (filename pattern: screenshot-*.png/jpeg)
      const screenshots = await attachmentService
        .listForIssue((issue.repository as string) ?? "unknown", openingCtx.issueId)
        .then((list) => list.filter((a) => /^screenshot-\d+_.*\.(png|jpe?g)$/i.test(a.filename)));

      if (screenshots.length === 0) {
        return; // No screenshots to add
      }

      // Build the Screenshots section
      // Note: Files are stored locally, not in the repo, so we provide paths
      openingCtx.contributions.push({
        section: "Screenshots",
        content: [
          `${screenshots.length} screenshot${screenshots.length === 1 ? "" : "s"} captured during implementation:`,
          "",
          ...screenshots.map(
            (s) =>
              // Extract the human-friendly name (after the sourceId prefix)
              `- **${s.filename.includes("_") ? s.filename.slice(s.filename.indexOf("_") + 1) : s.filename}** (${formatSize(s.size)}): \`${s.localPath}\``,
          ),
          "",
          "_Screenshots are stored locally and can be viewed at the paths above._",
        ].join("\n"),
        priority: 80, // Show near the end of the PR
      });
    } catch (error) {
      // Best effort - don't fail PR creation if screenshot lookup fails
      console.error(`[playwright] Failed to add Screenshots to PR:`, error);
    }
  });
}

/** Format bytes as human-readable size */
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
