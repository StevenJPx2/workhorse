/**
 * Figma tools registered with the orchestrator.
 *
 * @module workhorse-plugin-figma/tools
 */
import type { OrchestratorTool } from "workhorse-core";

import type { FigmaClient } from "../client.ts";
import { createGetCommentsTool } from "./get-comments.ts";
import { createGetFileTool } from "./get-file.ts";
import { createPostCommentTool } from "./post-comment.ts";

/** Create all Figma tool definitions bound to a client */
export function createFigmaTools(client: FigmaClient): OrchestratorTool[] {
  return [
    createGetFileTool(client),
    createGetCommentsTool(client),
    createPostCommentTool(client),
  ];
}
