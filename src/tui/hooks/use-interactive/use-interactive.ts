/**
 * useInteractive hook - Standardized hover/press state management
 *
 * Provides a consistent way to handle interactive states for clickable elements,
 * eliminating repetitive state management code across components.
 */

import { createSignal, type Accessor } from "solid-js";

export interface UseInteractiveOptions {
  /** Disable all interactions */
  disabled?: boolean;
  /** Click/press handler */
  onPress?: () => void;
  /** Hover state change callback */
  onHover?: (hovered: boolean) => void;
}

/**
 * Props object that can be spread onto an interactive element.
 * Use with spread syntax: `<box {...interactiveProps}>`
 */
export interface InteractiveProps {
  /** Mouse entered element */
  onMouseOver: () => void;
  /** Mouse left element */
  onMouseOut: () => void;
  /** Mouse button pressed */
  onMouseDown: () => void;
  /** Mouse button released */
  onMouseUp: () => void;
}

export interface UseInteractiveReturn {
  /** Currently hovered */
  isHovered: Accessor<boolean>;
  /** Currently being pressed */
  isPressed: Accessor<boolean>;
  /** Alias for isHovered (convenience for styling) */
  isHighlighted: Accessor<boolean>;
  /**
   * Props to spread onto the interactive element.
   * @example `<box {...interactiveProps}>`
   */
  interactiveProps: InteractiveProps;
}

/**
 * Hook for managing interactive element states
 *
 * Returns `interactiveProps` which should be spread onto the element.
 * This ensures all handlers are attached consistently.
 *
 * @example
 * ```tsx
 * function Button(props: ButtonProps) {
 *   const { theme } = useTheme();
 *   const { isHighlighted, interactiveProps } = useInteractive({
 *     disabled: props.disabled,
 *     onPress: props.onPress,
 *   });
 *
 *   const bgColor = () => isHighlighted() ? theme().bg.highlight : theme().bg.base;
 *
 *   return (
 *     <box backgroundColor={bgColor()} {...interactiveProps}>
 *       <text>{props.label}</text>
 *     </box>
 *   );
 * }
 * ```
 */
export function useInteractive(options: UseInteractiveOptions = {}): UseInteractiveReturn {
  const [isHovered, setIsHovered] = createSignal(false);
  const [isPressed, setIsPressed] = createSignal(false);

  // isHighlighted is an alias for isHovered in TUI context
  const isHighlighted = isHovered;

  const interactiveProps: InteractiveProps = {
    onMouseOver: () => {
      if (options.disabled) return;
      setIsHovered(true);
      options.onHover?.(true);
    },

    onMouseOut: () => {
      setIsHovered(false);
      setIsPressed(false);
      options.onHover?.(false);
    },

    onMouseDown: () => {
      if (options.disabled) return;
      setIsPressed(true);
      options.onPress?.();
    },

    onMouseUp: () => {
      setIsPressed(false);
    },
  };

  return {
    isHovered,
    isPressed,
    isHighlighted,
    interactiveProps,
  };
}
