/**
 * Playwright plugin prompt enrichment.
 *
 * Adds Playwright-specific context blocks to agent prompts.
 *
 * @module workhorse-plugin-playwright/prompt
 */
import type { PromptBuildingContext, WorkhorseContext } from "workhorse-core";

/**
 * Register Playwright prompt hooks.
 *
 * Adds Playwright workflow guidance to agent prompts.
 */
export function registerPlaywrightPromptHooks(ctx: WorkhorseContext): void {
  // Add Playwright workflow guidance when building prompts
  // Hook receives PromptBuildingContext directly (issueId is internal UUID)
  ctx.hooks.on("prompt.building", (buildingCtx: PromptBuildingContext) => {
    // Add a context block with Playwright best practices
    buildingCtx.contextBlocks.push({
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
  });
}
