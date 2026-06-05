/**
 * Tool-related types.
 *
 * @module workflow/orchestrator/types/tools
 */
import type { Database } from "#db";
import type { HookEmitter } from "#lib";
import type { MemoryService } from "#services";

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
  /** Issue ID the agent is working on (externalId) */
  issueId: string;

  /** Issue source (e.g., "github", "jira", "figma") */
  source: string;

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
 * Image content for tool results.
 * Allows tools to return images that can be displayed to vision-capable models.
 */
export interface ImageContent {
  type: "image";
  /** Base64-encoded image data */
  data: string;
  /** MIME type (e.g., "image/png", "image/jpeg") */
  mimeType: string;
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

  /**
   * Optional images to include in the result.
   * Vision-capable models can view these directly.
   * Non-vision models will receive a text fallback.
   */
  images?: ImageContent[];
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
  /** Tool name (e.g., "workhorse_acknowledge") */
  name: string;

  /** Tool description (shown to agent in system prompt) */
  description: string;

  /** JSON Schema for tool parameters */
  schema: JSONSchema;

  /**
   * Issue sources this tool applies to (e.g., ["jira"], ["github"]).
   * If omitted or empty, tool is available for all issue sources.
   *
   * This allows plugins to register tools that only appear when working on
   * issues from specific sources. For example, Jira tools won't be shown
   * when working on a local issue that has no Jira integration.
   */
  sources?: string[];

  /**
   * Execute the tool with given arguments.
   *
   * @param args - Arguments matching the schema
   * @param ctx - Execution context with service access
   * @returns Tool result
   */
  execute: (args: unknown, ctx: ToolExecutionContext) => Promise<ToolResult>;
}
