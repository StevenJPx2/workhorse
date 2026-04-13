/**
 * StatusBadge component demo
 *
 * All ticket status indicators with different display modes.
 */

import { For } from "solid-js";
import { useTheme } from "../../theme/index.ts";
import { StatusBadge } from "../../components/status-badge/status-badge.tsx";
import type { TicketStatus } from "#types/ticket.ts";

const STATUSES: TicketStatus[] = [
  "pending",
  "queued",
  "planning",
  "implementing",
  "blocked",
  "pr_created",
  "in_review",
  "done",
];

export function StatusBadgeDemo() {
  const { theme } = useTheme();

  return (
    <box flexDirection="column" gap={2}>
      {/* Full badges */}
      <box flexDirection="column" gap={1}>
        <text fg={theme().text.secondary}>Full badges (indicator + label):</text>
        <box flexDirection="row" gap={2} flexWrap="wrap">
          <For each={STATUSES}>{(status) => <StatusBadge status={status} />}</For>
        </box>
      </box>

      {/* Indicator only */}
      <box flexDirection="column" gap={1}>
        <text fg={theme().text.secondary}>Indicator only:</text>
        <box flexDirection="row" gap={2}>
          <For each={STATUSES}>{(status) => <StatusBadge status={status} showLabel={false} />}</For>
        </box>
      </box>

      {/* Compact mode */}
      <box flexDirection="column" gap={1}>
        <text fg={theme().text.secondary}>Compact (no padding/border):</text>
        <box flexDirection="row" gap={3}>
          <For each={STATUSES}>{(status) => <StatusBadge status={status} compact />}</For>
        </box>
      </box>

      {/* Label only */}
      <box flexDirection="column" gap={1}>
        <text fg={theme().text.secondary}>Label only:</text>
        <box flexDirection="row" gap={2}>
          <For each={STATUSES}>
            {(status) => <StatusBadge status={status} showIndicator={false} />}
          </For>
        </box>
      </box>
    </box>
  );
}
