/**
 * Jira tools registered with the orchestrator.
 *
 * @module workhorse-plugin-jira/tools
 */

import type { AttachmentService, OrchestratorTool } from "workhorse-core";
import type { AtlassianClient } from "../client.ts";
import { createAddCommentTool } from "./add-comment.ts";
import { createGetAttachmentsTool } from "./get-attachments.ts";
import { createGetCommentsTool } from "./get-comments.ts";
import { createTransitionTool } from "./transition.ts";
import type { Hooks } from "./types.ts";

/** Create Jira tool definitions bound to a client */
export function createJiraTools(
  client: AtlassianClient,
  hooks: Hooks,
  attachmentService?: AttachmentService,
): OrchestratorTool[] {
  const tools = [
    createAddCommentTool(client, hooks),
    createTransitionTool(client, hooks),
    createGetCommentsTool(client),
  ];

  // Only add attachment tool if service is available
  if (attachmentService) {
    tools.push(createGetAttachmentsTool(client, attachmentService));
  }

  return tools;
}
