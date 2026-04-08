/**
 * Dialog component - Structured modal with title and optional footer
 *
 * Built on top of Modal, provides consistent dialog patterns
 * with header, content area, and optional action buttons.
 *
 * @example
 * <Dialog
 *   isOpen={showDialog()}
 *   onClose={() => setShowDialog(false)}
 *   title="Confirm Action"
 * >
 *   <text>Are you sure?</text>
 * </Dialog>
 */

import { Show, type JSX } from "solid-js";
import { useTheme } from "../../lib/theme/index.ts";
import { Modal, type ModalProps } from "../modal/index.ts";

export interface DialogProps extends Omit<ModalProps, "children"> {
  /** Dialog title displayed in header */
  title?: string;
  /** Main dialog content */
  children: JSX.Element;
  /** Footer content (typically action buttons) */
  footer?: JSX.Element;
  /** Hint text shown at bottom (e.g., "Press Escape to close") */
  hint?: string;
}

/**
 * Structured dialog with title, content, and footer areas
 */
export function Dialog(props: DialogProps) {
  const { theme } = useTheme();

  return (
    <Modal
      isOpen={props.isOpen}
      onClose={props.onClose}
      lockId={props.lockId}
      width={props.width}
      height={props.height}
      border={props.border}
      borderStyle={props.borderStyle}
      closeOnEscape={props.closeOnEscape}
    >
      {/* Header */}
      <Show when={props.title}>
        <text fg={theme().primary}>
          <strong>{props.title}</strong>
        </text>
        <box height={1} />
      </Show>

      {/* Content */}
      <box flexGrow={1} flexDirection="column">
        {props.children}
      </box>

      {/* Footer */}
      <Show when={props.footer || props.hint}>
        <box height={1} />
        <Show when={props.footer}>{props.footer}</Show>
        <Show when={props.hint}>
          <text fg={theme().text.dim}>{props.hint}</text>
        </Show>
      </Show>
    </Modal>
  );
}
