/**
 * Button component for Jiratown TUI
 */

import { colors } from "../../lib/theme/index.ts";

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
