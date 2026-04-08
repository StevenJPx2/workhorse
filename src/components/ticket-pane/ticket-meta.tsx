/**
 * TicketMeta component - Displays ticket status, agent, and worktree info
 */

import { Show } from "solid-js";
import {
  useTheme,
  getStatusConfig,
  getAgentColor,
  getAgentStateConfig,
  spacing,
} from "../../lib/theme/index.ts";
import type { TicketMetaProps } from "./types.ts";

/**
 * Metadata row showing status, agent, agent state, and worktree path
 */
export function TicketMeta(props: TicketMetaProps) {
  const { theme } = useTheme();

  const statusConfig = () => getStatusConfig(props.status, theme());
  const agentColor = () => getAgentColor(props.agent, theme());
  const agentState = () =>
    props.agentState ? getAgentStateConfig(props.agentState, theme()) : null;

  return (
    <box flexDirection="column" gap={spacing.xs}>
      {/* Status and Agent row */}
      <box flexDirection="row" gap={spacing.lg}>
        <box flexDirection="row" width={30}>
          <text fg={theme().text.secondary}>Status </text>
          <text fg={statusConfig().color}>
            {statusConfig().indicator} {statusConfig().label.toUpperCase()}
          </text>
        </box>
        <box flexDirection="row">
          <text fg={theme().text.secondary}>Agent </text>
          <text fg={agentColor()}>{props.agent}</text>
          <Show when={agentState()}>
            <text fg={theme().text.dim}> </text>
            <text fg={agentState()!.color}>
              ({agentState()!.indicator} {agentState()!.label})
            </text>
          </Show>
        </box>
      </box>

      {/* Worktree info (if present) */}
      <Show when={props.worktreePath}>
        <box flexDirection="row">
          <text fg={theme().text.secondary} width={9}>Worktree </text>
          <text fg={theme().text.dim}>{props.worktreePath}</text>
        </box>
      </Show>

      {/* Branch info (if present) */}
      <Show when={props.branchName && !props.worktreePath}>
        <box flexDirection="row">
          <text fg={theme().text.secondary} width={9}>Branch   </text>
          <text fg={theme().text.dim}>{props.branchName}</text>
        </box>
      </Show>
    </box>
  );
}
