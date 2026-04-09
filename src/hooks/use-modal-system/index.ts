/**
 * useModalSystem hook exports
 *
 * Provides global modal state management allowing components to open/close
 * modals by name from anywhere in the component tree.
 */

// Types
export type {
  ModalName,
  ModalDataMap,
  ModalState,
  ModalSystemState,
  UseModalSystemReturn,
} from "./types.ts";

// Context and hook
export {
  ModalSystemProvider,
  useModalSystem,
  type ModalSystemProviderProps,
} from "./modal-context.tsx";
