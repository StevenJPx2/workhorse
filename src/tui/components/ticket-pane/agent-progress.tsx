/**
 * AgentProgress component - Displays agent state and session activity
 *
 * Shows visual indicators for agent state (starting/running/stopped/crashed),
 * session activity summary, recent actions, and quick action buttons.
 */

import { For, Show, type Accessor } from "solid-js";
import { useTheme } from "../../theme/index.ts";
import { ActionBar } from "../button/index.ts";
import type { AgentProgressInfo } from "../../hooks/use-agent-progress/index.ts";

/**
 * Props for the AgentProgress component
 */
export interface AgentProgressProps {
  /** Progress info (reactive) */
  progress: Accessor<AgentProgressInfo>;
  /** Called when user clicks Stop */
  onStop?: () => void;
}

/**
 * Format a timestamp for display
 */
function formatTime(timestamp: string): string {
  try {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

/**
 * Truncate text to max length
 */
function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen - 3) + "...";
}

/**
 * AgentProgress displays agent state and session activity
 */
export function AgentProgress(props: AgentProgressProps) {
  const { theme } = useTheme();

  const p = () => props.progress();
  const isActive = () => p().state === "running" || p().state === "starting";

  // Quick actions based on state
  const actions = () => {
    const state = p().state;
    const items: { key: string; action: string }[] = [];

    if (state === "running" || state === "starting") {
      items.push({ key: "s", action: "stop" });
    }

    return items;
  };

  return (
    <box
      flexDirection="column"
      border
      borderStyle="rounded"
      borderColor={isActive() ? theme().status.implementing : theme().border.default}
      padding={1}
    >
      {/* Header with state */}
      <box flexDirection="row" justifyContent="space-between">
        <box flexDirection="row" gap={1}>
          <text fg={theme().text.secondary}>Agent</text>
          <text fg={p().stateColor}>
            {p().stateIndicator} {p().stateLabel}
          </text>
        </box>
        <Show when={p().runningDuration}>
          <text fg={theme().text.dim}>Running {p().runningDuration}</text>
        </Show>
      </box>

      {/* Summary */}
      <Show when={p().summary}>
        <box height={1} />
        <text fg={theme().text.primary}>{truncate(p().summary!, 70)}</text>
      </Show>

      {/* Recent activity */}
      <Show when={p().recentActivity.length > 0}>
        <box height={1} />
        <text fg={theme().text.secondary}>Recent Activity:</text>
        <For each={p().recentActivity.slice(0, 5)}>
          {(event) => (
            <box flexDirection="row" gap={1}>
              <text fg={theme().text.dim} width={6}>
                {formatTime(event.timestamp)}
              </text>
              <text fg={theme().text.primary}>{truncate(event.description, 60)}</text>
            </box>
          )}
        </For>
      </Show>

      {/* Key decisions (collapsed) */}
      <Show when={p().keyDecisions.length > 0}>
        <box height={1} />
        <text fg={theme().text.secondary}>Key Decisions: {p().keyDecisions.length}</text>
      </Show>

      {/* Quick actions */}
      <Show when={actions().length > 0}>
        <box height={1} />
        <ActionBar actions={actions()} />
      </Show>
    </box>
  );
}
