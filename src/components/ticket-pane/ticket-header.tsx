/**
 * TicketHeader component - Displays ticket ID and summary
 */

import { useTheme } from "../../lib/theme/index.ts";
import type { TicketHeaderProps } from "./types.ts";

/**
 * Header showing ticket ID and summary
 */
export function TicketHeader(props: TicketHeaderProps) {
  const { theme } = useTheme();

  const displaySummary = () => props.summary ?? "No summary";

  return (
    <box flexDirection="column">
      <text fg={theme().text.primary}>
        <strong>
          {props.id}: {displaySummary()}
        </strong>
      </text>
      <box height={1}>
        <text fg={theme().border.default}>
          {"=".repeat(Math.min(60, props.id.length + displaySummary().length + 2))}
        </text>
      </box>
    </box>
  );
}
