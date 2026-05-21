/**
 * Memory search tool definition.
 *
 * @module plugins/builtin/tools/definitions/memory-search
 */
import type { OrchestratorTool } from "#workflow";

import { memorySearchToolImpl } from "../implementations";

export const memorySearchTool: OrchestratorTool = {
  name: "workhorse_memory_search",
  description:
    "Search the project's semantic memory (L2) for relevant context from past sessions, decisions, and code patterns. " +
    "Use this to recall previous work, find related implementations, or understand how similar problems were solved. " +
    "Returns documents ranked by relevance with optional content.",
  schema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description:
          "Natural language search query (e.g., 'authentication implementation', 'database migration patterns')",
      },
      limit: {
        type: "number",
        description: "Maximum number of results to return. Defaults to 5.",
      },
      type: {
        type: "string",
        enum: ["session_memory", "issue_context", "decision", "code_context"],
        description: "Filter by document type. If omitted, searches all types.",
      },
      includeContent: {
        type: "boolean",
        description:
          "Whether to include full document content in results. Defaults to true.",
      },
    },
    required: ["query"],
  },
  execute: memorySearchToolImpl,
};
