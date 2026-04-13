/**
 * Modal component - Base overlay for dialogs and palettes
 *
 * Renders children in a centered, absolutely positioned container
 * with a semi-transparent backdrop effect (via elevated background).
 *
 * @example
 * <Modal
 *   isOpen={showModal()}
 *   onClose={() => setShowModal(false)}
 *   lockId="my-modal"
 * >
 *   <text>Modal content here</text>
 * </Modal>
 */

import { useKeyboard, useTerminalDimensions } from "@opentui/solid";
import { createEffect, type JSX, onCleanup, Show } from "solid-js";
import { useKeyboardContext } from "../../contexts/keyboard-context.ts";
import { type NavigationLock, useNavigation } from "../../contexts/navigation-context.ts";
import { useTheme } from "../../theme/index.ts";
import { spacing } from "../../theme/presets.ts";

export interface ModalProps {
  /** Whether the modal is visible */
  isOpen: boolean;
  /** Called when user presses Escape */
  onClose?: () => void;
  /** Lock ID for navigation control (used for keyboard focus management) */
  lockId: string;
  /** Modal width in columns */
  width?: number;
  /** Modal height in rows */
  height?: number;
  /** Modal content */
  children: JSX.Element;
  /** Whether to show border */
  border?: boolean;
  /** Border style */
  borderStyle?: "single" | "double" | "rounded";
  /** Whether pressing Escape closes the modal */
  closeOnEscape?: boolean;
}

/**
 * Base modal overlay component
 *
 * Centers content in the terminal with theme-aware styling.
 * Use Dialog component for standard dialog patterns.
 */
export function Modal(props: ModalProps) {
  const dimensions = useTerminalDimensions();
  const { theme } = useTheme();
  const navigation = useNavigation();
  const keyboard = useKeyboardContext();

  let lock: NavigationLock | undefined;

  const width = () => Math.min(props.width ?? 60, dimensions().width);
  const height = () => Math.min(props.height ?? 20, dimensions().height);
  const left = () => Math.max(0, Math.floor((dimensions().width - width()) / 2));
  const top = () => Math.max(0, Math.floor((dimensions().height - height()) / 2));

  const showBorder = () => props.border ?? true;
  const borderStyle = () => props.borderStyle ?? "rounded";
  const closeOnEscape = () => props.closeOnEscape ?? true;

  // Acquire/release navigation lock based on open state
  createEffect(() => {
    if (props.isOpen) {
      lock = navigation.acquireLock(props.lockId);
    } else {
      lock?.release();
      lock = undefined;
    }
  });

  // Ensure lock is released on unmount
  onCleanup(() => {
    lock?.release();
  });

  useKeyboard((key) => {
    if (!props.isOpen) return;

    // Don't process if another input has focus
    if (keyboard.isInputMode()) return;

    if (key.name === "escape" && closeOnEscape() && props.onClose) {
      props.onClose();
    }
  });

  return (
    <Show when={props.isOpen}>
      <box
        position="absolute"
        left={left()}
        top={top()}
        width={width()}
        height={height()}
        border={showBorder()}
        borderStyle={borderStyle()}
        borderColor={theme().border.dim}
        backgroundColor={theme().bg.elevated}
        flexDirection="column"
        padding={spacing.sm}
      >
        {props.children}
      </box>
    </Show>
  );
}
