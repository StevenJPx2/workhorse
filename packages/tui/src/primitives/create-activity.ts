/**
 * Primitive for tracking agent activity (tool calls, file edits, text output).
 * Provides a reactive signal with activity items per issue.
 */

import { createSignal, onCleanup, type Accessor } from "solid-js";
import type { HookEmitter } from "@jiratown/core";
import { type ActivityItem, categorizeToolCall } from "./activity-types.ts";

// Re-export types for consumers
export type { ActivityItem, JiratownAction } from "./activity-types.ts";

export interface CreateActivityOptions {
  hooks: HookEmitter;
  issueId: Accessor<string | null | undefined>;
  /** Max items to keep in history (default: 100) */
  maxItems?: number;
}

export interface ActivityState {
  items: ActivityItem[];
  isStreaming: boolean;
  lastActivity: Date | null;
}

/**
 * Create reactive activity tracking for an agent.
 * Tracks tool calls, text output (as separate bubbles), and file edits.
 */
export function createActivity(options: CreateActivityOptions) {
  const { hooks, issueId, maxItems = 100 } = options;

  const [state, setState] = createSignal<ActivityState>({
    items: [],
    isStreaming: false,
    lastActivity: null,
  });

  let currentTextBuffer = "";
  let textFlushTimeout: ReturnType<typeof setTimeout> | null = null;

  /** Flush accumulated text as a single text bubble */
  const flushText = () => {
    if (textFlushTimeout) {
      clearTimeout(textFlushTimeout);
      textFlushTimeout = null;
    }
    if (currentTextBuffer.trim()) {
      addItem({ type: "text", content: currentTextBuffer.trim(), timestamp: new Date() });
      currentTextBuffer = "";
    }
  };

  /** Add an activity item */
  const addItem = (item: ActivityItem) => {
    setState((prev) => {
      const items = [...prev.items, item];
      // Trim to max items
      if (items.length > maxItems) {
        items.splice(0, items.length - maxItems);
      }
      return { ...prev, items, lastActivity: item.timestamp };
    });
  };

  // Handle text output - buffer and flush on pause
  const handleOutput = ({ issueId: eventIssueId, delta }: { issueId: string; delta: string }) => {
    if (eventIssueId !== issueId()) return;

    // Mark as streaming
    setState((prev) => ({ ...prev, isStreaming: true }));

    // Accumulate text
    currentTextBuffer += delta;

    // Reset flush timer - will create a new text bubble after 500ms pause
    if (textFlushTimeout) clearTimeout(textFlushTimeout);
    textFlushTimeout = setTimeout(flushText, 500);
  };

  // Handle tool calls - categorize into specific types
  const handleToolCall = ({
    issueId: eventIssueId,
    tool,
    args,
  }: {
    issueId: string;
    tool: string;
    args: unknown;
  }) => {
    if (eventIssueId !== issueId()) return;

    // Flush any pending text before showing tool call
    flushText();
    addItem(categorizeToolCall(tool, args, new Date()));
  };

  // Handle agent idle (end of agentic turn)
  const handleIdle = ({ issueId: eventIssueId }: { issueId: string }) => {
    if (eventIssueId !== issueId()) return;

    flushText();
    setState((prev) => ({ ...prev, isStreaming: false }));
    addItem({ type: "idle", timestamp: new Date() });
  };

  // Handle steering reminders
  const handleSteering = ({
    issueId: eventIssueId,
    reminder,
  }: {
    issueId: string;
    reminder: string;
  }) => {
    if (eventIssueId !== issueId()) return;

    flushText();
    addItem({ type: "steering", reminder, timestamp: new Date() });
  };

  // Subscribe to events
  hooks.on("agent.output", handleOutput);
  hooks.on("agent.tool_call", handleToolCall);
  hooks.on("agent.idle", handleIdle);
  hooks.on("steering.reminder", handleSteering);

  onCleanup(() => {
    hooks.off("agent.output", handleOutput);
    hooks.off("agent.tool_call", handleToolCall);
    hooks.off("agent.idle", handleIdle);
    hooks.off("steering.reminder", handleSteering);
    if (textFlushTimeout) clearTimeout(textFlushTimeout);
  });

  return { state };
}
