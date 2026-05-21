/**
 * Playwright plugin steering rules.
 *
 * Provides idle-agent reminders for Playwright-specific workflows.
 *
 * @module workhorse-plugin-playwright/steering
 */

import type { WorkhorseContext } from "workhorse-core";

/**
 * Register Playwright-specific steering rules.
 */
export function registerPlaywrightSteering(ctx: WorkhorseContext): void {
  // Remind to take final screenshots before creating PR
  ctx.orchestrator.registerSteeringRule({
    id: "playwright:screenshot-before-pr",
    name: "Take screenshots before PR",
    description: "Remind to capture final screenshots before creating a PR",
    condition: {
      status: "implementing",
      when: (steerCtx) => {
        // Only remind if they've used Playwright but haven't taken a screenshot recently
        // and haven't already opened a PR
        return (
          steerCtx.toolHistory.some((t: { name: string }) =>
            t.name.startsWith("playwright_"),
          ) &&
          !steerCtx.toolHistory
            .slice(-5)
            .some(
              (t: { name: string }) => t.name === "playwright_screenshot",
            ) &&
          !steerCtx.toolHistory.some(
            (t: { name: string }) => t.name === "github_open_pr",
          )
        );
      },
    },
    reminder: `Before creating a PR, consider taking a final screenshot of your implementation:

1. Navigate to the relevant page with \`playwright_navigate\`
2. Take a screenshot with \`playwright_screenshot\` (use a descriptive filename)

Screenshots will be automatically attached to the PR in a "Screenshots" section.`,
    priority: 12, // Fire before the "create PR" reminder (priority 15)
    once: true, // Only remind once per session
  });
}
