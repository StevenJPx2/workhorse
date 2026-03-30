/**
 * TicketItem component - A single clickable ticket row in the sidebar
 */

import { createSignal } from "solid-js";
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
  const [isHovered, setIsHovered] = createSignal(false);
  const statusConfig = () => getStatusConfig(props.ticket.status);

  // Show highlight when selected or hovered
  const isHighlighted = () => props.isSelected || isHovered();

  // Background color: selected gets highlight, hovered gets subtle elevated bg
  const bgColor = () => {
    if (props.isSelected) return colors.bg.highlight;
    if (isHovered()) return colors.bg.elevated;
    return undefined;
  };

  // Text color: brighter when highlighted
  const textColor = () =>
    isHighlighted() ? colors.text.primary : colors.text.secondary;

  return (
    <box>
      <box
        height={1}
        flexDirection="row"
        paddingX={2}
        backgroundColor={bgColor()}
        onMouseDown={props.onSelect}
        onMouseOver={() => setIsHovered(true)}
        onMouseOut={() => setIsHovered(false)}
      >
        {/* Status indicator */}
        <text fg={statusConfig().color}>{statusConfig().indicator}</text>

        {/* Spacing */}
        <text> </text>

        {/* Ticket ID */}
        <text fg={textColor()}>{props.ticket.id}</text>
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
