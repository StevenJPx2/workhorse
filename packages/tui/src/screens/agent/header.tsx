/**
 * Agent header component - displays agent info and status.
 */
import { type Accessor, Show } from "solid-js";
import type { AgentAdapter, AgentState } from "workhorse-core";

import { MonitorIndicator } from "../../components";
import {
  getStatusColor,
  getStatusIcon,
  truncateModel,
} from "../../components/agent-sidebar/status-utils.ts";
import { WorkhorseStatus } from "../../components/workhorse-status.tsx";
import type { IssueStatusState } from "../../primitives/create-issue-status.ts";
import type { MonitorsState } from "../../primitives/create-monitors.ts";
import { getTheme } from "../../theme.ts";

interface AgentHeaderProps {
  agent: Accessor<AgentAdapter>;
  agentState: AgentState | null;
  monitorState: Accessor<MonitorsState>;
  issueStatusState: Accessor<IssueStatusState>;
}

export function AgentHeader(props: AgentHeaderProps) {
  const theme = getTheme();
  const agent = props.agent;
  const state = () => props.agentState ?? "stopped";

  return (
    <box
      flexDirection="row"
      justifyContent="space-between"
      backgroundColor={theme.colors.surface}
      paddingX={2}
      paddingY={2}
    >
      <box flexDirection="row" flexShrink={1} overflow="hidden">
        <text fg={theme.colors.accent}>
          <b>{agent().issueId}</b>
        </text>
        <text fg={theme.colors.dim}>
          {" — "}
          {agent().issue.title.length > 30
            ? agent().issue.title.slice(0, 30) + "..."
            : agent().issue.title}
        </text>
      </box>
      <box flexDirection="row" flexShrink={0} gap={1}>
        <Show when={agent().modelLabel}>
          <text fg={theme.colors.info}>
            ◇ {truncateModel(agent().modelLabel, 28)}
          </text>
          <text fg={theme.colors.dim}>|</text>
        </Show>
        <WorkhorseStatus status={props.issueStatusState().status} />
        <text fg={theme.colors.dim}>|</text>
        <MonitorIndicator state={props.monitorState()} />
        <text fg={theme.colors.dim}>|</text>
        <text fg={getStatusColor(state(), theme)}>
          {getStatusIcon(state())} {state().toUpperCase()}
        </text>
      </box>
    </box>
  );
}
