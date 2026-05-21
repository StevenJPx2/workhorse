import type { Issue } from "workhorse-core";

import { getTheme } from "../theme.ts";
import { Spinner } from "./spinner.tsx";

interface SpawningStateProps {
  issue: Issue;
}

/**
 * Loading state shown in the agent view while spawning is in progress.
 * Shows spinner, issue info, and current stage.
 */
export function SpawningState(props: SpawningStateProps) {
  const theme = getTheme();

  return (
    <box
      flexDirection="column"
      width="100%"
      height="100%"
      backgroundColor={theme.colors.background}
    >
      {/* Header */}
      <box
        flexDirection="row"
        justifyContent="space-between"
        backgroundColor={theme.colors.surface}
        paddingX={2}
        paddingY={1}
      >
        <box flexDirection="row" gap={1}>
          <text fg={theme.colors.accent}>
            <b>{props.issue.externalId}</b>
          </text>
          <text fg={theme.colors.dim}>—</text>
          <text fg={theme.colors.text}>{props.issue.title}</text>
        </box>
        <box flexDirection="row" gap={1}>
          <Spinner color={theme.colors.warning} />
          <text fg={theme.colors.warning}>
            <b>spawning</b>
          </text>
        </box>
      </box>

      {/* Main content - centered loading state */}
      <box
        flexDirection="column"
        flexGrow={1}
        alignItems="center"
        justifyContent="center"
        gap={2}
      >
        <box flexDirection="row" gap={1}>
          <Spinner color={theme.colors.accent} />
          <text fg={theme.colors.text}>
            <b>Spawning agent...</b>
          </text>
        </box>
        <text fg={theme.colors.dim}>
          Creating worktree and preparing environment
        </text>
      </box>

      {/* Status bar placeholder */}
      <box
        flexDirection="row"
        backgroundColor={theme.colors.surface}
        paddingX={2}
        paddingY={1}
      >
        <text fg={theme.colors.dim}>Press ESC to cancel and go back</text>
      </box>
    </box>
  );
}
