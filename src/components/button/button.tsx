/**
 * Button component for Jiratown TUI
 *
 * Supports filled/ghost styles, icons, sizes, hover, and click handling.
 */

import { useKeyboard } from "@opentui/solid";
import { useContext } from "solid-js";
import { useInteractive } from "../../hooks/index.ts";
import { useTheme } from "../../lib/theme/index.ts";
import { CellContext } from "../grid/index.ts";
import { getVariantBrightColor, getVariantColor } from "./button-colors.ts";

export interface ButtonProps {
  /** Button label text */
  label: string;
  /** Keyboard shortcut hint (shown before label, takes precedence over icon) */
  shortcut?: string;
  /** Button variant color */
  variant?: "default" | "primary" | "success" | "warning" | "danger";
  /** Custom color override */
  color?: string;
  /** Whether the button is currently focused/selected */
  focused?: boolean;
  /** Whether the button is disabled */
  disabled?: boolean;
  /** Icon character to display (ignored if shortcut is provided) */
  icon?: string;
  /** Icon position relative to label */
  iconPosition?: "left" | "right";
  /** Button style variant */
  style?: "filled" | "ghost";
  /** Button size */
  size?: "sm" | "md" | "lg";
  /** Click handler */
  onPress?: () => void;
}

/**
 * A button component with filled or ghost styles
 *
 * Filled style: colored background with light text, no border
 * Ghost style: transparent background with colored border/text
 *
 * @example
 * // Basic button
 * <Button label="Submit" />
 *
 * @example
 * // Button with icon
 * <Button label="New" icon="+" variant="success" onPress={handleNew} />
 *
 * @example
 * // Button with shortcut (icon ignored)
 * <Button label="New" shortcut="+" variant="success" />
 *
 * @example
 * // Ghost style (with border)
 * <Button label="Cancel" style="ghost" />
 *
 * @example
 * // Different sizes (affects padding)
 * <Button label="Sm" size="sm" />  // compact, no padding
 * <Button label="Md" size="md" />  // default padding
 * <Button label="Lg" size="lg" />  // extra padding
 */
export function Button(props: ButtonProps) {
  const { theme } = useTheme();
  const cell = useContext(CellContext);
  const { isHighlighted: interactiveHighlighted, interactiveProps } =
    useInteractive({
      disabled: props.disabled,
      onPress: props.onPress,
    });

  const buttonColor = () => {
    if (props.disabled) return theme().text.dim;
    if (props.color) return props.color;
    return getVariantColor(props.variant, theme());
  };

  const buttonBrightColor = () => {
    if (props.disabled) return theme().text.dim;
    return getVariantBrightColor(props.variant, theme());
  };

  const iconPos = () => props.iconPosition ?? "left";
  const buttonStyle = () => props.style ?? "filled";
  const isFilled = () => buttonStyle() === "filled";

  // Whether button is in highlighted state (focused via prop, grid context, or hovered)
  const isHighlighted = () => {
    // Explicit prop takes precedence
    if (props.focused) return true;
    // Check grid cell context
    if (cell?.isFocused()) return true;
    // Fall back to interactive hover state
    return interactiveHighlighted();
  };

  // Handle Enter key when button is focused in a grid cell
  useKeyboard((key) => {
    if (props.disabled) return;

    // Only handle if we're focused in a grid cell (or via explicit prop)
    const isFocused = props.focused || cell?.isFocused();
    if (!isFocused) return;

    // Activate on Enter
    if (key.name === "return" || key.name === "enter") {
      props.onPress?.();
    }
  });

  // Get horizontal padding based on size
  const paddingX = () => {
    switch (props.size) {
      case "sm":
        return 1;
      case "lg":
        return 3;
      default:
        return 2;
    }
  };

  // Build content based on shortcut vs icon
  const content = () => {
    // Shortcut takes precedence
    if (props.shortcut) {
      return `${props.shortcut}:${props.label}`;
    }

    // Icon handling
    if (props.icon) {
      const space = props.size === "sm" ? "" : " ";
      if (iconPos() === "right") {
        return `${props.label}${space}${props.icon}`;
      }
      return `${props.icon}${space}${props.label}`;
    }

    // Plain label
    return props.label;
  };

  // Text color based on style and state
  const textColor = () => {
    // Filled buttons always have light text
    if (isFilled()) return theme().text.primary;
    // Outline buttons use variant color, brighter on hover
    if (isHighlighted()) return theme().text.primary;
    return buttonColor();
  };

  // Background color based on style and state
  const bgColor = () => {
    if (isFilled()) {
      // Filled: always show the variant color, brighter when highlighted
      if (isHighlighted()) return buttonBrightColor();
      return buttonColor();
    }
    // Outline: subtle background on hover only
    if (isHighlighted()) return theme().bg.highlight;
    return undefined;
  };

  // Filled buttons: no border, just background
  // Outline buttons: border, no background (except on hover)
  return (
    <box
      backgroundColor={bgColor()}
      paddingX={paddingX()}
      alignItems="center"
      justifyContent="center"
      {...interactiveProps}
    >
      <text fg={textColor()}>{content()}</text>
    </box>
  );
}
