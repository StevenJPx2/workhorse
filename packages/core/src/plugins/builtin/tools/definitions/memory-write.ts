/**
 * Memory write tool definition.
 *
 * @module plugins/builtin/tools/definitions/memory-write
 */
import type { OrchestratorTool } from "#workflow";

import { memoryWriteToolImpl } from "../implementations";

export const memoryWriteTool: OrchestratorTool = {
  name: "workhorse_memory_write",
  description:
    "Record a session summary, codebase patterns, and learnings to memory so future agents " +
    "and sessions can benefit from this work. Call this at the end of a work session or after " +
    "completing a significant piece of work. All fields are optional — provide what you know.",
  schema: {
    type: "object",
    properties: {
      summary: {
        type: "array",
        items: { type: "string" },
        description:
          "Bullet points describing what was accomplished in this session.",
      },
      patterns: {
        type: "array",
        items: { type: "string" },
        description:
          "Codebase patterns discovered (e.g. 'Uses Zod for validation', 'All DB access via drizzle-orm'). " +
          "These replace the existing patterns list — include all patterns, not just new ones.",
      },
      learnings: {
        type: "array",
        items: { type: "string" },
        description:
          "Key technical discoveries or decisions made (e.g. 'Bun does not support X', 'Must use Y instead of Z').",
      },
      filesChanged: {
        type: "array",
        items: { type: "string" },
        description: "Relative paths of files modified during this session.",
      },
    },
  },
  execute: memoryWriteToolImpl,
};
