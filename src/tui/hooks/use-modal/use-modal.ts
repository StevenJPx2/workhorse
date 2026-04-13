/**
 * useModal hook - Modal state management
 *
 * Provides a standardized way to manage modal open/close state
 * with optional data payload for passing context to the modal.
 */

import { createSignal, type Accessor } from "solid-js";

/**
 * Options for configuring the modal hook
 */
export interface UseModalOptions<T = undefined> {
  /** Initial open state */
  initialOpen?: boolean;
  /** Initial data payload */
  initialData?: T;
  /** Callback when modal opens */
  onOpen?: (data?: T) => void;
  /** Callback when modal closes */
  onClose?: () => void;
}

/**
 * Return value from useModal hook
 */
export interface UseModalReturn<T = undefined> {
  /** Whether the modal is currently open */
  isOpen: Accessor<boolean>;
  /** Data payload passed to the modal */
  data: Accessor<T | undefined>;
  /** Open the modal, optionally with data */
  open: (data?: T) => void;
  /** Close the modal */
  close: () => void;
  /** Toggle the modal state */
  toggle: () => void;
  /** Update the data payload without changing open state */
  setData: (data: T | undefined) => void;
}

/**
 * Hook for managing modal open/close state
 *
 * Supports optional data payload for passing context to the modal.
 *
 * @example
 * ```tsx
 * // Basic usage
 * const { isOpen, open, close } = useModal();
 *
 * // With typed data payload
 * interface TicketData {
 *   ticketId: string;
 *   summary: string;
 * }
 * const { isOpen, data, open, close } = useModal<TicketData>();
 *
 * // Open with data
 * open({ ticketId: 'AM-123', summary: 'Fix bug' });
 *
 * // In modal component
 * <Modal isOpen={isOpen()} onClose={close}>
 *   <text>Editing: {data()?.summary}</text>
 * </Modal>
 * ```
 */
export function useModal<T = undefined>(options: UseModalOptions<T> = {}): UseModalReturn<T> {
  const [isOpen, setIsOpen] = createSignal(options.initialOpen ?? false);
  const [data, setData] = createSignal<T | undefined>(options.initialData);

  const open = (payload?: T) => {
    if (payload !== undefined) {
      setData(() => payload);
    }
    setIsOpen(true);
    options.onOpen?.(payload ?? data());
  };

  const close = () => {
    setIsOpen(false);
    options.onClose?.();
  };

  const toggle = () => {
    if (isOpen()) {
      close();
    } else {
      open();
    }
  };

  return {
    isOpen,
    data,
    open,
    close,
    toggle,
    setData,
  };
}
