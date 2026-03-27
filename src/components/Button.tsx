/**
 * Button component for Jiratown TUI
 *
 * Provides consistent button styling throughout the app
 */

import { For } from "solid-js";
import { colors } from "../lib/theme.ts";

export interface ButtonProps {
  /** Button label text */
  label: string;
  /** Button color (defaults to primary) */
  color?: string;
  /** Whether the button is currently focused/selected */
  focused?: boolean;
  /** Keyboard shortcut hint (shown before label) */
  shortcut?: string;
  /** Button variant */
  variant?: "default" | "primary" | "success" | "warning" | "danger";
}

/**
 * A simple text-based button with bracket styling
 *
 * @example
 * // Basic button
 * <Button label="Submit" />
 *
 * @example
 * // Button with shortcut
 * <Button label="New" shortcut="+" variant="success" />
 *
 * @example
 * // Danger button
 * <Button label="Delete" variant="danger" />
 */
export function Button(props: ButtonProps) {
  const buttonColor = () => {
    if (props.color) return props.color;

    switch (props.variant) {
      case "primary":
        return colors.primary;
      case "success":
        return colors.success;
      case "warning":
        return colors.warning;
      case "danger":
        return colors.error;
      default:
        return colors.text.secondary;
    }
  };

  const content = () => {
    if (props.shortcut) {
      return `${props.shortcut}:${props.label}`;
    }
    return props.label;
  };

  return (
    <text
      fg={props.focused ? colors.text.primary : buttonColor()}
      bg={props.focused ? buttonColor() : undefined}
    >
      [{content()}]
    </text>
  );
}

export interface KeyHintProps {
  /** The key to press */
  keyName: string;
  /** Description of what the key does */
  action: string;
  /** Whether to show in compact form */
  compact?: boolean;
}

/**
 * Displays a keyboard shortcut hint
 *
 * @example
 * <KeyHint keyName="q" action="quit" />
 * // Renders: [q] quit
 *
 * @example
 * <KeyHint keyName="Enter" action="confirm" compact />
 * // Renders: [Enter]
 */
export function KeyHint(props: KeyHintProps) {
  return (
    <box flexDirection="row">
      <text fg={colors.text.secondary}>[</text>
      <text fg={colors.primary}>{props.keyName}</text>
      <text fg={colors.text.secondary}>]</text>
      {!props.compact && (
        <text fg={colors.text.dim}> {props.action}</text>
      )}
    </box>
  );
}

export interface ActionBarProps {
  /** Array of action definitions */
  actions: Array<{ key: string; action: string }>;
}

/**
 * Displays a row of keyboard action hints
 *
 * @example
 * <ActionBar actions={[
 *   { key: "e", action: "escalate" },
 *   { key: "a", action: "switch agent" },
 *   { key: "j", action: "open jira" },
 * ]} />
 */
export function ActionBar(props: ActionBarProps) {
  return (
    <box flexDirection="row" gap={2}>
      <For each={props.actions}>
        {(action) => <KeyHint keyName={action.key} action={action.action} />}
      </For>
    </box>
  );
}
