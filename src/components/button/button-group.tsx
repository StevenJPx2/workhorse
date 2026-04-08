/**
 * ButtonGroup component for Jiratown TUI
 *
 * Renders a horizontal group of buttons with consistent spacing.
 */

import { For } from "solid-js";
import { Button } from "./button.tsx";

export interface ButtonGroupItem {
  /** Button label text */
  label: string;
  /** Keyboard shortcut (displayed as shortcut:label) */
  shortcut?: string;
  /** Icon to display */
  icon?: string;
  /** Button variant */
  variant?: "default" | "primary" | "success" | "warning" | "danger";
  /** Click handler */
  onPress?: () => void;
  /** Whether the button is disabled */
  disabled?: boolean;
}

export interface ButtonGroupProps {
  /** Array of button definitions */
  buttons: ButtonGroupItem[];
  /** Button style for all buttons in the group */
  style?: "filled" | "ghost";
  /** Button size for all buttons in the group */
  size?: "sm" | "md" | "lg";
  /** Gap between buttons (default: 1) */
  gap?: number;
  /** Horizontal alignment of buttons */
  align?: "left" | "center" | "right";
}

/**
 * A horizontal group of buttons with consistent styling
 *
 * @example
 * <ButtonGroup
 *   buttons={[
 *     { label: "Save", shortcut: "s", variant: "primary" },
 *     { label: "Cancel", shortcut: "c" },
 *   ]}
 *   style="ghost"
 *   size="sm"
 * />
 */
export function ButtonGroup(props: ButtonGroupProps) {
  const gap = () => props.gap ?? 1;

  const justifyContent = () => {
    switch (props.align) {
      case "center":
        return "center";
      case "right":
        return "flex-end";
      default:
        return "flex-start";
    }
  };

  return (
    <box flexDirection="row" gap={gap()} justifyContent={justifyContent()}>
      <For each={props.buttons}>
        {(button) => (
          <Button
            label={button.label}
            shortcut={button.shortcut}
            icon={button.icon}
            variant={button.variant}
            style={props.style}
            size={props.size}
            disabled={button.disabled}
            onPress={button.onPress}
          />
        )}
      </For>
    </box>
  );
}
