/**
 * TicketItem component - A single clickable ticket row in the sidebar
 */

import { useTheme, getStatusConfig } from "../../theme/index.ts";
import { useInteractive } from "../../hooks/index.ts";
import type { Ticket } from "#types/ticket.ts";

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
  const { theme } = useTheme();
  const { isHovered, interactiveProps } = useInteractive({
    onPress: props.onSelect,
  });
  const statusConfig = () => getStatusConfig(props.ticket.status, theme());

  // Show highlight when selected or hovered
  const isHighlighted = () => props.isSelected || isHovered();

  // Background color: selected gets highlight, hovered gets subtle elevated bg
  const bgColor = () => {
    if (props.isSelected) return theme().bg.highlight;
    if (isHovered()) return theme().bg.elevated;
    return undefined;
  };

  // Text color: brighter when highlighted
  const textColor = () => (isHighlighted() ? theme().text.primary : theme().text.secondary);

  // Truncate ID to fit: width - 2 (border) - 4 (paddingX*2) - 1 (indicator) - 1 (space)
  const displayId = () => {
    const maxLen = props.width - 8;
    const id = props.ticket.id;
    if (maxLen > 3 && id.length > maxLen) {
      return id.slice(0, maxLen - 1) + "…";
    }
    return id;
  };

  return (
    <box>
      <box
        height={1}
        flexDirection="row"
        paddingX={2}
        backgroundColor={bgColor()}
        {...interactiveProps}
      >
        {/* Status indicator */}
        <text fg={statusConfig().color}>{statusConfig().indicator}</text>

        {/* Spacing */}
        <text> </text>

        {/* Ticket ID */}
        <text fg={textColor()}>{displayId()}</text>
      </box>
      {/* Divider */}
      <box height={1}>
        <text fg={theme().border.dim}>{"─".repeat(Math.max(0, props.width - 2))}</text>
      </box>
    </box>
  );
}
