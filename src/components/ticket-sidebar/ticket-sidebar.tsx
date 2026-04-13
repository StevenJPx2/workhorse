/**
 * TicketSidebar component - Main sidebar containing ticket list
 */

import { type Accessor, For, Show } from "solid-js";
import { useNavigation } from "../../lib/navigation-context.ts";
import { useTheme } from "../../lib/theme/index.ts";
import type { Ticket } from "../../types/ticket.ts";
import { SidebarHeader } from "./sidebar-header.tsx";
import { TicketItem } from "./ticket-item.tsx";
import { useTicketNavigation } from "./use-ticket-navigation.ts";

export interface TicketSidebarProps {
  /** Reactive accessor for tickets list */
  tickets: Accessor<Ticket[]>;
  /** Currently selected ticket index */
  selectedIndex: number;
  /** Sidebar width in characters */
  width: number;
  /** Callback when a ticket is selected */
  onSelect: (index: number) => void;
  /** Callback when new ticket is requested */
  onNew: () => void;
  /** Whether keyboard navigation is disabled (e.g., modal open) */
  navigationDisabled?: () => boolean;
}

/**
 * Full-height sidebar displaying ticket list with navigation
 *
 * @example
 * <TicketSidebar
 *   tickets={tickets()}
 *   selectedIndex={selectedIndex()}
 *   onSelect={setSelectedIndex}
 *   onNew={() => openNewTicketModal()}
 * />
 */
export function TicketSidebar(props: TicketSidebarProps) {
  const { theme } = useTheme();
  const navigation = useNavigation();

  // Set up keyboard navigation (disabled when modals are open)
  useTicketNavigation({
    ticketCount: () => props.tickets().length,
    selectedIndex: () => props.selectedIndex,
    onSelect: props.onSelect,
    onNew: props.onNew,
    disabled: () => props.navigationDisabled?.() ?? navigation.isLocked(),
  });

  return (
    <box
      width={props.width}
      flexDirection="column"
      backgroundColor={theme().bg.elevated}
      borderStyle="rounded"
      borderColor={theme().bg.elevated}
    >
      {/* Header with title and new button */}
      <SidebarHeader onNew={props.onNew} />

      {/* Divider */}
      <box height={1}>
        <text fg={theme().border.dim}>{"─".repeat(Math.max(0, props.width - 2))}</text>
      </box>

      {/* Ticket list - using tickets() accessor for reactivity */}
      <Show when={props.tickets().length > 0} fallback={<EmptyState />}>
        <box flexDirection="column">
          <For each={props.tickets()}>
            {(ticket, index) => (
              <TicketItem
                ticket={ticket}
                isSelected={index() === props.selectedIndex}
                onSelect={() => props.onSelect(index())}
                width={props.width}
              />
            )}
          </For>
        </box>
      </Show>

      {/* Spacer to push branding to bottom */}
      <box flexGrow={1} />

      {/* Footer branding */}
      <box height={1} paddingX={1}>
        <text fg={theme().text.dim}>Jiratown</text>
      </box>
    </box>
  );
}

/** Empty state when no tickets exist */
function EmptyState() {
  const { theme } = useTheme();

  return (
    <box flexGrow={1} padding={1}>
      <text fg={theme().text.dim}>No tickets</text>
    </box>
  );
}
