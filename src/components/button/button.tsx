/**
 * Button component for Jiratown TUI
 *
 * Supports filled/outline styles, icons, sizes, hover, and click handling.
 */

import { createSignal } from "solid-js";
import { colors } from "../../lib/theme/index.ts";
import { getVariantColor, getVariantBrightColor } from "./button-colors.ts";

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
  style?: "filled" | "outline";
  /** Button size */
  size?: "sm" | "md" | "lg";
  /** Click handler */
  onPress?: () => void;
}

/**
 * A button component with filled or outline styles
 *
 * Filled style: colored background with light text, no border
 * Outline style: transparent background with colored border/text
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
 * // Outline style (with border)
 * <Button label="Cancel" style="outline" />
 *
 * @example
 * // Different sizes (affects padding)
 * <Button label="Sm" size="sm" />  // compact, no padding
 * <Button label="Md" size="md" />  // default padding
 * <Button label="Lg" size="lg" />  // extra padding
 */
export function Button(props: ButtonProps) {
  const [isHovered, setIsHovered] = createSignal(false);

  const buttonColor = () => {
    if (props.disabled) return colors.text.dim;
    if (props.color) return props.color;
    return getVariantColor(props.variant);
  };

  const buttonBrightColor = () => {
    if (props.disabled) return colors.text.dim;
    return getVariantBrightColor(props.variant);
  };

  const handlePress = () => {
    if (!props.disabled && props.onPress) {
      props.onPress();
    }
  };

  const handleMouseOver = () => {
    if (!props.disabled) {
      setIsHovered(true);
    }
  };

  const handleMouseOut = () => {
    setIsHovered(false);
  };

  const iconPos = () => props.iconPosition ?? "left";
  const buttonStyle = () => props.style ?? "filled";
  const isFilled = () => buttonStyle() === "filled";

  // Whether button is in highlighted state (focused or hovered)
  const isHighlighted = () => props.focused || isHovered();

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
    if (isFilled()) return colors.text.primary;
    // Outline buttons use variant color, brighter on hover
    if (isHighlighted()) return colors.text.primary;
    return buttonColor();
  };

  // Background color based on style and state
  const bgColor = () => {
    if (isFilled()) {
      // Filled: use brighter variant color on hover
      if (isHighlighted()) return buttonBrightColor();
      return buttonColor();
    }
    // Outline: subtle background on hover only
    if (isHighlighted()) return colors.bg.highlight;
    return undefined;
  };

  // Border color (outline style only)
  const borderColor = () => {
    if (isHighlighted()) return colors.border.focus;
    return buttonColor();
  };

  // Filled buttons have no border, outline buttons do
  const hasBorder = () => !isFilled();

  return (
    <box
      border={hasBorder()}
      borderStyle="single"
      borderColor={hasBorder() ? borderColor() : undefined}
      backgroundColor={bgColor()}
      paddingX={paddingX()}
      onMouseDown={handlePress}
      onMouseOver={handleMouseOver}
      onMouseOut={handleMouseOut}
    >
      <text fg={textColor()}>{content()}</text>
    </box>
  );
}
