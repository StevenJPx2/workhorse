/**
 * Type definitions for the global modal system
 */

import type { Accessor } from "solid-js";

/**
 * Known modal names in the application
 * Add new modals here for type safety
 */
export type ModalName = "ticket-input" | "help" | "confirm";

/**
 * Data payloads for each modal type
 */
export interface ModalDataMap {
  "ticket-input": undefined;
  help: undefined;
  confirm: { message: string; onConfirm: () => void };
}

/**
 * State for a single modal
 */
export interface ModalState<T = unknown> {
  isOpen: boolean;
  data: T | undefined;
}

/**
 * Complete modal system state
 */
export type ModalSystemState = {
  [K in ModalName]: ModalState<ModalDataMap[K]>;
};

/**
 * Return value from useModalSystem hook
 */
export interface UseModalSystemReturn {
  /** Check if a specific modal is open */
  isOpen: <K extends ModalName>(name: K) => boolean;
  /** Get data for a specific modal */
  getData: <K extends ModalName>(name: K) => ModalDataMap[K] | undefined;
  /** Open a modal by name, optionally with data */
  open: <K extends ModalName>(
    name: K,
    ...args: ModalDataMap[K] extends undefined ? [] : [ModalDataMap[K]]
  ) => void;
  /** Close a modal by name */
  close: (name: ModalName) => void;
  /** Close all open modals */
  closeAll: () => void;
  /** Toggle a modal by name */
  toggle: <K extends ModalName>(
    name: K,
    ...args: ModalDataMap[K] extends undefined ? [] : [ModalDataMap[K]]
  ) => void;
  /** Check if any modal is open */
  hasOpenModal: Accessor<boolean>;
}
