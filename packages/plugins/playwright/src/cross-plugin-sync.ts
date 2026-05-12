/**
 * Cross-Plugin Sync — Playwright reactions to GitHub plugin events.
 *
 * Listens for GitHub plugin hooks and contributes Playwright-specific content.
 * - Adds "Screenshots" section to PRs with final screenshots
 *
 * @module workhorse-plugin-playwright/cross-plugin-sync
 */

import { readdir } from "node:fs/promises";
import type { WorkhorseContext } from "workhorse-core";
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
): void {
  // Listen for PR opening to contribute "Screenshots" section
  ctx.hooks.on("github:pr.opening", async (event: unknown) => {
    const openingCtx = event as PROpeningPayload;

    try {
      // Find screenshots in the worktree directory
      const screenshots = await findScreenshots(openingCtx.worktreePath);

      if (screenshots.length === 0) {
        return; // No screenshots to add
      }

      // Build the Screenshots section with image references
      // Note: GitHub displays images in PR descriptions when they're in the repo
      openingCtx.contributions.push({
        section: "Screenshots",
        content: screenshots.map((filename) => `![${filename}](./${filename})`).join("\n\n"),
        priority: 80, // Show near the end of the PR
      });
    } catch (error) {
      // Best effort - don't fail PR creation if screenshot lookup fails
      console.error(`[playwright] Failed to add Screenshots to PR:`, error);
    }
  });
}

/**
 * Find screenshot files in the worktree directory.
 * Looks for common screenshot patterns: screenshot-*.png, screenshot-*.jpeg, etc.
 */
async function findScreenshots(worktreePath: string): Promise<string[]> {
  try {
    return await readdir(worktreePath).then((r) =>
      r.filter((f) => /^screenshot-\d+\.(png|jpe?g)$/i.test(f)).sort(),
    );
  } catch {
    return [];
  }
}
