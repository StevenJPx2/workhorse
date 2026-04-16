/**
 * useAgentActivity hook - Combines streaming and polling for agent activity
 *
 * Uses real-time streaming as primary source when agent is active,
 * falls back to polling-based summary when stream is not connected.
 */

import { createMemo, type Accessor } from "solid-js";
import { useAgentSummary } from "../../hooks/use-agent-summary/index.ts";
import { useAgentStream } from "../../hooks/use-agent-stream/index.ts";
import type { AgentStep } from "../../hooks/use-agent-summary/index.ts";

export interface UseAgentActivityOptions {
  ticketId: string;
  worktreePath: Accessor<string | null | undefined>;
  isAgentActive: Accessor<boolean>;
}

export interface UseAgentActivityReturn {
  steps: Accessor<AgentStep[]>;
  currentStatus: Accessor<string | null>;
  isMonitoring: Accessor<boolean>;
  error: Accessor<string | null>;
  addUserMessage: (message: string) => void;
}

/**
 * Hook that combines real-time streaming and polling for agent activity
 */
export function useAgentActivity(options: UseAgentActivityOptions): UseAgentActivityReturn {
  const { ticketId, worktreePath, isAgentActive } = options;

  // Real-time streaming from OpenCode SDK (primary source when active)
  const agentStream = useAgentStream({
    ticketId,
    enabled: isAgentActive(),
    maxMessages: 50,
  });

  // Polling-based agent status as fallback (when stream not connected)
  const agentSummary = useAgentSummary({
    ticketId: () => ticketId,
    worktreePath: () => worktreePath() ?? undefined,
    enabled: () => Boolean(worktreePath()) && !agentStream.isConnected(),
    pollInterval: 3000,
  });

  // Convert stream messages to AgentStep format
  const streamSteps = createMemo((): AgentStep[] => {
    return agentStream.messages().map((msg) => ({
      description: msg.content,
      type: msg.type === "assistant" ? "action" : msg.type === "tool" ? "result" : "thinking",
      timestamp: msg.timestamp,
    }));
  });

  // Combine stream steps with summary steps (stream takes priority when connected)
  const steps = createMemo((): AgentStep[] => {
    if (agentStream.isConnected() && streamSteps().length > 0) {
      return streamSteps();
    }
    return agentSummary.steps();
  });

  // Current status from stream or summary
  const currentStatus = createMemo(() => {
    if (agentStream.isConnected()) {
      const msgs = agentStream.messages();
      if (msgs.length > 0) {
        return msgs[msgs.length - 1].content;
      }
    }
    return agentSummary.currentStatus();
  });

  // Combined polling/streaming indicator
  const isMonitoring = createMemo(() => agentStream.isConnected() || agentSummary.isPolling());

  // Combined error from either source
  const error = createMemo(() => agentStream.error() || agentSummary.error());

  return {
    steps,
    currentStatus,
    isMonitoring,
    error,
    addUserMessage: agentSummary.addUserMessage,
  };
}
