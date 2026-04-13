/**
 * Command types for the command palette
 *
 * Supports both simple actions and submenus for hierarchical commands.
 */

/** Category for organizing commands */
export type CommandCategory = "Tickets" | "Navigation" | "App" | "Theme";

/** Base command properties shared by all command types */
export interface CommandBase {
  /** Unique identifier */
  id: string;
  /** Display label */
  label: string;
  /** Keyboard shortcut hint (e.g., "n", "Ctrl+P") */
  shortcut?: string;
  /** Category for grouping */
  category?: CommandCategory;
  /** Icon character (optional, single char like emoji or symbol) */
  icon?: string;
}

/** Simple command that executes an action */
export interface ActionCommand extends CommandBase {
  type: "action";
  /** Action to execute when command is selected */
  action: () => void;
}

/** Submenu item within a submenu command */
export interface SubmenuItem {
  /** Unique identifier */
  id: string;
  /** Display label */
  label: string;
  /** Action to execute when selected */
  action: () => void;
  /** Whether this item is currently active/selected */
  isActive?: () => boolean;
}

/** Command that opens a submenu */
export interface SubmenuCommand extends CommandBase {
  type: "submenu";
  /** Items in the submenu */
  items: SubmenuItem[];
}

/** Union type for all command types */
export type Command = ActionCommand | SubmenuCommand;

/** Helper to check if command is an action */
export function isActionCommand(cmd: Command): cmd is ActionCommand {
  return cmd.type === "action";
}

/** Helper to check if command is a submenu */
export function isSubmenuCommand(cmd: Command): cmd is SubmenuCommand {
  return cmd.type === "submenu";
}
