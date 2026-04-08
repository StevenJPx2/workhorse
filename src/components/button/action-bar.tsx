/**
 * ActionBar component for Jiratown TUI
 *
 * Displays a row of keyboard action buttons using ButtonGroup.
 */

import { ButtonGroup, type ButtonGroupItem } from "./button-group.tsx";

export interface ActionBarAction {
  /** Keyboard shortcut key */
  key: string;
  /** Action description/label */
  action: string;
  /** Button variant */
  variant?: "default" | "primary" | "success" | "warning" | "danger";
  /** Click handler */
  onPress?: () => void;
  /** Whether the action is disabled */
  disabled?: boolean;
}

export interface ActionBarProps {
  /** Array of action definitions */
  actions: ActionBarAction[];
  /** Button size (default: sm) */
  size?: "sm" | "md" | "lg";
  /** Horizontal alignment (default: right) */
  align?: "left" | "center" | "right";
}

/**
 * Displays a row of keyboard action buttons
 *
 * @example
 * <ActionBar actions={[
 *   { key: "e", action: "escalate" },
 *   { key: "a", action: "switch agent" },
 *   { key: "j", action: "open jira" },
 * ]} />
 */
export function ActionBar(props: ActionBarProps) {
  // Convert actions to ButtonGroup items
  const buttons = (): ButtonGroupItem[] =>
    props.actions.map((action) => ({
      label: action.action,
      shortcut: action.key,
      variant: action.variant,
      onPress: action.onPress,
      disabled: action.disabled,
    }));

  return (
    <ButtonGroup
      buttons={buttons()}
      style="ghost"
      size={props.size ?? "sm"}
      gap={1}
      align={props.align ?? "right"}
    />
  );
}
