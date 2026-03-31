/**
 * SidebarHeader component - Title bar with clickable [+] New button
 */

import { useTheme } from "../../lib/theme/index.ts";
import { Button, icons } from "../button/index.ts";

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
  const { theme } = useTheme();

  return (
    <box
      height={3}
      flexDirection="row"
      alignItems="center"
      paddingX={1}
      justifyContent="space-between"
    >
      {/* Title */}
      <text fg={theme().text.secondary}>Tickets</text>

      {/* New button */}
      <Button
        label="New"
        icon={icons.add}
        variant="success"
        onPress={props.onNew}
      />
    </box>
  );
}
