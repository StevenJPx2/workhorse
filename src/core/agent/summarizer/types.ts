/**
 * Types for agent status summarization
 */

/**
 * A summarized step from the agent output
 */
export interface AgentStep {
  /** Step description */
  description: string;
  /** Step type for styling */
  type: "thinking" | "action" | "result" | "error";
  /** Timestamp when captured */
  timestamp: string;
}
