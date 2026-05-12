/**
 * Playwright plugin prompt enrichment.
 *
 * Adds Playwright-specific context blocks to agent prompts.
 *
 * @module @stevenjpx2/jiratown-plugin-playwright/prompt
 */

import type { JiratownContext } from "@stevenjpx2/jiratown-core";

/** Context for prompt.building hook */
interface PromptBuildingContext {
  issueId: string;
  contextBlocks: Array<{
    id: string;
    title: string;
    content: string;
    priority?: number;
  }>;
  metadata: Record<string, unknown>;
}

/**
 * Register Playwright prompt hooks.
 *
 * Adds Playwright workflow guidance to agent prompts.
 */
export function registerPlaywrightPromptHooks(ctx: JiratownContext): void {
  // Add Playwright workflow guidance when building prompts
  ctx.hooks.on(
    "prompt.building",
    ({ context }: { issueId: string; context: PromptBuildingContext }) => {
      // Add a context block with Playwright best practices
      context.contextBlocks.push({
        id: "playwright-workflow",
        title: "Browser Testing Workflow",
        content: `## Playwright Integration

When your implementation involves UI changes:

1. **Test visually** — Use \`playwright_navigate\` to verify your changes in a browser
2. **Capture evidence** — Take screenshots with \`playwright_screenshot\` before creating a PR
3. **Screenshots are auto-attached** — Any screenshots taken will be automatically included in the PR

Tip: Use descriptive filenames like \`screenshot-final-state.png\` for clarity.`,
        priority: 70, // Show in the middle/later part of the prompt
      });
    },
  );
}
