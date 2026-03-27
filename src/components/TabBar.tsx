/**
 * TabBar component for Jiratown TUI
 *
 * Displays ticket tabs as styled boxes
 */

import { useKeyboard } from "@opentui/solid";
import { For, Show } from "solid-js";
import { colors, getStatusConfig } from "../lib/theme.ts";
import type { Ticket } from "../types/ticket.ts";

export interface TabBarProps {
  /** List of open tickets */
  tickets?: Ticket[];
  /** Currently selected ticket index */
  selectedIndex?: number;
  /** Callback when tab is selected */
  onSelect?: (index: number) => void;
  /** Callback when new tab is requested */
  onNew?: () => void;
}

export function TabBar(props: TabBarProps) {
  const tickets = () => props.tickets ?? [];
  const selected = () => props.selectedIndex ?? 0;

  // Keyboard shortcuts
  useKeyboard((key) => {
    // + or n to add new ticket
    if (key.name === "+" || key.name === "n") {
      props.onNew?.();
    }
    // Tab to cycle through tickets
    if (key.name === "tab" && !key.shift && tickets().length > 0) {
      const next = (selected() + 1) % tickets().length;
      props.onSelect?.(next);
    }
    if (key.name === "tab" && key.shift && tickets().length > 0) {
      const prev = selected() === 0 ? tickets().length - 1 : selected() - 1;
      props.onSelect?.(prev);
    }
    // Number keys 1-9 for quick tab switching
    const num = parseInt(key.name, 10);
    if (num >= 1 && num <= 9 && num <= tickets().length) {
      props.onSelect?.(num - 1);
    }
  });

  return (
    <box
      height={3}
      flexDirection="row"
      gap={1}
      paddingLeft={1}
      backgroundColor={colors.bg.shell}
    >
      {/* New ticket tab */}
      <box
        paddingLeft={1}
        paddingRight={1}
        border={true}
        borderStyle="rounded"
        borderColor={colors.success}
        backgroundColor={colors.bg.base}
      >
        <text fg={colors.success}>+</text>
      </box>

      {/* Ticket tabs */}
      <Show
        when={tickets().length > 0}
        fallback={
          <box paddingLeft={1} alignItems="center">
            <text fg={colors.text.dim}>Press + or n to add a ticket</text>
          </box>
        }
      >
        <For each={tickets()}>
          {(ticket, index) => {
            const config = getStatusConfig(ticket.status);
            const isSelected = () => index() === selected();
            return (
              <box
                paddingLeft={1}
                paddingRight={1}
                border={["top", "right", "left"]}
                borderStyle={isSelected() ? "double" : "single"}
                borderColor={isSelected() ? colors.primary : colors.border.dim}
                backgroundColor={
                  isSelected() ? colors.bg.base : colors.bg.elevated
                }
                flexDirection="row"
              >
                <text fg={config.color}>{config.indicator}</text>
                <text fg={isSelected() ? colors.text.primary : colors.text.dim}>
                  {" "}
                  {ticket.id}
                </text>
              </box>
            );
          }}
        </For>
      </Show>
    </box>
  );
}
