/**
 * TicketHeader component - Displays ticket ID, summary, and sync indicators
 */

import { useTheme } from "../../theme/index.ts";
import { SyncIndicator } from "../sync-indicator/index.ts";
import type { TicketHeaderProps } from "./types.ts";

/**
 * Header showing ticket ID, summary, and sync status
 */
export function TicketHeader(props: TicketHeaderProps) {
  const { theme } = useTheme();

  const displaySummary = () => props.summary ?? "No summary";

  return (
    <box flexDirection="column">
      <box flexDirection="row" justifyContent="space-between">
        <text fg={theme().text.primary}>
          <strong>
            {props.id}: {displaySummary()}
          </strong>
        </text>
        <SyncIndicator
          showGitHub={props.showGitHub}
          showJira={props.showJira}
          isGitHubPolling={props.isGitHubPolling}
          isJiraPolling={props.isJiraPolling}
        />
      </box>
      <box height={1}>
        <text fg={theme().border.default}>
          {"=".repeat(Math.min(60, props.id.length + displaySummary().length + 2))}
        </text>
      </box>
    </box>
  );
}
