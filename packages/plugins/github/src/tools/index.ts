/**
 * GitHub tools registered with the orchestrator.
 *
 * @module @jiratown/plugin-github/tools
 */

import type { Database, OrchestratorTool } from "@jiratown/core";
import type { GitHubClient } from "../client.ts";
import { createAddCommentTool } from "./add-comment";
import { createGetPRStatusTool } from "./get-pr-status";
import { createOpenPRTool } from "./open-pr";
import type { HooksEmitter, MonitorServiceLike } from "./types";

/** Create GitHub tool definitions */
export function createGitHubTools(
  client: GitHubClient,
  db: Database,
  hooks: HooksEmitter,
  monitors: MonitorServiceLike,
): OrchestratorTool[] {
  return [
    createOpenPRTool(client, db, hooks, monitors),
    createAddCommentTool(client),
    createGetPRStatusTool(client),
  ];
}
