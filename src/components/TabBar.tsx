/**
 * TabBar component for Jiratown TUI
 *
 * Displays ticket tabs and allows switching between them
 */

import { useKeyboard } from "@opentui/solid";
import { createSignal, For, Show } from "solid-js";
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

  // Keyboard navigation for tabs
  useKeyboard((key) => {
    // Tab key cycles through tabs
    if (key.name === "tab" && !key.shift) {
      const next = (selected() + 1) % Math.max(tickets().length, 1);
      props.onSelect?.(next);
    }
    if (key.name === "tab" && key.shift) {
      const prev = selected() === 0 ? Math.max(tickets().length - 1, 0) : selected() - 1;
      props.onSelect?.(prev);
    }

    // Number keys 1-9 for quick tab switching
    const num = parseInt(key.name, 10);
    if (num >= 1 && num <= 9 && num <= tickets().length) {
      props.onSelect?.(num - 1);
    }

    // + or n to add new ticket
    if (key.name === "+" || key.name === "n") {
      props.onNew?.();
    }
  });

  return (
    <box height={1} flexDirection="row" gap={1} paddingLeft={1}>
      {/* New ticket button */}
      <box
        paddingLeft={1}
        paddingRight={1}
        border="single"
        borderColor="green"
      >
        <text color="green">[+] New</text>
      </box>

      {/* Ticket tabs */}
      <For each={tickets()}>
        {(ticket, index) => (
          <Tab
            ticket={ticket}
            isSelected={index() === selected()}
            index={index()}
            onSelect={() => props.onSelect?.(index())}
          />
        )}
      </For>

      {/* Show hint if no tickets */}
      <Show when={tickets().length === 0}>
        <text color="gray" italic>
          Press [+] or [n] to add a ticket
        </text>
      </Show>
    </box>
  );
}

interface TabProps {
  ticket: Ticket;
  isSelected: boolean;
  index: number;
  onSelect: () => void;
}

function Tab(props: TabProps) {
  const statusColor = () => {
    switch (props.ticket.status) {
      case "blocked":
        return "red";
      case "done":
        return "green";
      case "implementing":
        return "yellow";
      case "planning":
        return "blue";
      case "pr_created":
      case "in_review":
        return "magenta";
      default:
        return "white";
    }
  };

  const statusIndicator = () => {
    switch (props.ticket.status) {
      case "blocked":
        return "!";
      case "done":
        return "*";
      case "implementing":
      case "planning":
        return ">";
      default:
        return " ";
    }
  };

  return (
    <box
      paddingLeft={1}
      paddingRight={1}
      border="single"
      borderColor={props.isSelected ? "cyan" : "gray"}
      backgroundColor={props.isSelected ? "blue" : undefined}
    >
      <text color={statusColor()}>
        {statusIndicator()}
      </text>
      <text color={props.isSelected ? "white" : "gray"}>
        {props.ticket.id}
      </text>
    </box>
  );
}
