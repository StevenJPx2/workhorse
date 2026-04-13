/**
 * Command definitions for the command palette
 *
 * Creates the list of available commands based on app actions.
 */

import type { Command } from "../components/command-palette/index.ts";
import { themes } from "../theme/index.ts";
import type { ThemeName } from "#types/config.ts";

export interface CommandActions {
  /** Add new ticket */
  addTicket: () => void;
  /** Close current ticket */
  closeTicket: () => void;
  /** Open ticket in Jira */
  openInJira: () => void;
  /** Escalate / ask question */
  escalate: () => void;
  /** Switch agent */
  switchAgent: () => void;
  /** Toggle agent (start/stop) for current ticket */
  toggleAgent: () => void;
  /** Toggle help modal */
  toggleHelp: () => void;
  /** Quit application */
  quit: () => void;
  /** Set theme */
  setTheme: (theme: ThemeName) => void;
  /** Get current theme */
  currentTheme: () => ThemeName;
}

/**
 * Create commands array for the palette
 */
export function createCommands(actions: CommandActions): Command[] {
  return [
    // Ticket actions
    {
      id: "add-ticket",
      label: "Add New Ticket",
      shortcut: "n",
      category: "Tickets",
      type: "action",
      action: actions.addTicket,
    },
    {
      id: "close-ticket",
      label: "Close Current Ticket",
      shortcut: "x",
      category: "Tickets",
      type: "action",
      action: actions.closeTicket,
    },
    {
      id: "open-in-jira",
      label: "Open in Jira",
      shortcut: "o",
      category: "Tickets",
      type: "action",
      action: actions.openInJira,
    },
    {
      id: "escalate",
      label: "Escalate / Ask Question",
      shortcut: "e",
      category: "Tickets",
      type: "action",
      action: actions.escalate,
    },
    {
      id: "switch-agent",
      label: "Switch Agent",
      shortcut: "a",
      category: "Tickets",
      type: "action",
      action: actions.switchAgent,
    },
    {
      id: "toggle-agent",
      label: "Toggle Agent (Start/Stop)",
      shortcut: "s",
      category: "Tickets",
      type: "action",
      action: actions.toggleAgent,
    },

    // Theme submenu - generated from themes registry
    {
      id: "theme",
      label: "Change Theme",
      shortcut: "t",
      category: "Theme",
      type: "submenu",
      items: Object.keys(themes).map((name) => ({
        id: `theme-${name}`,
        label: name.charAt(0).toUpperCase() + name.slice(1),
        action: () => actions.setTheme(name as ThemeName),
        isActive: () => actions.currentTheme() === name,
      })),
    },

    // App actions
    {
      id: "show-help",
      label: "Show Help",
      shortcut: "?",
      category: "App",
      type: "action",
      action: actions.toggleHelp,
    },
    {
      id: "quit",
      label: "Quit Jiratown",
      shortcut: "q",
      category: "App",
      type: "action",
      action: actions.quit,
    },
  ];
}
