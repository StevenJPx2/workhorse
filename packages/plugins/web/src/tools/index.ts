/**
 * Web plugin tools.
 *
 * @module workhorse-plugin-web/tools
 */

import type { OrchestratorTool } from "workhorse-core";

import { createWebReadTool } from "./read.ts";
import { createScreenshotTool } from "./screenshot.ts";
import { createWebSearchTool } from "./search.ts";

/** Create all web tools */
export function createWebTools(): OrchestratorTool[] {
  return [createWebReadTool(), createWebSearchTool(), createScreenshotTool()];
}

export { createWebReadTool } from "./read.ts";
export { createWebSearchTool } from "./search.ts";
export { createScreenshotTool } from "./screenshot.ts";
