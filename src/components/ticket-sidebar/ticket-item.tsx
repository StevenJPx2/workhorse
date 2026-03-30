/**
 * TicketItem component - A single clickable ticket row in the sidebar
 */

import { colors, getStatusConfig } from "../../lib/theme/index.ts";
import type { Ticket } from "../../types/ticket.ts";

export interface TicketItemProps {
  /** The ticket to display */
  ticket: Ticket;
  /** Whether this item is currently selected */
  isSelected: boolean;
  /** Callback when item is clicked or selected */
  onSelect: () => void;
  /** Sidebar width in characters */
  width: number;
}

/**
 * A single ticket row showing status indicator and ticket ID
 *
 * @example
 * <TicketItem
 *   ticket={ticket}
 *   isSelected={selectedIndex() === index}
 *   onSelect={() => setSelectedIndex(index)}
 * />
 */
export function TicketItem(props: TicketItemProps) {
  const statusConfig = () => getStatusConfig(props.ticket.status);

  return (
    <box>
      <box
        height={1}
        flexDirection="row"
        paddingX={2}
        backgroundColor={props.isSelected ? colors.bg.highlight : undefined}
        onMouseDown={props.onSelect}
      >
        {/* Status indicator */}
        <text fg={statusConfig().color}>{statusConfig().indicator}</text>

        {/* Spacing */}
        <text> </text>

        {/* Ticket ID */}
        <text
          fg={props.isSelected ? colors.text.primary : colors.text.secondary}
        >
          {props.ticket.id}
        </text>
      </box>
      {/* Divider */}
      <box height={1}>
        <text fg={colors.border.dim}>
          {"─".repeat(Math.max(0, props.width - 2))}
        </text>
      </box>
    </box>
  );
}
