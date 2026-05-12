/**
 * Playwright tools registered with the orchestrator.
 *
 * @module @stevenjpx2/jiratown-plugin-playwright/tools
 */

import type { OrchestratorTool } from "workhorse-core";
import type { PlaywrightSessionManager } from "../session-manager.ts";
import { createClickTool } from "./click.ts";
import { createCloseSessionTool } from "./close-session.ts";
import { createEvaluateTool } from "./evaluate.ts";
import { createFillTool } from "./fill.ts";
import { createGetElementTool } from "./get-element.ts";
import { createGetPageContentTool } from "./get-page-content.ts";
import { createNavigateTool } from "./navigate.ts";
import { createScreenshotTool } from "./screenshot.ts";

/** Create all Playwright tool definitions */
export function createPlaywrightTools(
  sessionManager: PlaywrightSessionManager,
): OrchestratorTool[] {
  return [
    createNavigateTool(sessionManager),
    createScreenshotTool(sessionManager),
    createClickTool(sessionManager),
    createFillTool(sessionManager),
    createGetElementTool(sessionManager),
    createGetPageContentTool(sessionManager),
    createEvaluateTool(sessionManager),
    createCloseSessionTool(sessionManager),
  ];
}
