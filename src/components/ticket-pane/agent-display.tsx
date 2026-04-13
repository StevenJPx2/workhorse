/**
 * AgentDisplay - Compact agent status with LLM-summarized activity
 *
 * Layout:
 * - Header row: state indicator (left) | current status (right)
 * - Activity area: summarized steps from local LLM
 */

import { type Accessor, For, Show } from "solid-js";
import type { AgentProgressInfo } from "../../hooks/use-agent-progress/index.ts";
import type { AgentStep } from "../../hooks/use-agent-summary/index.ts";
import { useTheme } from "../../lib/theme/index.ts";

/**
 * Props for AgentDisplay
 */
export interface AgentDisplayProps {
  /** Agent progress info (state, activity) */
  progress: Accessor<AgentProgressInfo>;
  /** Summarized steps from LLM */
  steps: Accessor<AgentStep[]>;
  /** Current status line */
  currentStatus: Accessor<string | null>;
  /** Whether we're actively polling */
  isPolling: Accessor<boolean>;
  /** Error message if any */
  error: Accessor<string | null>;
  /** Max steps to show (default: 8) */
  maxSteps?: number;
  /** Called when user presses stop key */
  onStop?: () => void;
}

/**
 * Get icon for step type
 */
function getStepIcon(type: AgentStep["type"]): string {
  switch (type) {
    case "thinking":
      return "◌";
    case "action":
      return "▸";
    case "result":
      return "✓";
    case "error":
      return "✗";
    default:
      return "•";
  }
}

/**
 * Truncate text for display
 */
function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen - 3) + "...";
}

/**
 * AgentDisplay component
 */
export function AgentDisplay(props: AgentDisplayProps) {
  const { theme } = useTheme();
  const maxSteps = () => props.maxSteps ?? 8;

  const p = () => props.progress();
  const isActive = () => p().state === "running" || p().state === "starting";

  // Get visible steps (last N)
  const visibleSteps = () => {
    const allSteps = props.steps();
    if (allSteps.length <= maxSteps()) return allSteps;
    return allSteps.slice(-maxSteps());
  };

  // Get color for step type
  const getStepColor = (type: AgentStep["type"]) => {
    switch (type) {
      case "thinking":
        return theme().text.dim;
      case "action":
        return theme().info;
      case "result":
        return theme().success;
      case "error":
        return theme().error;
      default:
        return theme().text.secondary;
    }
  };

  return (
    <box flexDirection="column" flexGrow={1}>
      {/* Header row: state | current status */}
      <box flexDirection="row" justifyContent="space-between" marginBottom={1}>
        {/* Left: state indicator */}
        <box flexDirection="row" gap={1}>
          <text fg={p().stateColor}>{p().stateIndicator}</text>
          <text fg={theme().text.secondary}>{p().stateLabel}</text>
          <Show when={p().runningDuration}>
            <text fg={theme().text.dim}>({p().runningDuration})</text>
          </Show>
          <Show when={isActive() && props.onStop}>
            <text fg={theme().text.dim}>[s:stop]</text>
          </Show>
        </box>

        {/* Right: current status */}
        <Show when={props.currentStatus()}>
          <text fg={theme().text.primary}>{truncate(props.currentStatus()!, 40)}</text>
        </Show>
      </box>

      {/* Activity area */}
      <box
        flexDirection="column"
        flexGrow={1}
        borderStyle="single"
        borderColor={isActive() ? theme().status.implementing : theme().border.default}
        paddingX={1}
      >
        {/* Error state */}
        <Show when={props.error()}>
          <text fg={theme().error}>{props.error()}</text>
        </Show>

        {/* Steps */}
        <Show
          when={!props.error() && visibleSteps().length > 0}
          fallback={
            <Show when={!props.error()}>
              <text fg={theme().text.dim}>
                {isActive() ? "Analyzing agent activity..." : "No activity"}
              </text>
            </Show>
          }
        >
          <For each={visibleSteps()}>
            {(step, index) => {
              const prefix = () => (index() === visibleSteps().length - 1 ? "› " : "  ");
              const icon = getStepIcon(step.type);

              return (
                <box flexDirection="column" width="100%">
                  <text fg={getStepColor(step.type)}>
                    {`${prefix()}${icon} ${step.description}`}
                  </text>
                </box>
              );
            }}
          </For>
        </Show>

        {/* Polling indicator */}
        <Show when={isActive() && props.isPolling()}>
          <box marginTop={1}>
            <text fg={theme().text.dim}>● Monitoring</text>
          </box>
        </Show>
      </box>
    </box>
  );
}
