/**
 * Types for formatted stream messages
 */

/**
 * A formatted message for display in the UI
 */
export interface StreamMessage {
  /** Unique message ID */
  id: string;
  /** ISO timestamp */
  timestamp: string;
  /** Message content */
  content: string;
  /** Message type for styling */
  type: "assistant" | "tool" | "system";
}
