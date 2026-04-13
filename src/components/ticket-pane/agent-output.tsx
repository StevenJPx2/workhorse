/**
 * AgentOutput component - Displays live output from agent's tmux session
 *
 * Shows the most recent lines of output from the agent, with auto-scroll
 * and an option to expand/collapse.
 */

import { For, Show, createSignal, type Accessor } from "solid-js";
import { useTheme } from "../../lib/theme/index.ts";

/**
 * Props for the AgentOutput component
 */
export interface AgentOutputProps {
  /** Output lines to display */
  lines: Accessor<string[]>;
  /** Whether agent is currently running */
  isRunning: Accessor<boolean>;
  /** Last update timestamp */
  lastUpdated: Accessor<string | null>;
  /** Max lines to show when collapsed (default: 8) */
  collapsedLines?: number;
  /** Called when user wants to refresh output */
  onRefresh?: () => void;
}

/**
 * Format timestamp for display
 */
function formatTime(timestamp: string | null): string {
  if (!timestamp) return "";
  try {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  } catch {
    return "";
  }
}

/**
 * AgentOutput displays live output from the agent
 */
export function AgentOutput(props: AgentOutputProps) {
  const { theme } = useTheme();
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [expanded, _setExpanded] = createSignal(false);

  const collapsedLines = () => props.collapsedLines ?? 8;
  const totalLines = () => props.lines().length;

  const visibleLines = () => {
    const lines = props.lines();
    if (expanded() || lines.length <= collapsedLines()) {
      return lines;
    }
    // Show last N lines when collapsed
    return lines.slice(-collapsedLines());
  };

  const hasMore = () => totalLines() > collapsedLines();
  const hiddenCount = () => totalLines() - collapsedLines();

  return (
    <box
      flexDirection="column"
      border
      borderStyle="rounded"
      borderColor={props.isRunning() ? theme().status.implementing : theme().border.default}
      padding={1}
    >
      {/* Header */}
      <box flexDirection="row" justifyContent="space-between">
        <box flexDirection="row" gap={1}>
          <text fg={theme().text.secondary}>Agent Output</text>
          <Show when={props.isRunning()}>
            <text fg={theme().status.implementing}>●</text>
          </Show>
        </box>
        <Show when={props.lastUpdated()}>
          <text fg={theme().text.dim}>{formatTime(props.lastUpdated())}</text>
        </Show>
      </box>

      <box height={1} />

      {/* Output lines */}
      <Show
        when={visibleLines().length > 0}
        fallback={
          <text fg={theme().text.dim}>
            {props.isRunning() ? "Waiting for output..." : "No output yet"}
          </text>
        }
      >
        <For each={visibleLines()}>
          {(line, index) => (
            <box height={1} width="100%">
              <text
                fg={
                  index() === visibleLines().length - 1
                    ? theme().text.primary
                    : theme().text.secondary
                }
              >
                {line.length > 80 ? line.slice(0, 77) + "..." : line}
              </text>
            </box>
          )}
        </For>
      </Show>

      {/* Expand/collapse control */}
      <Show when={hasMore()}>
        <box height={1} />
        <text fg={theme().text.dim}>
          {expanded()
            ? `[v] Collapse (${totalLines()} lines)`
            : `[v] Expand (${hiddenCount()} hidden)`}
        </text>
      </Show>
    </box>
  );
}
