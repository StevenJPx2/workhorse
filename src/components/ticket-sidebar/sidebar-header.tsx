/**
 * SidebarHeader component - Title bar with clickable [+] New button
 */

import { colors } from "../../lib/theme/index.ts";

export interface SidebarHeaderProps {
  /** Callback when "New" button is clicked */
  onNew: () => void;
}

/**
 * Header for the ticket sidebar with title and new ticket button
 *
 * @example
 * <SidebarHeader onNew={() => openNewTicketModal()} />
 */
export function SidebarHeader(props: SidebarHeaderProps) {
  return (
    <box
      height={3}
      flexDirection="row"
      paddingTop={1}
      paddingX={1}
      justifyContent="space-between"
    >
      {/* Title */}
      <text fg={colors.text.secondary}>Tickets</text>

      {/* New button - clickable */}
      <box onMouseDown={props.onNew}>
        <text fg={colors.success}>[+] New</text>
      </box>
    </box>
  );
}
