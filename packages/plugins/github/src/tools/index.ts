/**
 * GitHub tools registered with the orchestrator.
 *
 * @module workhorse-plugin-github/tools
 */

import type { Database, OrchestratorTool } from "workhorse-core";
import type { GitHubClient } from "../client.ts";
import { createAddCommentTool } from "./add-comment";
import { createGetCICheckTool } from "./get-ci-check";
import { createGetPRReviewsTool } from "./get-pr-reviews";
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
    createGetCICheckTool(client),
    createGetPRReviewsTool(client),
  ];
}
