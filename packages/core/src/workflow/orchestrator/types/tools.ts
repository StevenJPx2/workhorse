/**
 * Tool-related types.
 *
 * @module workflow/orchestrator/types/tools
 */

import type { Database } from "#db/database";
import type { HookEmitter } from "#lib/hooks/types";
import type { MemoryService } from "#services/memory/service";

/**
 * JSON Schema type for tool parameter definitions.
 */
export interface JSONSchema {
  type: string;
  properties?: Record<string, JSONSchema>;
  required?: string[];
  items?: JSONSchema;
  description?: string;
  enum?: (string | number | boolean)[];
  default?: unknown;
  [key: string]: unknown;
}

/**
 * Context passed to tool execution.
 * Contains references to services needed for tool implementation.
 */
export interface ToolExecutionContext {
  /** Issue ID the agent is working on */
  issueId: string;

  /** Path to the git worktree */
  worktreePath: string;

  /** Database access */
  db: Database;

  /** Hook emitter for events */
  hooks: HookEmitter;

  /** Memory service access */
  memory: MemoryService;
}

/**
 * Result from tool execution.
 */
export interface ToolResult {
  /** Whether the tool succeeded */
  success: boolean;

  /** Output message (on success) */
  output?: string;

  /** Error message (on failure) */
  error?: string;
}

/**
 * Harness-agnostic tool interface.
 *
 * Plugins register tools via `orchestrator.registerTool()`.
 * Adapters translate these to their native format (e.g., pi ExtensionFactory).
 *
 * Tool descriptions are rendered in the system prompt so agents know what's available.
 */
export interface OrchestratorTool {
  /** Tool name (e.g., "jiratown_acknowledge") */
  name: string;

  /** Tool description (shown to agent in system prompt) */
  description: string;

  /** JSON Schema for tool parameters */
  schema: JSONSchema;

  /**
   * Execute the tool with given arguments.
   *
   * @param args - Arguments matching the schema
   * @param ctx - Execution context with service access
   * @returns Tool result
   */
  execute: (args: unknown, ctx: ToolExecutionContext) => Promise<ToolResult>;
}
