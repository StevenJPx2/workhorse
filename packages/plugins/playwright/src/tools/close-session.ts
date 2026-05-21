/**
 * Playwright Close Session Tool
 *
 * @module workhorse-plugin-playwright/tools/close-session
 */

import type { OrchestratorTool } from "workhorse-core";

import type { PlaywrightSessionManager } from "../session-manager.ts";

/** Create the playwright_close_session tool */
export function createCloseSessionTool(
  sessionManager: PlaywrightSessionManager,
): OrchestratorTool {
  return {
    name: "playwright_close_session",
    description:
      "Close the current browser session. This releases browser resources. " +
      "The session will be automatically recreated if you use other Playwright tools.",
    schema: {
      type: "object",
      properties: {},
      required: [],
    },
    execute: async (_args, ctx) => {
      if (!sessionManager.hasActiveSession(ctx.issueId)) {
        return {
          success: true,
          output: "No active browser session to close",
        };
      }

      await sessionManager.closeSession(ctx.issueId);

      return {
        success: true,
        output: "Browser session closed",
      };
    },
  };
}
