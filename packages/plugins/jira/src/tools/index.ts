/**
 * Jira tools registered with the orchestrator.
 *
 * @module @jiratown/plugin-jira/tools
 */

import type { OrchestratorTool } from "@jiratown/core";
import type { AtlassianClient } from "../client.ts";
import { createAddCommentTool } from "./add-comment.ts";
import { createGetCommentsTool } from "./get-comments.ts";
import { createTransitionTool } from "./transition.ts";
import type { Hooks } from "./types.ts";

/** Create Jira tool definitions bound to a client */
export function createJiraTools(client: AtlassianClient, hooks: Hooks): OrchestratorTool[] {
  return [
    createAddCommentTool(client, hooks),
    createTransitionTool(client, hooks),
    createGetCommentsTool(client),
  ];
}
