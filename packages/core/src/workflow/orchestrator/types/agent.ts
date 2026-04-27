/**
 * Agent adapter abstract class.
 *
 * Subclasses extend this to implement a harness-specific adapter.
 * The base class handles common construction (issueId, worktreePath, state init)
 * and stores the AdapterContext as a protected field.
 *
 * @module workflow/orchestrator/types/agent
 */

import type { AdapterContext } from "./adapter-context.ts";

/**
 * Agent harness identifier.
 * Validated at runtime against registered adapters.
 */
export type AgentHarness = string;

/**
 * Agent lifecycle states.
 */
export type AgentState = "starting" | "running" | "stopping" | "stopped" | "crashed";

/**
 * Abstract base class for agent adapters.
 *
 * Each adapter is instantiated per issue. Subclasses must:
 * - Define `harness` (the harness identifier string)
 * - Implement `start()`, `sendMessage()`, `stop()`, `isRunning()`
 *
 * The base class handles:
 * - Extracting `issueId` and `worktreePath` from AdapterContext
 * - Initializing `state` to `"stopped"`
 * - Storing `ctx` as a protected field for subclass access
 *
 * @example
 * ```typescript
 * class MyAdapter extends AgentAdapter {
 *   readonly harness = "my-harness";
 *
 *   async start() { ... }
 *   async sendMessage(content: string) { ... }
 *   async stop() { ... }
 *   isRunning() { ... }
 * }
 * ```
 */
export abstract class AgentAdapter {
  /** Issue ID this agent is working on */
  get issueId(): string {
    return this.ctx.issue.externalId;
  }

  /** Path to the git worktree */
  get worktreePath(): string {
    return this.ctx.worktreePath;
  }

  /** Current lifecycle state */
  state: AgentState = "stopped";

  /** Harness identifier (set by subclass) */
  abstract readonly harness: AgentHarness;

  /**
   * @param ctx - AdapterContext with all services and issue data
   */
  constructor(protected readonly ctx: AdapterContext) {}

  /**
   * Start the agent session.
   * Creates the underlying session and begins processing the initial message.
   */
  abstract start(): Promise<void>;

  /**
   * Send a message to the agent.
   * Uses steer() if streaming, prompt() otherwise.
   */
  abstract sendMessage(content: string): Promise<void>;

  /**
   * Stop the agent session.
   * Disposes resources and cleans up.
   */
  abstract stop(): Promise<void>;

  /**
   * Check if the agent is currently running/streaming.
   */
  abstract isRunning(): boolean;
}
