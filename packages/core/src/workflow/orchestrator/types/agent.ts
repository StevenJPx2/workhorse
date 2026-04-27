/**
 * Agent adapter types.
 *
 * @module workflow/orchestrator/types/agent
 */

/**
 * Supported agent harnesses.
 * Extensible via `& {}` for plugin-defined harnesses.
 */
export type AgentHarness = "pi-coding-agent" | (string & {});

/**
 * Agent lifecycle states.
 */
export type AgentState = "starting" | "running" | "stopping" | "stopped" | "crashed";

/**
 * Interface for agent adapters.
 *
 * Each adapter is a class instantiated per issue — combines tracking data
 * (issueId, harness, worktreePath, state) and control methods (start, stop, sendMessage).
 *
 * Implementations:
 * - PiAgentAdapter: Uses @mariozechner/pi-coding-agent SDK
 */
export interface AgentAdapter {
  /** Issue ID this agent is working on */
  readonly issueId: string;

  /** Harness being used (e.g., "pi-coding-agent") */
  readonly harness: AgentHarness;

  /** Path to the git worktree */
  readonly worktreePath: string;

  /** Current lifecycle state */
  state: AgentState;

  /**
   * Start the agent session.
   * Creates the underlying session and begins processing the initial message.
   */
  start(): Promise<void>;

  /**
   * Send a message to the agent.
   * Uses steer() if streaming, prompt() otherwise.
   */
  sendMessage(content: string): Promise<void>;

  /**
   * Stop the agent session.
   * Disposes resources and cleans up.
   */
  stop(): Promise<void>;

  /**
   * Check if the agent is currently running/streaming.
   */
  isRunning(): boolean;
}
